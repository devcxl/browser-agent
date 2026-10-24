import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateText } from 'ai';
import type { ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { ToolLoopAdapter } from '../tool-loop-adapter';
import { formatInterruptionMessage } from '../circuit-breaker';
import type { AgentRunInput } from '@/shared/types/agent';
import type { IToolRegistry, ToolDefinition, ToolResult } from '@/registry/types';
import { ToolRegistry } from '@/registry/tool-registry';
import type { IGuardrail, GuardrailCheck } from '@/shared/types/guardrail';
import type { StoredMessage } from '@/shared/types/conversation';
import type { ProviderConfig } from '@/shared/types/llm';
import { Database } from '@/shared/db/database';
import { ConversationManager } from '@/conversation/conversation-manager';
import { DB_NAME } from '@/shared/db/schema';

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
 */

interface CapturedAgentOptions {
  stopWhen?: Array<(input: { steps: unknown[] }) => boolean>;
}

const capturedAgentOptions: CapturedAgentOptions[] = [];
const streamMock = vi.fn();

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
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
    generateText({ model, messages, allowSystemInMessages: true }),
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

  it('熔断后的下一轮：同毫秒倒序的 assistant/tool 行仍紧邻配对并通过协议校验', async () => {
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

    // 真实 DB 索引语义：同毫秒，工具结果主键排在 assistant 主键之前
    const stored = await db.getMessagesByConversation(conversationId);
    const storedIndex = new Map(stored.map((message, index) => [message.id, index]));
    for (const failure of failures) {
      const toolRow = stored.find((message) => message.role === 'tool'
        && message.toolCallId === failure.toolCallId);
      const callRow = stored.find((message) => message.role === 'assistant'
        && parseToolCalls(message.toolCalls).some((call) => call.id === failure.toolCallId));
      expect(toolRow).toBeDefined();
      expect(callRow).toBeDefined();
      expect(toolRow!.timestamp).toBe(callRow!.timestamp);
      expect(toolRow!.id < callRow!.id).toBe(true);
      expect(storedIndex.get(toolRow!.id)!).toBeLessThan(storedIndex.get(callRow!.id)!);
    }

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

    await conversationManager.addMessage(conversationId, {
      id: 'user-seed',
      role: 'user',
      content: '先查这两个标签页',
      timestamp: base,
    });
    await conversationManager.addMessage(conversationId, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: base + 1,
      toolCalls: [
        { id: '0-call-1', name: 'tabs_query', params: { id: 'tab-1' } },
        { id: '0-call-2', name: 'tabs_query', params: { id: 'tab-2' } },
      ],
    });
    // 只有 call-1 的真实结果；主键排序领先于 assistant（同毫秒倒序）
    await conversationManager.addMessage(conversationId, {
      id: '0-call-1',
      role: 'tool',
      content: JSON.stringify(authenticResult),
      toolCallId: '0-call-1',
      timestamp: base + 1,
    });
    // 无法匹配任何调用的旧孤立结果，必须继续排除
    await conversationManager.addMessage(conversationId, {
      id: '0-orphan',
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
});
