import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { ToolLoopAdapter } from '../tool-loop-adapter';
import { formatInterruptionMessage } from '../circuit-breaker';
import type { AgentRunInput } from '@/shared/types/agent';
import type { IToolRegistry, ToolDefinition, ToolResult } from '@/registry/types';
import { ToolRegistry } from '@/registry/tool-registry';
import type { IGuardrail, GuardrailCheck } from '@/shared/types/guardrail';
import type { StoredMessage } from '@/shared/types/conversation';
import type { DbMessage } from '@/shared/types/storage';
import type { ProviderConfig } from '@/shared/types/llm';
import { Database } from '@/shared/db/database';
import { ConversationManager } from '@/conversation/conversation-manager';
import { DB_NAME } from '@/shared/db/schema';
import { reconstructToolProtocol } from '@/shared/tool-protocol';

/**
 * #229 回归：真实 IndexedDB + ConversationManager + AI SDK 协议校验。
 *
 * 同毫秒写入时，[conversationId, timestamp] 索引按主键（消息 id）升序返回；
 * 工具结果行曾以自己的 toolCallId 作为主键，若其字典序小于随机 assistant id，
 * 就会排在调用消息之前。旧实现按行序遍历，先遇到 tool 行时找不到挂起的调用，
 * 于是丢弃真实结果，下一轮把「只有 tool-call、没有 tool-result」的历史发给
 * 模型，AI SDK 抛 MissingToolResultsError，续聊中断。
 *
 * 这里只 mock ToolLoopAgent（隔离模型网络），DB、ConversationManager、
 * generateText 与 MockLanguageModelV4 都是真实实现，由 AI SDK 做协议校验。
 *
 * #230 起新工具结果行使用独立 UUID + parentMessageId 关联调用行；本文件同时
 * 覆盖重复 toolCallId、跨会话同名结果、旧数据归属不明等场景。
 */

interface CapturedAgentOptions {
  stopWhen?: Array<(input: { steps: unknown[] }) => boolean>;
}

const capturedAgentOptions: CapturedAgentOptions[] = [];
const streamMock = vi.fn();
const generateTextMock = vi.hoisted(() => vi.fn());
// 真实实现引用：默认透传，避免影响用真实 generateText 做协议校验的用例
const realGenerateText = vi.hoisted(() => ({
  current: undefined as unknown as typeof import('ai').generateText,
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  realGenerateText.current = actual.generateText;
  return {
    ...actual,
    generateText: generateTextMock,
    ToolLoopAgent: vi.fn().mockImplementation((options: CapturedAgentOptions) => {
      capturedAgentOptions.push(options);
      return { stream: streamMock };
    }),
  };
});

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn().mockReturnValue({
    chatModel: vi.fn().mockReturnValue({}),
  }),
}));

const PROVIDER_CONFIG: ProviderConfig = {
  id: 'test-provider',
  name: 'Test Provider',
  providerId: 'test',
  endpoint: 'https://api.test.com/v1',
  apiKey: 'test-key',
  isLocalTrusted: false,
};

const GUARDRAIL: IGuardrail = {
  check: vi.fn().mockResolvedValue({
    allowed: true,
    riskLevel: 'low',
    requiresPreflight: false,
    reason: '允许执行',
    dataSensitivity: 'low',
  } satisfies GuardrailCheck),
  filterResultForRemote: vi.fn().mockImplementation(
    (_tool: { resultSensitivity: string }, result: ToolResult) => result,
  ),
};

function createTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} 工具`,
    category: 'tabs',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID' } },
      required: ['id'],
    },
    execute: vi.fn().mockResolvedValue({ success: true, data: { ok: true } }),
  };
}

function emptyStream(): AsyncGenerator<never> {
  return (async function* () {})() as AsyncGenerator<never>;
}

function mockFinalText(text: string): void {
  streamMock.mockImplementationOnce(async () => ({
    stream: emptyStream(),
    finalStep: Promise.resolve({ text, usage: { inputTokens: 10, outputTokens: 5 } }),
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
  }));
}

interface MockToolStep {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  result: ToolResult;
}

/** 模拟一次含若干工具步骤的 run：同一次 run 内所有落库时间戳相同 */
function mockToolSteps(steps: MockToolStep[], finalText = '完成'): void {
  streamMock.mockImplementationOnce(async (options: {
    onStepFinish: (step: unknown) => void;
  }) => {
    for (const step of steps) {
      options.onStepFinish({
        toolCalls: [{
          toolCallId: step.toolCallId,
          toolName: step.toolName,
          input: step.input,
        }],
        toolResults: [{ toolCallId: step.toolCallId, output: step.result }],
        content: [],
      });
    }
    return {
      stream: emptyStream(),
      finalStep: Promise.resolve({ text: finalText, usage: { inputTokens: 10, outputTokens: 5 } }),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    };
  });
}

/** 用真实 AI SDK 校验消息序列可被 provider 接受（缺失/重复结果会抛错） */
async function validateWithAiSdk(messages: ModelMessage[]): Promise<void> {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'ok' }],
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    }),
  });

  await expect(
    // 直接调用真实实现：压缩用例会把 mock 改成 mockResolvedValue，
    // 协议校验必须始终经过 AI SDK 的真实生成路径。
    realGenerateText.current({ model, messages, allowSystemInMessages: true }),
  ).resolves.toBeDefined();
}

interface ToolResultPartShape {
  type: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: { type: string; value?: unknown };
}

function assistantToolCalls(message: ModelMessage): ToolResultPartShape[] {
  if (message.role !== 'assistant' || !Array.isArray(message.content)) return [];
  return (message.content as ToolResultPartShape[]).filter((part) => part.type === 'tool-call');
}

function toolResultParts(message: ModelMessage): ToolResultPartShape[] {
  if (message.role !== 'tool' || !Array.isArray(message.content)) return [];
  return message.content as ToolResultPartShape[];
}

function parseToolCalls(raw: string | undefined): StoredMessage['toolCalls'] {
  return raw ? (JSON.parse(raw) as StoredMessage['toolCalls']) : [];
}

describe('ToolLoopAdapter 历史重放（#229）', () => {
  let db: Database;
  let conversationManager: ConversationManager;
  let conversationId: string;
  let registry: IToolRegistry;
  let adapter: ToolLoopAdapter;
  let nowValue: number;
  let dateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    capturedAgentOptions.length = 0;
    streamMock.mockReset();
    generateTextMock.mockReset();
    generateTextMock.mockImplementation(realGenerateText.current);
    vi.mocked(GUARDRAIL.check).mockClear();

    Database.resetInstance();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });

    nowValue = Date.now() - 60_000;
    dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => nowValue);

    db = Database.getInstance();
    conversationManager = new ConversationManager(db);
    conversationId = (await conversationManager.create('历史重放测试')).id;

    registry = new ToolRegistry();
    registry.register(createTool('tabs_query'));

    adapter = new ToolLoopAdapter(
      registry,
      GUARDRAIL,
      conversationManager,
      PROVIDER_CONFIG,
      'test-model',
    );
  });

  afterEach(() => {
    dateSpy.mockRestore();
    Database.resetInstance();
  });

  function makeInput(userMessage: string): AgentRunInput {
    return {
      conversationId,
      userMessage,
      providerConfig: PROVIDER_CONFIG,
      model: 'test-model',
      browserContext: { tabs: [], windows: [], activeTabId: undefined },
    };
  }

  it('熔断后的下一轮：同毫秒 assistant/tool 行按 parent 关联紧邻配对并通过协议校验', async () => {
    const failures = [1, 2, 3].map((index) => ({
      // 以 '0-' 开头保证工具结果主键字典序小于任意随机 UUID 的 assistant id
      toolCallId: `0-fail-${index}`,
      toolName: 'tabs_query',
      input: { id: `tab-${index}` },
      result: { success: false as const, error: `标签页 tab-${index} 不存在` },
    }));

    streamMock.mockImplementationOnce(async (options: {
      onStepFinish: (step: unknown) => void;
    }) => {
      // assistant / tool 行同毫秒落库（模拟一批快速写入）
      nowValue = Date.now() + 10_000;

      const steps = failures.map((failure) => ({
        toolCalls: [{
          toolCallId: failure.toolCallId,
          toolName: failure.toolName,
          input: failure.input,
        }],
        toolResults: [{ toolCallId: failure.toolCallId, output: failure.result }],
        content: [],
      }));
      for (const step of steps) {
        options.onStepFinish(step);
      }

      // 按 AI SDK 的语义调用 ToolLoopAgent 的 stopWhen：连续 3 次失败应熔断
      const stopConditions = capturedAgentOptions.at(-1)?.stopWhen ?? [];
      const tripped = stopConditions.some((condition) => condition({ steps }));
      expect(tripped).toBe(true);

      return {
        stream: emptyStream(),
        finalStep: Promise.resolve({
          text: '',
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      };
    });
    mockFinalText('好的，我先看看当前状态。');

    const firstRun = await adapter.run(makeInput('帮我查三个标签页'));
    expect(firstRun.stopReason).toBe('interrupted');
    expect(firstRun.finalMessage).toBe(
      formatInterruptionMessage(firstRun.interruption!),
    );

    // #230：新工具行使用独立 UUID，并通过 parentMessageId 关联调用行；
    // 读取顺序不再依赖随机 UUID 与 toolCallId 的字典序。
    const stored = await db.getMessagesByConversation(conversationId);
    for (const failure of failures) {
      const toolRow = stored.find((message) => message.role === 'tool'
        && message.toolCallId === failure.toolCallId
        && message.content === JSON.stringify(failure.result));
      const callRow = stored.find((message) => message.role === 'assistant'
        && parseToolCalls(message.toolCalls).some((call) => call.id === failure.toolCallId));
      expect(toolRow).toBeDefined();
      expect(callRow).toBeDefined();
      // 同一批写入分配严格递增的逻辑时间戳：调用行在前、结果行紧随其后
      expect(toolRow!.timestamp).toBe(callRow!.timestamp + 1);
      expect(toolRow!.parentMessageId).toBe(callRow!.id);
      // 原始 toolCallId 与结果内容保持独立，不被新主键改写
      expect(toolRow!.id).not.toBe(failure.toolCallId);
    }

    // 提升时间戳，保证第二轮的用户消息排在首轮历史之后（不受同毫秒 UUID 排序影响）
    nowValue += 10_000;

    // 第二轮：真实 ConversationManager 读回同样乱序的历史
    const secondInput = makeInput('继续');
    await adapter.run(secondInput);
    const secondRunMessages = streamMock.mock.calls[1]?.[0]?.messages as ModelMessage[];
    expect(secondRunMessages).toBeDefined();

    // 协议校验（修复前：MissingToolResultsError）
    await validateWithAiSdk(secondRunMessages);

    // 三个真实工具结果都紧跟在携带对应 tool-call 的 assistant 消息之后
    for (const failure of failures) {
      const callIndex = secondRunMessages.findIndex((message) => assistantToolCalls(message)
        .some((part) => part.toolCallId === failure.toolCallId));
      expect(callIndex).toBeGreaterThanOrEqual(0);
      const next = secondRunMessages[callIndex + 1]!;
      expect(next.role).toBe('tool');
      const parts = toolResultParts(next);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: 'tool-result',
        toolCallId: failure.toolCallId,
        toolName: failure.toolName,
      });
      expect(parts[0]!.output?.value).toBe(JSON.stringify(failure.result));
    }

    // 原始工具名与参数保真
    const callParts = secondRunMessages.flatMap(assistantToolCalls);
    expect(callParts).toEqual(expect.arrayContaining(
      failures.map((failure) => expect.objectContaining({
        toolCallId: failure.toolCallId,
        toolName: failure.toolName,
        input: failure.input,
      })),
    ));
  });

  it('结果确实缺失时只给模型“状态未知”占位：不伪造成功/失败、不写回数据库、排除孤立结果', async () => {
    const base = Date.now() - 30_000;
    const assistantId = 'f0000000-0000-4000-8000-000000000001';
    const authenticResult = { success: true as const, data: { tabs: ['tab-1'] } };

    // 旧数据夹具：为复现「同毫秒按主键排序 = 结果行在最前」，
    // 必须绕过 ConversationManager（#232 起它会给同批写入分配递增逻辑时间戳），
    // 直接用 putMessage 保留旧的同毫秒存储顺序。
    await db.putMessage({
      id: 'user-seed',
      conversationId,
      role: 'user',
      content: '先查这两个标签页',
      timestamp: base,
    });
    await db.putMessage({
      id: assistantId,
      conversationId,
      role: 'assistant',
      content: '',
      timestamp: base + 1,
      toolCalls: JSON.stringify([
        { id: '0-call-1', name: 'tabs_query', params: { id: 'tab-1' } },
        { id: '0-call-2', name: 'tabs_query', params: { id: 'tab-2' } },
      ]),
    });
    // 只有 call-1 的真实结果；主键排序领先于 assistant（同毫秒倒序）
    await db.putMessage({
      id: '0-call-1',
      conversationId,
      role: 'tool',
      content: JSON.stringify(authenticResult),
      toolCallId: '0-call-1',
      timestamp: base + 1,
    });
    // 无法匹配任何调用的旧孤立结果，必须继续排除
    await db.putMessage({
      id: '0-orphan',
      conversationId,
      role: 'tool',
      content: JSON.stringify({ success: false, error: '旧数据' }),
      toolCallId: 'ghost-call',
      timestamp: base + 1,
    });

    const before = await db.getMessagesByConversation(conversationId);
    const toolRowsBefore = before.filter((message) => message.role === 'tool');

    mockFinalText('已核实。');

    await adapter.run(makeInput('继续'));
    const messages = streamMock.mock.calls[0]?.[0]?.messages as ModelMessage[];

    await validateWithAiSdk(messages);

    const callIndex = messages.findIndex((message) => assistantToolCalls(message)
      .some((part) => part.toolCallId === '0-call-1'));
    expect(callIndex).toBeGreaterThanOrEqual(0);
    const callParts = assistantToolCalls(messages[callIndex]!);
    expect(callParts).toEqual([
      expect.objectContaining({ toolCallId: '0-call-1', toolName: 'tabs_query', input: { id: 'tab-1' } }),
      expect.objectContaining({ toolCallId: '0-call-2', toolName: 'tabs_query', input: { id: 'tab-2' } }),
    ]);

    const first = toolResultParts(messages[callIndex + 1]!);
    expect(first[0]!.output?.value).toBe(JSON.stringify(authenticResult));
    const second = toolResultParts(messages[callIndex + 2]!);
    expect(second[0]).toMatchObject({
      type: 'tool-result',
      toolCallId: '0-call-2',
      toolName: 'tabs_query',
    });
    const unknownText = String(second[0]!.output?.value ?? '');
    expect(unknownText).toContain('状态未知');
    expect(unknownText).toContain('可能已经执行');
    expect(unknownText).toContain('核实');
    expect(unknownText).toContain('不要自动重试');
    expect(unknownText).not.toContain('success');
    expect(unknownText).not.toContain('成功');
    expect(unknownText).not.toContain('失败');

    // 孤立结果不进入模型上下文
    expect(messages.flatMap(toolResultParts).some(
      (part) => part.toolCallId === 'ghost-call',
    )).toBe(false);

    // 占位不落库：tool 行数量与内容不变，也没有新增 call-2 的结果
    const after = await db.getMessagesByConversation(conversationId);
    const toolRowsAfter = after.filter((message) => message.role === 'tool');
    expect(toolRowsAfter).toHaveLength(toolRowsBefore.length);
    expect(toolRowsAfter.some((message) => message.toolCallId === '0-call-2')).toBe(false);
    expect(toolRowsAfter.map((message) => message.content))
      .toEqual(toolRowsBefore.map((message) => message.content));
    const persistedAssistant = after.find((message) => message.id === assistantId);
    expect(parseToolCalls(persistedAssistant?.toolCalls)).toEqual([
      expect.objectContaining({ id: '0-call-1', name: 'tabs_query', params: { id: 'tab-1' } }),
      expect.objectContaining({ id: '0-call-2', name: 'tabs_query', params: { id: 'tab-2' } }),
    ]);

    // 真实索引顺序确实是「结果行在最前」的倒序，重建不能依赖行序
    expect(after.map((message) => message.id).filter((id) => (
      id === '0-call-1' || id === '0-orphan' || id === assistantId
    ))).toEqual(['0-call-1', '0-orphan', assistantId]);

    // 反复读取同一历史，重建出的配对序列保持一致（确定性）
    mockFinalText('再继续。');
    await adapter.run(makeInput('再继续'));
    const secondRunMessages = streamMock.mock.calls[1]?.[0]?.messages as ModelMessage[];
    const repeatCallIndex = secondRunMessages.findIndex((message) => assistantToolCalls(message)
      .some((part) => part.toolCallId === '0-call-1'));
    expect(toolResultParts(secondRunMessages[repeatCallIndex + 1]!)[0]!.output?.value)
      .toBe(JSON.stringify(authenticResult));
    const repeatUnknown = String(
      toolResultParts(secondRunMessages[repeatCallIndex + 2]!)[0]!.output?.value ?? '',
    );
    expect(repeatUnknown).toBe(unknownText);
  });

  it('#234 两轮真实运行：缺失结果不写伪造结果行，下一轮仅内存合成未知且不自动重试', async () => {
    streamMock.mockImplementationOnce(async (options: {
      onStepFinish: (step: unknown) => void;
    }) => {
      options.onStepFinish({
        toolCalls: [{
          toolCallId: 'missing-live',
          toolName: 'tabs_query',
          input: { id: 'tab-1' },
        }],
        toolResults: [],
        content: [],
      });
      return {
        stream: emptyStream(),
        finalStep: Promise.resolve({ text: '已尝试。', usage: { inputTokens: 10, outputTokens: 5 } }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      };
    });

    const firstRun = await adapter.run(makeInput('查一下这个标签页'));
    expect(firstRun.toolCalls).toHaveLength(1);
    // 缺失结果不得伪造成失败
    expect(firstRun.toolCalls[0]).not.toHaveProperty('result');

    const storedAfterFirst = await db.getMessagesByConversation(conversationId);
    const callRows = storedAfterFirst.filter((message) => message.role === 'assistant'
      && parseToolCalls(message.toolCalls).some((call) => call.id === 'missing-live'));
    expect(callRows).toHaveLength(1);
    // 调用行仍然落库，但没有对应的假结果行
    expect(storedAfterFirst.filter(
      (message) => message.role === 'tool' && message.toolCallId === 'missing-live',
    )).toHaveLength(0);

    nowValue += 10_000;
    mockFinalText('收到。');
    await adapter.run(makeInput('继续'));

    const secondMessages = streamMock.mock.calls[1]?.[0]?.messages as ModelMessage[];
    await validateWithAiSdk(secondMessages);

    // 不自动重试：历史里只保留一次原始调用
    expect(secondMessages.flatMap(assistantToolCalls).filter(
      (part) => part.toolCallId === 'missing-live',
    )).toHaveLength(1);

    const callIndex = secondMessages.findIndex((message) => assistantToolCalls(message)
      .some((part) => part.toolCallId === 'missing-live'));
    expect(callIndex).toBeGreaterThanOrEqual(0);
    const unknownParts = toolResultParts(secondMessages[callIndex + 1]!);
    expect(unknownParts).toHaveLength(1);
    expect(unknownParts[0]).toMatchObject({
      type: 'tool-result',
      toolCallId: 'missing-live',
      toolName: 'tabs_query',
    });
    const unknownText = String(unknownParts[0]!.output?.value ?? '');
    expect(unknownText).toContain('状态未知');
    expect(unknownText).toContain('不要自动重试');
    expect(unknownText).not.toContain('工具执行未返回结果');

    // 合成的未知占位绝不写回数据库
    const storedAfterSecond = await db.getMessagesByConversation(conversationId);
    expect(storedAfterSecond.filter(
      (message) => message.role === 'tool' && message.toolCallId === 'missing-live',
    )).toHaveLength(0);
  });

  it('原始尾部是孤立 tool 结果时，上一条同文用户消息不能被误当作当前输入', async () => {
    const base = Date.now() - 30_000;
    const repeatedQuestion = '继续';

    await conversationManager.addMessage(conversationId, {
      id: 'user-repeat',
      role: 'user',
      content: repeatedQuestion,
      timestamp: base,
    });
    // 尾部孤立结果：重建时会移除，但去重必须仍以原始尾部为准
    await conversationManager.addMessage(conversationId, {
      id: '0-orphan-tail',
      role: 'tool',
      content: JSON.stringify({ success: true, data: { leaked: true } }),
      toolCallId: 'ghost-call',
      timestamp: base + 1,
    });

    mockFinalText('收到。');

    await adapter.run(makeInput(repeatedQuestion));
    const messages = streamMock.mock.calls[0]?.[0]?.messages as ModelMessage[];

    await validateWithAiSdk(messages);

    const userMessages = messages.filter((message) => message.role === 'user');
    expect(userMessages).toEqual([
      { role: 'user', content: repeatedQuestion },
      { role: 'user', content: repeatedQuestion },
    ]);
    expect(messages.at(-1)).toEqual({ role: 'user', content: repeatedQuestion });
    expect(messages.flatMap(toolResultParts).some(
      (part) => part.toolCallId === 'ghost-call',
    )).toBe(false);
  });

  it('#230 同一 toolCallId 跨两步同毫秒落库：两行都保留、各自关联正确调用、模型侧 ID 与结果唯一', async () => {
    const firstResult: ToolResult = { success: true, data: { step: 1 } };
    const secondResult: ToolResult = { success: true, data: { step: 2 } };

    mockToolSteps([
      {
        toolCallId: 'dup-call',
        toolName: 'tabs_query',
        input: { id: 'step-1' },
        result: firstResult,
      },
      {
        toolCallId: 'dup-call',
        toolName: 'tabs_query',
        input: { id: 'step-2' },
        result: secondResult,
      },
    ]);

    await adapter.run(makeInput('跑两步同名调用'));
    nowValue += 10_000;

    const stored = await db.getMessagesByConversation(conversationId);
    const callRows = stored.filter((message) => message.role === 'assistant'
      && parseToolCalls(message.toolCalls).some((call) => call.id === 'dup-call'));
    const toolRows = stored.filter((message) => message.role === 'tool'
      && message.toolCallId === 'dup-call');

    expect(callRows).toHaveLength(2);
    expect(toolRows).toHaveLength(2);
    expect(new Set(toolRows.map((row) => row.id)).size).toBe(2);
    expect(toolRows.every((row) => row.id !== 'dup-call')).toBe(true);

    const parentInputById = new Map(callRows.map((row) => {
      const call = parseToolCalls(row.toolCalls).find((candidate) => candidate.id === 'dup-call');
      return [row.id, call?.params.id] as const;
    }));
    const expectedResultByInput = new Map<string, ToolResult>([
      ['step-1', firstResult],
      ['step-2', secondResult],
    ]);
    for (const row of toolRows) {
      const parentInput = parentInputById.get(row.parentMessageId ?? '');
      expect(parentInput).toBeDefined();
      expect(row.content).toBe(JSON.stringify(expectedResultByInput.get(String(parentInput))));
    }
    // 持久化的 toolCallId / 参数不被模型侧重命名影响
    for (const row of callRows) {
      const call = parseToolCalls(row.toolCalls)[0]!;
      expect(call.id).toBe('dup-call');
    }

    mockFinalText('继续。');
    await adapter.run(makeInput('继续'));
    const messages = streamMock.mock.calls[1]?.[0]?.messages as ModelMessage[];
    await validateWithAiSdk(messages);

    const callParts = messages.flatMap(assistantToolCalls);
    const dupCalls = callParts.filter((part) => (
      part.toolName === 'tabs_query'
      && part.input !== undefined
      && ['step-1', 'step-2'].includes((part.input as { id: string }).id)
    ));
    expect(dupCalls).toHaveLength(2);
    expect(new Set(dupCalls.map((part) => part.toolCallId)).size).toBe(2);
    // 模型侧 ID 只使用 provider 常规安全字符（原 ID 安全时不引入 # 等标点）
    for (const part of dupCalls) {
      expect(part.toolCallId).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(part.toolCallId).not.toContain('#');
    }

    for (const inputId of ['step-1', 'step-2']) {
      const callIndex = messages.findIndex((message) => assistantToolCalls(message)
        .some((part) => (part.input as { id?: string } | undefined)?.id === inputId));
      expect(callIndex).toBeGreaterThanOrEqual(0);
      const callPart = assistantToolCalls(messages[callIndex]!).find(
        (part) => (part.input as { id?: string } | undefined)?.id === inputId,
      )!;
      const resultParts = toolResultParts(messages[callIndex + 1]!);
      expect(resultParts).toHaveLength(1);
      expect(resultParts[0]).toMatchObject({
        type: 'tool-result',
        toolCallId: callPart.toolCallId,
        toolName: 'tabs_query',
      });
      expect(resultParts[0]!.output?.value).toBe(JSON.stringify(expectedResultByInput.get(inputId)));
    }
  });

  it('#230 跨会话相同 toolCallId：两行独立保留并各自关联所在会话的调用', async () => {
    const otherConversationId = (await conversationManager.create('另一个会话')).id;
    const resultA: ToolResult = { success: true, data: { conversation: 'a' } };
    const resultB: ToolResult = { success: true, data: { conversation: 'b' } };

    mockToolSteps([{
      toolCallId: 'shared-call',
      toolName: 'tabs_query',
      input: { id: 'conv-a' },
      result: resultA,
    }]);
    await adapter.run(makeInput('会话 A 的请求'));
    nowValue += 10_000;

    mockToolSteps([{
      toolCallId: 'shared-call',
      toolName: 'tabs_query',
      input: { id: 'conv-b' },
      result: resultB,
    }]);
    await adapter.run({ ...makeInput('会话 B 的请求'), conversationId: otherConversationId });
    nowValue += 10_000;

    const storedA = await db.getMessagesByConversation(conversationId);
    const storedB = await db.getMessagesByConversation(otherConversationId);
    const toolRowsA = storedA.filter((message) => message.role === 'tool'
      && message.toolCallId === 'shared-call');
    const toolRowsB = storedB.filter((message) => message.role === 'tool'
      && message.toolCallId === 'shared-call');

    expect(toolRowsA).toHaveLength(1);
    expect(toolRowsB).toHaveLength(1);
    expect(toolRowsA[0]!.id).not.toBe(toolRowsB[0]!.id);
    expect(toolRowsA[0]!.content).toBe(JSON.stringify(resultA));
    expect(toolRowsB[0]!.content).toBe(JSON.stringify(resultB));

    const callRowA = storedA.find((message) => message.role === 'assistant'
      && parseToolCalls(message.toolCalls).some((call) => call.id === 'shared-call'));
    const callRowB = storedB.find((message) => message.role === 'assistant'
      && parseToolCalls(message.toolCalls).some((call) => call.id === 'shared-call'));
    expect(toolRowsA[0]!.parentMessageId).toBe(callRowA!.id);
    expect(toolRowsB[0]!.parentMessageId).toBe(callRowB!.id);

    mockFinalText('继续 A。');
    await adapter.run(makeInput('继续 A'));
    mockFinalText('继续 B。');
    await adapter.run({ ...makeInput('继续 B'), conversationId: otherConversationId });

    const messagesA = streamMock.mock.calls[2]?.[0]?.messages as ModelMessage[];
    const messagesB = streamMock.mock.calls[3]?.[0]?.messages as ModelMessage[];
    await validateWithAiSdk(messagesA);
    await validateWithAiSdk(messagesB);

    expect(messagesA.flatMap(toolResultParts).map((part) => part.output?.value))
      .toContain(JSON.stringify(resultA));
    expect(messagesA.flatMap(toolResultParts).map((part) => part.output?.value))
      .not.toContain(JSON.stringify(resultB));
    expect(messagesB.flatMap(toolResultParts).map((part) => part.output?.value))
      .toContain(JSON.stringify(resultB));
    expect(messagesB.flatMap(toolResultParts).map((part) => part.output?.value))
      .not.toContain(JSON.stringify(resultA));
  });

  it('#230 旧数据同 toolCallId 多次调用只剩一行结果：归属不明，全部标记未知', async () => {
    const base = Date.now() - 30_000;
    const legacyResult: ToolResult = { success: true, data: { applied: 'destructive' } };

    await conversationManager.addMessage(conversationId, {
      id: 'user-ambiguous',
      role: 'user',
      content: '执行两步',
      timestamp: base,
    });
    await conversationManager.addMessage(conversationId, {
      id: 'f0000000-0000-4000-8000-000000000010',
      role: 'assistant',
      content: '',
      timestamp: base + 1,
      toolCalls: [{ id: 'legacy-dup', name: 'tabs_query', params: { id: 'step-1' } }],
    });
    await conversationManager.addMessage(conversationId, {
      id: 'f0000000-0000-4000-8000-000000000011',
      role: 'assistant',
      content: '',
      timestamp: base + 1,
      toolCalls: [{ id: 'legacy-dup', name: 'tabs_query', params: { id: 'step-2' } }],
    });
    // 旧实现用 toolCallId 作主键，第二步覆盖了第一步，只剩这一行且无法确定归属
    await conversationManager.addMessage(conversationId, {
      id: '0-legacy-dup',
      role: 'tool',
      content: JSON.stringify(legacyResult),
      toolCallId: 'legacy-dup',
      timestamp: base + 1,
    });

    mockFinalText('已核实。');
    await adapter.run(makeInput('继续'));
    const messages = streamMock.mock.calls[0]?.[0]?.messages as ModelMessage[];
    await validateWithAiSdk(messages);

    const callParts = messages.flatMap(assistantToolCalls)
      .filter((part) => ['step-1', 'step-2'].includes(
        (part.input as { id?: string } | undefined)?.id ?? '',
      ));
    expect(callParts).toHaveLength(2);
    expect(new Set(callParts.map((part) => part.toolCallId)).size).toBe(2);

    const toolValues = messages.flatMap(toolResultParts).map((part) => String(part.output?.value ?? ''));
    expect(toolValues).not.toContain(JSON.stringify(legacyResult));
    for (const part of callParts) {
      const callIndex = messages.findIndex((message) => assistantToolCalls(message)
        .some((candidate) => candidate.toolCallId === part.toolCallId));
      const result = toolResultParts(messages[callIndex + 1]!)[0];
      expect(result).toMatchObject({ type: 'tool-result', toolCallId: part.toolCallId });
      expect(String(result!.output?.value ?? '')).toContain('状态未知');
    }
  });

  it('#230 同一 parent 内重复 toolCallId：无索引可区分，宁可未知也不误配成功', async () => {
    const base = Date.now() - 30_000;
    const assistantId = 'f0000000-0000-4000-8000-000000000020';
    const realResult: ToolResult = { success: true, data: { applied: true } };

    await conversationManager.addMessage(conversationId, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: base,
      toolCalls: [
        { id: 'same-parent-dup', name: 'tabs_query', params: { id: 'step-1' } },
        { id: 'same-parent-dup', name: 'tabs_query', params: { id: 'step-2' } },
      ],
    });
    await conversationManager.addMessage(conversationId, {
      id: 'tool-same-parent',
      role: 'tool',
      content: JSON.stringify(realResult),
      toolCallId: 'same-parent-dup',
      parentMessageId: assistantId,
      timestamp: base,
    });

    mockFinalText('已核实。');
    await adapter.run(makeInput('继续'));
    const messages = streamMock.mock.calls[0]?.[0]?.messages as ModelMessage[];
    await validateWithAiSdk(messages);

    const callParts = assistantToolCalls(messages.find((message) => assistantToolCalls(message)
      .some((part) => ['step-1', 'step-2'].includes(
        (part.input as { id?: string } | undefined)?.id ?? '',
      )))!);
    expect(callParts).toHaveLength(2);
    expect(new Set(callParts.map((part) => part.toolCallId)).size).toBe(2);

    const toolValues = messages.flatMap(toolResultParts).map((part) => String(part.output?.value ?? ''));
    expect(toolValues).not.toContain(JSON.stringify(realResult));
    for (const part of callParts) {
      const callIndex = messages.findIndex((message) => assistantToolCalls(message)
        .some((candidate) => candidate.toolCallId === part.toolCallId));
      expect(String(toolResultParts(messages[callIndex + 1]!)[0]!.output?.value ?? ''))
        .toContain('状态未知');
    }
  });

  it('#230 新旧行混合：linked 结果跟随其 parent，legacy 唯一结果按 toolCallId 配对', async () => {
    const base = Date.now() - 30_000;
    const legacyResult: ToolResult = { success: true, data: { source: 'legacy' } };
    const linkedResult: ToolResult = { success: true, data: { source: 'linked' } };
    const linkedAssistantId = 'f0000000-0000-4000-8000-000000000030';

    await conversationManager.addMessage(conversationId, {
      id: 'f0000000-0000-4000-8000-000000000029',
      role: 'assistant',
      content: '',
      timestamp: base,
      toolCalls: [{ id: 'legacy-mixed', name: 'tabs_query', params: { id: 'legacy-step' } }],
    });
    await conversationManager.addMessage(conversationId, {
      id: '0-legacy-mixed',
      role: 'tool',
      content: JSON.stringify(legacyResult),
      toolCallId: 'legacy-mixed',
      timestamp: base,
    });
    await conversationManager.addMessage(conversationId, {
      id: linkedAssistantId,
      role: 'assistant',
      content: '',
      timestamp: base,
      toolCalls: [{ id: 'linked-mixed', name: 'tabs_query', params: { id: 'linked-step' } }],
    });
    await conversationManager.addMessage(conversationId, {
      id: 'tool-linked-mixed',
      role: 'tool',
      content: JSON.stringify(linkedResult),
      toolCallId: 'linked-mixed',
      parentMessageId: linkedAssistantId,
      timestamp: base,
    });

    mockFinalText('继续');
    await adapter.run(makeInput('继续'));
    const messages = streamMock.mock.calls[0]?.[0]?.messages as ModelMessage[];
    await validateWithAiSdk(messages);

    const expectations = new Map([
      ['legacy-step', legacyResult],
      ['linked-step', linkedResult],
    ]);
    for (const [inputId, expected] of expectations) {
      const callIndex = messages.findIndex((message) => assistantToolCalls(message)
        .some((part) => (part.input as { id?: string } | undefined)?.id === inputId));
      expect(callIndex).toBeGreaterThanOrEqual(0);
      const result = toolResultParts(messages[callIndex + 1]!)[0];
      expect(result?.output?.value).toBe(JSON.stringify(expected));
    }
  });

  it('#230 parentMessageId 写入/读回往返，旧行缺省仍为 undefined', async () => {
    const parentId = 'f0000000-0000-4000-8000-000000000040';
    await conversationManager.addMessage(conversationId, {
      id: 'tool-linked-roundtrip',
      role: 'tool',
      content: '{"success":true}',
      toolCallId: 'call-linked',
      parentMessageId: parentId,
      timestamp: Date.now() - 20_000,
    });
    await conversationManager.addMessage(conversationId, {
      id: 'tool-legacy-roundtrip',
      role: 'tool',
      content: '{"success":true}',
      toolCallId: 'call-legacy',
      timestamp: Date.now() - 19_000,
    });

    const conversation = await conversationManager.get(conversationId);
    const linked = conversation!.messages.find((message) => message.id === 'tool-linked-roundtrip');
    const legacy = conversation!.messages.find((message) => message.id === 'tool-legacy-roundtrip');
    expect(linked?.parentMessageId).toBe(parentId);
    expect(legacy?.parentMessageId).toBeUndefined();

    const stored = await db.getMessagesByConversation(conversationId);
    expect(stored.find((message) => message.id === 'tool-linked-roundtrip')?.parentMessageId)
      .toBe(parentId);
  });

  it('#230 模型侧重命名使用 provider 安全字符，且与已有原始 ID 冲突时仍唯一', () => {
    const messages: StoredMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_dup', name: 'tabs_query', params: { id: 'first' } }],
      },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_dup_replay_2', name: 'tabs_query', params: { id: 'reserved' } }],
      },
      {
        id: 'a3',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_dup', name: 'tabs_query', params: { id: 'second' } }],
      },
    ];

    const { messages: rebuilt } = reconstructToolProtocol(messages);
    const callIds = rebuilt
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.toolCalls?.map((call) => call.id) ?? []);

    expect(callIds).toHaveLength(3);
    expect(new Set(callIds).size).toBe(3);
    for (const callId of callIds) {
      expect(callId).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(callId).not.toContain('#');
    }
    // 首选候选 call_dup_replay_2 与已有原始 ID 冲突时必须继续避让
    expect(callIds[0]).toBe('call_dup');
    expect(callIds[1]).toBe('call_dup_replay_2');
    expect(callIds[2]).not.toBe('call_dup_replay_2');
    expect(callIds[2]).toContain('call_dup_replay_2');

    // 原始持久化 ID 与参数不被改写
    expect(messages[2]!.toolCalls?.[0]).toMatchObject({
      id: 'call_dup',
      params: { id: 'second' },
    });
  });

  // ── #232：新写入顺序与续发输入 ────────────────────────

  it('#232 上一条同文用户消息不被当作本轮输入吞掉，本轮输入只出现一次且在末尾', async () => {
    const repeated = '继续';

    await conversationManager.addMessage(conversationId, {
      id: 'user-prior-same-text',
      role: 'user',
      content: repeated,
    });

    mockFinalText('收到。');
    await adapter.run(makeInput(repeated));

    const messages = streamMock.mock.calls[0]?.[0]?.messages as ModelMessage[];
    await validateWithAiSdk(messages);

    // 上一条真实历史与本轮输入都必须在场，且本轮输入只在末尾出现一次
    expect(messages.filter((message) => message.role === 'user')).toEqual([
      { role: 'user', content: repeated },
      { role: 'user', content: repeated },
    ]);
    expect(messages.at(-1)).toEqual({ role: 'user', content: repeated });

    const stored = await db.getMessagesByConversation(conversationId);
    expect(stored.filter((row) => row.role === 'user' && row.content === repeated))
      .toHaveLength(2);
  });

  it('#232 连续步骤回填按步骤顺序落库，后续用户消息排在所有步骤之后', async () => {
    // 让旧的同毫秒实现（按主键排序）必然逆序：后分配的行字典序更小
    let sequence = 0xffffff;
    const uuidSpy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      sequence -= 1;
      return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
    });

    try {
      mockToolSteps([
        {
          toolCallId: 'step-1-call',
          toolName: 'tabs_query',
          input: { id: 'step-1' },
          result: { success: true, data: { step: 1 } },
        },
        {
          toolCallId: 'step-2-call',
          toolName: 'tabs_query',
          input: { id: 'step-2' },
          result: { success: true, data: { step: 2 } },
        },
      ]);

      await adapter.run(makeInput('第一步输入'));

      const stored = await db.getMessagesByConversation(conversationId);
      expect(stored.map((row) => row.role)).toEqual([
        'user',
        'assistant',
        'tool',
        'assistant',
        'tool',
        'assistant',
      ]);
      expect(parseToolCalls(stored[1]!.toolCalls)[0]!.id).toBe('step-1-call');
      expect(stored[2]!.toolCallId).toBe('step-1-call');
      expect(stored[2]!.parentMessageId).toBe(stored[1]!.id);
      expect(parseToolCalls(stored[3]!.toolCalls)[0]!.id).toBe('step-2-call');
      expect(stored[4]!.toolCallId).toBe('step-2-call');
      expect(stored[4]!.parentMessageId).toBe(stored[3]!.id);

      const timestamps = stored.map((row) => row.timestamp);
      expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
      expect(new Set(timestamps).size).toBe(timestamps.length);

      // 后续用户消息必须排在首轮全部步骤之后
      mockFinalText('继续完成。');
      await adapter.run(makeInput('后续用户'));

      const after = await db.getMessagesByConversation(conversationId);
      const lastUserIndex = after.findLastIndex((row) => row.role === 'user');
      const firstStepIndex = after.findIndex((row) => row.role === 'tool');
      expect(lastUserIndex).toBeGreaterThan(firstStepIndex);
      expect(after.at(-1)!.role).toBe('assistant');
      expect(after[lastUserIndex]!.content).toBe('后续用户');
      expect(after[lastUserIndex]!.timestamp).toBeGreaterThan(
        Math.max(...after.slice(0, lastUserIndex).map((row) => row.timestamp)),
      );
    } finally {
      uuidSpy.mockRestore();
    }
  });

  it('#232 压缩后重建历史包含本轮输入一次，且摘要行为保持不变', async () => {
    // 长历史触发摘要；尾部用户消息与本轮输入同文，验证排除按唯一 ID 而不是文本
    const padding = 'x'.repeat(1_500);
    const rows = Array.from({ length: 8 }, (_, index) => [
      {
        id: `long-user-${index}`,
        role: 'user' as const,
        content: `历史问题-${index}-${padding}`,
      },
      {
        id: `long-assistant-${index}`,
        role: 'assistant' as const,
        content: `历史回答-${index}-${padding}`,
      },
    ]).flat();
    await db.appendMessages(rows.map((row, index) => ({
      ...row,
      conversationId,
      timestamp: Date.now() + index,
    })));
    await conversationManager.addMessage(conversationId, {
      id: 'user-tail-same-text',
      role: 'user',
      content: '继续',
    });

    generateTextMock.mockResolvedValue({ text: '压缩摘要' });
    const compactingAdapter = new ToolLoopAdapter(
      registry,
      GUARDRAIL,
      conversationManager,
      PROVIDER_CONFIG,
      'test-model',
      { maxToolRounds: 99, contextWindowTokens: 10_000, tokenBudgetMargin: 100 },
    );
    mockFinalText('继续完成。');
    await compactingAdapter.run(makeInput('继续'));

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const conversation = await conversationManager.get(conversationId);
    expect(conversation!.summary).toBe('压缩摘要');

    const messages = streamMock.mock.calls[0]?.[0]?.messages as ModelMessage[];
    await validateWithAiSdk(messages);

    expect(messages[0]).toEqual(expect.objectContaining({ role: 'system' }));
    expect(messages.some((message) => message.role === 'system'
      && typeof message.content === 'string'
      && message.content.includes('压缩摘要'))).toBe(true);
    // 尾部同文历史与本轮输入都在场，本轮输入在末尾只出现一次
    expect(messages.filter((message) => message.role === 'user'
      && message.content === '继续')).toEqual([
      { role: 'user', content: '继续' },
      { role: 'user', content: '继续' },
    ]);
    expect(messages.at(-1)).toEqual({ role: 'user', content: '继续' });
    expect(messages.some((message) => message.content === `历史问题-0-${padding}`)).toBe(false);
  });

  // ── #233：摘要可见窗口在完整历史配对之后裁剪 ──────────

  it('#233-B1 摘要边界切裂调用/结果：保留侧复用真实结果而非合成未知', async () => {
    const base = Date.now() - 30_000;
    const savedResult: ToolResult = { success: true, data: { tabs: ['tab-9'] } };

    // 旧数据夹具：同毫秒 + 主键排序让结果行排在摘要边界之前，父调用行在边界之后。
    // addMessage 自 #232 起会给同批写入分配递增时间戳，这里必须用 putMessage
    // 保留旧的同毫秒存储顺序。
    await db.putMessage({
      id: 'a-result',
      conversationId,
      role: 'tool',
      content: JSON.stringify(savedResult),
      toolCallId: 'split-call',
      parentMessageId: 'c-assistant',
      timestamp: base,
    });
    await db.putMessage({
      id: 'b-user',
      conversationId,
      role: 'user',
      content: '查看标签页',
      timestamp: base,
    });
    await db.putMessage({
      id: 'c-assistant',
      conversationId,
      role: 'assistant',
      content: '',
      timestamp: base,
      toolCalls: JSON.stringify([
        { id: 'split-call', name: 'tabs_query', params: { id: 'tab-9' } },
      ]),
    });

    const stored = await db.getMessagesByConversation(conversationId);
    expect(stored.map((message) => message.id)).toEqual(['a-result', 'b-user', 'c-assistant']);

    await conversationManager.update(conversationId, {
      summary: '之前已查询过标签页。',
      summaryUpToIndex: 1,
    });

    mockFinalText('继续。');
    await adapter.run(makeInput('下一步'));
    const messages = streamMock.mock.calls[0]?.[0]?.messages as ModelMessage[];

    await validateWithAiSdk(messages);

    const callIndex = messages.findIndex((message) => assistantToolCalls(message)
      .some((part) => part.toolCallId === 'split-call'));
    expect(callIndex).toBeGreaterThanOrEqual(0);
    const resultPart = toolResultParts(messages[callIndex + 1]!)[0];
    expect(resultPart).toMatchObject({
      type: 'tool-result',
      toolCallId: 'split-call',
      toolName: 'tabs_query',
    });
    // 真实结果物理位置在边界之前，但归属由完整历史配对确定，不能合成「状态未知」
    expect(resultPart!.output?.value).toBe(JSON.stringify(savedResult));
    expect(String(resultPart!.output?.value)).not.toContain('状态未知');
  });

  it('#233-B2 摘要边界切裂重复调用：保留侧唯一旧结果归属不明时必须未知', async () => {
    const base = Date.now() - 30_000;
    const legacyResult: ToolResult = { success: true, data: { applied: 'destructive' } };

    // 两次同 ID 调用被摘要边界切开：一次在切点前、一次在切点后；
    // 旧数据只剩一行未关联结果，落在保留侧。
    await db.putMessage({
      id: '0-call-before',
      conversationId,
      role: 'assistant',
      content: '',
      timestamp: base,
      toolCalls: JSON.stringify([
        { id: 'legacy-dup', name: 'tabs_query', params: { id: 'step-1' } },
      ]),
    });
    await db.putMessage({
      id: '1-user-cutoff',
      conversationId,
      role: 'user',
      content: '执行两步',
      timestamp: base,
    });
    await db.putMessage({
      id: '2-call-after',
      conversationId,
      role: 'assistant',
      content: '',
      timestamp: base,
      toolCalls: JSON.stringify([
        { id: 'legacy-dup', name: 'tabs_query', params: { id: 'step-2' } },
      ]),
    });
    await db.putMessage({
      id: '3-legacy-result',
      conversationId,
      role: 'tool',
      content: JSON.stringify(legacyResult),
      toolCallId: 'legacy-dup',
      timestamp: base,
    });

    const stored = await db.getMessagesByConversation(conversationId);
    expect(stored.map((message) => message.id)).toEqual([
      '0-call-before',
      '1-user-cutoff',
      '2-call-after',
      '3-legacy-result',
    ]);

    await conversationManager.update(conversationId, {
      summary: '用户要求执行两步操作。',
      summaryUpToIndex: 1,
    });

    mockFinalText('已核实。');
    await adapter.run(makeInput('继续'));
    const messages = streamMock.mock.calls[0]?.[0]?.messages as ModelMessage[];

    await validateWithAiSdk(messages);

    // 切点前的同 ID 调用只能通过完整历史才能发现，保留侧必须据此判定归属不明
    const retainedCalls = messages.flatMap(assistantToolCalls).filter(
      (part) => (part.input as { id?: string } | undefined)?.id === 'step-2',
    );
    expect(retainedCalls).toHaveLength(1);
    const callIndex = messages.findIndex((message) => assistantToolCalls(message)
      .some((part) => part.toolCallId === retainedCalls[0]!.toolCallId));
    const resultValue = String(
      toolResultParts(messages[callIndex + 1]!)[0]!.output?.value ?? '',
    );
    expect(resultValue).not.toBe(JSON.stringify(legacyResult));
    expect(resultValue).toContain('状态未知');
  });

  it('#233 反向边界：父调用在切点前、结果在切点后，摘要含结果而重放不含', async () => {
    const padding = 'x'.repeat(2_000);
    const reverseResult: ToolResult = { success: true, data: { restored: 'reverse-boundary' } };

    // 6 个完整轮次，每个 user 行都足够大：保留最近 4 轮时 cutoff 必然落在
    // user-2（原始下标 4），且所有候选剩余都超预算，回退 latestCutoff。
    const timestamps = Date.now() - 60_000;
    const rows: DbMessage[] = [];
    const push = (
      row: Omit<DbMessage, 'conversationId' | 'timestamp'>,
      timestamp: number,
    ) => {
      rows.push({ conversationId, timestamp, ...row });
    };

    push({ id: 'r-user-0', role: 'user', content: `问题-0-${padding}` }, timestamps);
    push({ id: 'r-assistant-0', role: 'assistant', content: `回答-0-${padding}` }, timestamps + 1);
    push({ id: 'r-user-1', role: 'user', content: `问题-1-${padding}` }, timestamps + 2);
    // 父调用在保留侧之外，其结果物理位置却在保留侧之内
    push({
      id: 'r-assistant-1',
      role: 'assistant',
      content: '',
      toolCalls: JSON.stringify([
        { id: 'reverse-call', name: 'tabs_query', params: { id: 'tab-reverse' } },
      ]),
    }, timestamps + 3);
    push({ id: 'r-user-2', role: 'user', content: `问题-2-${padding}` }, timestamps + 4);
    push({
      id: 'r-result-1',
      role: 'tool',
      content: JSON.stringify(reverseResult),
      toolCallId: 'reverse-call',
      parentMessageId: 'r-assistant-1',
    }, timestamps + 5);
    push({ id: 'r-assistant-2', role: 'assistant', content: `回答-2-${padding}` }, timestamps + 6);
    push({ id: 'r-user-3', role: 'user', content: `问题-3-${padding}` }, timestamps + 7);
    push({ id: 'r-assistant-3', role: 'assistant', content: `回答-3-${padding}` }, timestamps + 8);
    push({ id: 'r-user-4', role: 'user', content: `问题-4-${padding}` }, timestamps + 9);
    push({ id: 'r-assistant-4', role: 'assistant', content: `回答-4-${padding}` }, timestamps + 10);
    // 与本次输入同文的上一轮用户消息必须在场，本轮输入只在末尾追加一次
    push({ id: 'r-user-5', role: 'user', content: '下一步' }, timestamps + 11);
    push({ id: 'r-assistant-5', role: 'assistant', content: `回答-5-${padding}` }, timestamps + 12);
    await db.putMessagesBatch(rows);

    generateTextMock.mockResolvedValue({ text: '压缩摘要' });
    const compactingAdapter = new ToolLoopAdapter(
      registry,
      GUARDRAIL,
      conversationManager,
      PROVIDER_CONFIG,
      'test-model',
      { maxToolRounds: 99, contextWindowTokens: 10_000, tokenBudgetMargin: 100 },
    );
    mockFinalText('继续完成。');
    await compactingAdapter.run(makeInput('下一步'));

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const summaryPrompt = String(
      (generateTextMock.mock.calls[0]?.[0] as { prompt?: string } | undefined)?.prompt ?? '',
    );
    // 父调用可见 → 结果即使物理位置在窗口外也必须跟随进入摘要输入
    expect(summaryPrompt).toContain('reverse-call');
    expect(summaryPrompt).toContain(JSON.stringify(reverseResult));

    const conversation = await conversationManager.get(conversationId);
    expect(conversation!.summary).toBe('压缩摘要');

    const messages = streamMock.mock.calls[0]?.[0]?.messages as ModelMessage[];
    await validateWithAiSdk(messages);

    // 保留侧父调用不可见 → 该结果也不能出现，且不能留下孤立结果
    expect(messages.flatMap(assistantToolCalls).some(
      (part) => part.toolCallId === 'reverse-call',
    )).toBe(false);
    expect(messages.flatMap(toolResultParts).some(
      (part) => part.output?.value === JSON.stringify(reverseResult),
    )).toBe(false);

    // 上一轮同文用户文本保留，本轮输入在末尾且只追加一次
    const repeatedUsers = messages.filter(
      (message) => message.role === 'user' && message.content === '下一步',
    );
    expect(repeatedUsers).toEqual([
      { role: 'user', content: '下一步' },
      { role: 'user', content: '下一步' },
    ]);
    expect(messages.at(-1)).toEqual({ role: 'user', content: '下一步' });
  });
});
