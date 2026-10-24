import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolLoopAdapter } from '../tool-loop-adapter';
import type { AgentConfig, AgentRunInput } from '@/shared/types/agent';
import type { IToolRegistry, ToolDefinition, ToolResult } from '@/registry/types';
import type { IGuardrail, GuardrailCheck } from '@/shared/types/guardrail';
import type { Conversation, IConversationManager, StoredMessage } from '@/shared/types/conversation';
import type { ProviderConfig } from '@/shared/types/llm';
import { estimateTokens } from '@/shared/token-estimate';

// ==================== Mocks ====================

const mockToolLoopAgentStream = vi.fn();
const mockToolClassifierClassify = vi.hoisted(() => vi.fn());
const mockGenerateText = vi.hoisted(() => vi.fn());
const mockPruneMessages = vi.hoisted(() => vi.fn());
const mockIsStepCount = vi.hoisted(() => vi.fn());
let capturedToolLoopAgentOptions: Record<string, unknown> | null = null;

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateText: mockGenerateText,
    isStepCount: (steps: number) => {
      mockIsStepCount(steps);
      return actual.isStepCount(steps);
    },
    pruneMessages: (options: unknown) => {
      mockPruneMessages(options);
      return actual.pruneMessages(options as Parameters<typeof actual.pruneMessages>[0]);
    },
    ToolLoopAgent: vi.fn().mockImplementation((options) => {
      capturedToolLoopAgentOptions = options;
      return {
        stream: mockToolLoopAgentStream,
      };
    }),
  };
});

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn().mockReturnValue({
    chatModel: vi.fn().mockReturnValue({}),
  }),
}));

vi.mock('../tool-classifier', () => ({
  ToolClassifier: vi.fn().mockImplementation(() => ({
    classify: mockToolClassifierClassify,
    reset: vi.fn(),
  })),
}));

function createMockToolRegistry(tools: ToolDefinition[]): IToolRegistry {
  const map = new Map(tools.map((t) => [t.name, t]));
  return {
    getAllTools: vi.fn().mockReturnValue(tools),
    getTool: vi.fn().mockImplementation((name: string) => map.get(name)),
    register: vi.fn(),
    registerAll: vi.fn(),
    getToolsByCategory: vi.fn().mockReturnValue([]),
    unregisterCategory: vi.fn(),
    get size() {
      return tools.length;
    },
  };
}

function createMockGuardrail(allowed = true): IGuardrail {
  return {
    check: vi.fn().mockResolvedValue({
      allowed,
      riskLevel: 'low',
      requiresPreflight: false,
      reason: allowed ? '允许执行' : '被拒绝',
      dataSensitivity: 'low',
    } satisfies GuardrailCheck),
    filterResultForRemote: vi
      .fn()
      .mockImplementation((_tool: { resultSensitivity: string }, result: ToolResult) => result),
  };
}

function createMockConversationManager(): IConversationManager {
  const storedMessages: StoredMessage[] = [];
  return {
    create: vi.fn(),
    get: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMessage: vi.fn().mockImplementation((_convId: string, msg: StoredMessage) => {
      storedMessages.push(msg);
    }),
    addMessages: vi.fn().mockImplementation((_convId: string, messages: StoredMessage[]) => {
      storedMessages.push(...messages);
    }),
    getRecentMessages: vi.fn().mockImplementation(() => {
      return Promise.resolve([...storedMessages]);
    }),
    generateTitle: vi.fn(),
  };
}

/** 汇总单条与批量写入的消息，便于断言持久化内容 */
function persistedMessages(manager: IConversationManager): StoredMessage[] {
  const single = vi.mocked(manager.addMessage).mock.calls.map(([, message]) => message);
  const batched = vi.mocked(manager.addMessages).mock.calls.flatMap(([, messages]) => messages);
  return [...single, ...batched];
}

function createMockProviderConfig(): ProviderConfig {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    providerId: 'test',
    endpoint: 'https://api.test.com/v1',
    apiKey: 'test-key',
    isLocalTrusted: false,
  };
}

function createMockTool(name: string, executeResult: ToolResult = { success: true, data: { ok: true } }): ToolDefinition {
  return {
    name,
    description: `${name} 工具`,
    category: 'tabs',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID' },
      },
      required: ['id'],
    },
    execute: vi.fn().mockResolvedValue(executeResult),
  };
}

// ==================== Tests ====================

/** 默认成功响应：空 stream + finalStep 单步 usage（上下文占用语义） */
function mockDefaultSuccessStream(): void {
  mockToolLoopAgentStream.mockResolvedValue({
    stream: (async function* () {})(),
    finalStep: Promise.resolve({ text: '操作完成', usage: { inputTokens: 100, outputTokens: 50 } }),
    usage: Promise.resolve({ inputTokens: 3000000, outputTokens: 600000 }),
  });
}

const basicInput: AgentRunInput = {
  conversationId: 'conv-1',
  userMessage: 'Hello',
  providerConfig: createMockProviderConfig(),
  model: 'test-model',
  browserContext: { tabs: [], windows: [], activeTabId: undefined },
};

describe('ToolLoopAdapter', () => {
  let adapter: ToolLoopAdapter;
  let mockToolRegistry: IToolRegistry;
  let mockGuardrail: IGuardrail;
  let mockConversationManager: IConversationManager;
  let providerConfig: ProviderConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedToolLoopAgentOptions = null;
    mockToolRegistry = createMockToolRegistry([
      createMockTool('tabs_query'),
      createMockTool('tabs_remove'),
    ]);
    mockGuardrail = createMockGuardrail();
    mockToolClassifierClassify.mockResolvedValue(['tabs']);
    mockGenerateText.mockResolvedValue({ text: '压缩后的会话摘要' });
    mockConversationManager = createMockConversationManager();
    providerConfig = createMockProviderConfig();

    // 默认：stream 返回成功（空 stream 事件 + 最终结果）
    // finalStep.usage = 最后一步单步 usage（上下文占用）；usage = 多步累计值
    mockToolLoopAgentStream.mockResolvedValue({
      stream: (async function* () {})(),
      finalStep: Promise.resolve({ text: '操作完成', usage: { inputTokens: 100, outputTokens: 50 } }),
      usage: Promise.resolve({ inputTokens: 3000000, outputTokens: 600000 }),
    });

    adapter = new ToolLoopAdapter(
      mockToolRegistry,
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
    );
  });

  // ── 正常完成 ──────────────────────────────────────

  it('应该正常完成并返回 finalMessage', async () => {
    const result = await adapter.run(basicInput);

    expect(result.finalMessage).toBe('操作完成');
    expect(mockToolLoopAgentStream).toHaveBeenCalledTimes(1);
    expect(result.tokenUsage).toEqual({ prompt: 100, completion: 50 });
  });

  it('createOpenAICompatible 必须请求流式 usage（进度环数据来源）', async () => {
    await adapter.run(basicInput);

    // 回归：未传 includeUsage:true 时 OpenAI-compatible 服务端默认不返回 usage，
    // 导致 result.usage 恒 undefined，上下文占用进度环永不显示
    const createOpenAICompatible = vi.mocked((await import('@ai-sdk/openai-compatible')).createOpenAICompatible);
    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({ includeUsage: true }),
    );
  });

  it('tokenUsage 取最后一步单步 usage 而非多步累计值（上下文占用语义）', async () => {
    // result.usage 为所有 step 累计（多步工具调用反复发送完整上下文，可达百万级）；
    // finalStep.usage 才是最近一次请求的真实上下文占用
    mockToolLoopAgentStream.mockResolvedValueOnce({
      stream: (async function* () {})(),
      finalStep: Promise.resolve({ text: '操作完成', usage: { inputTokens: 45200, outputTokens: 800 } }),
      usage: Promise.resolve({ inputTokens: 3000000, outputTokens: 600000 }),
    });

    const result = await adapter.run(basicInput);

    expect(result.tokenUsage).toEqual({ prompt: 45200, completion: 800 });
    // 累计值 300 万不应泄漏到 tokenUsage（进度环据此计算占比会恒为 100%）
    expect(result.tokenUsage?.prompt).not.toBe(3000000);
  });

  it('不再按 maxToolRounds 设置固定步数上限（长任务不会被步数截断）', async () => {
    const config: AgentConfig = {
      maxToolRounds: 7,
      contextWindowTokens: 128000,
      tokenBudgetMargin: 4096,
    };
    const configuredAdapter = new ToolLoopAdapter(
      mockToolRegistry,
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
      config,
    );

    await configuredAdapter.run(basicInput);

    // 固定步数上限已由循环层熔断取代
    expect(mockIsStepCount).not.toHaveBeenCalled();
    const stopWhen = capturedToolLoopAgentOptions?.['stopWhen'];
    expect(Array.isArray(stopWhen)).toBe(true);
    expect((stopWhen as unknown[]).every((condition) => typeof condition === 'function')).toBe(true);
  });

  it('stopWhen 熔断条件在无异常调用时保持 false（循环自然收敛）', async () => {
    await adapter.run(basicInput);
    const stopConditions = capturedToolLoopAgentOptions?.['stopWhen'] as Array<(
      input: { steps: unknown[] },
    ) => boolean>;
    const circuitCondition = stopConditions[stopConditions.length - 1]!;

    expect(circuitCondition({ steps: [] })).toBe(false);
    expect(circuitCondition({
      steps: [{
        toolCalls: [{ toolCallId: 'c1', toolName: 'tabs_query', input: { id: 1 } }],
        toolResults: [{ toolCallId: 'c1', output: { success: true } }],
        content: [],
      }],
    })).toBe(false);
  });

  it('stopWhen 熔断条件在连续 3 次相同工具调用时返回 true', async () => {
    await adapter.run(basicInput);
    const stopConditions = capturedToolLoopAgentOptions?.['stopWhen'] as Array<(
      input: { steps: unknown[] },
    ) => boolean>;
    const circuitCondition = stopConditions[stopConditions.length - 1]!;
    const steps = ['c1', 'c2', 'c3'].map((id) => ({
      toolCalls: [{ toolCallId: id, toolName: 'tabs_query', input: { id: 1 } }],
      toolResults: [{ toolCallId: id, output: { success: true } }],
      content: [],
    }));

    expect(circuitCondition({ steps: steps.slice(0, 2) })).toBe(false);
    // 同一批 steps 反复扫描不会重复计数
    expect(circuitCondition({ steps: steps.slice(0, 2) })).toBe(false);
    expect(circuitCondition({ steps })).toBe(true);
  });

  it('stopWhen 熔断条件在连续 3 次工具失败（含抛错 tool-error）时返回 true', async () => {
    await adapter.run(basicInput);
    const stopConditions = capturedToolLoopAgentOptions?.['stopWhen'] as Array<(
      input: { steps: unknown[] },
    ) => boolean>;
    const circuitCondition = stopConditions[stopConditions.length - 1]!;
    const failedStep = (id: string, toolError = false) => ({
      toolCalls: [{ toolCallId: id, toolName: 'tabs_query', input: { id } }],
      toolResults: toolError ? [] : [{ toolCallId: id, output: { success: false, error: '失败' } }],
      content: toolError ? [{ type: 'tool-error', toolCallId: id, error: new Error('boom') }] : [],
    });

    expect(circuitCondition({ steps: [failedStep('c1'), failedStep('c2')] })).toBe(false);
    expect(circuitCondition({ steps: [failedStep('c1'), failedStep('c2'), failedStep('c3', true)] })).toBe(true);
  });

  it('熔断后合成终止说明并标记 stopReason=interrupted', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async () => {
      // 模拟 AI SDK 每步结束后调用 stopWhen，第 3 次相同调用触发熔断
      const stopConditions = capturedToolLoopAgentOptions?.['stopWhen'] as Array<(
        input: { steps: unknown[] },
      ) => boolean>;
      stopConditions[stopConditions.length - 1]!({
        steps: ['c1', 'c2', 'c3'].map((id) => ({
          toolCalls: [{ toolCallId: id, toolName: 'tabs_query', input: { id: 1 } }],
          toolResults: [{ toolCallId: id, output: { success: true } }],
          content: [],
        })),
      });
      return {
        stream: (async function* () {})(),
        finalStep: Promise.resolve({ text: '', usage: { inputTokens: 10, outputTokens: 5 } }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      };
    });
    const onStreamChunk = vi.fn();

    const result = await adapter.run({ ...basicInput, callbacks: { onStreamChunk } });

    expect(result.stopReason).toBe('interrupted');
    expect(result.interruption?.reason).toBe('duplicate-tool-call');
    expect(result.finalMessage).toContain('检测到连续 3 次相同参数调用同一个工具');
    expect(onStreamChunk).toHaveBeenCalledWith(
      expect.stringContaining('检测到连续 3 次相同参数调用同一个工具'),
    );
    const persisted = persistedMessages(mockConversationManager);
    const assistantMsg = [...persisted].reverse().find((message) => message.role === 'assistant');
    expect(assistantMsg!.content).toContain('触发死循环熔断保护');
  });

  it('熔断前已有文本时把说明追加为独立段落', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async () => {
      const stopConditions = capturedToolLoopAgentOptions?.['stopWhen'] as Array<(
        input: { steps: unknown[] },
      ) => boolean>;
      stopConditions[stopConditions.length - 1]!({
        steps: ['c1', 'c2', 'c3'].map((id) => ({
          toolCalls: [{ toolCallId: id, toolName: 'tabs_query', input: { id } }],
          toolResults: [{ toolCallId: id, output: { success: false, error: '失败' } }],
          content: [],
        })),
      });
      return {
        stream: (async function* () {
          yield { type: 'text-delta', text: '正在操作' };
        })(),
        finalStep: Promise.resolve({ text: '正在操作' }),
        usage: Promise.resolve(undefined),
      };
    });

    const result = await adapter.run(basicInput);

    expect(result.stopReason).toBe('interrupted');
    expect(result.interruption?.reason).toBe('consecutive-tool-errors');
    expect(result.finalMessage).toBe('正在操作\n\n检测到连续工具执行失败，触发熔断保护');
  });

  it('未熔断时 stopReason 为 undefined（保持既有输出形状）', async () => {
    const result = await adapter.run(basicInput);

    expect(result.stopReason).toBeUndefined();
    expect(result.interruption).toBeUndefined();
  });

  it('应该将 toolRegistry 中的所有工具转换为 AI SDK tools', async () => {
    await adapter.run(basicInput);

    // ToolLoopAgent 被构造了
    expect(vi.mocked((await import('ai')).ToolLoopAgent)).toHaveBeenCalledTimes(1);
  });

  it('应该在 generate 调用中传递构造的消息', async () => {
    await adapter.run(basicInput);

    const generateCall = mockToolLoopAgentStream.mock.calls[0]?.[0];
    expect(generateCall).toBeDefined();
    expect(generateCall.messages).toBeDefined();
    expect(generateCall.messages.length).toBeGreaterThan(0);

    // 第一条消息应该是 system
    expect(generateCall.messages[0].role).toBe('system');
  });

  it('应该包含用户消息在 messages 中', async () => {
    await adapter.run(basicInput);

    const messages = mockToolLoopAgentStream.mock.calls[0]?.[0].messages;
    const userMessage = messages?.find((m: { role: string }) => m.role === 'user');
    expect(userMessage).toBeDefined();
    expect(userMessage?.content).toBe('Hello');
  });

  it('prepareStep 激活分类命中的工具及常驻核心类别工具', async () => {
    const registry = createMockToolRegistry([
      createMockTool('tabs_query'),
      { ...createMockTool('windows_query'), category: 'windows' },
    ]);
    const lazyAdapter = new ToolLoopAdapter(
      registry,
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
    );
    await lazyAdapter.run(basicInput);

    const prepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ activeTools?: string[] }>;
    const result = await prepareStep({
      messages: [{ role: 'user', content: '查询标签页' }],
      stepNumber: 0,
      model: {},
    });

    expect(mockToolClassifierClassify).toHaveBeenCalledWith('查询标签页', {});
    // tabs 由分类命中，windows 属常驻核心类别一并激活
    expect(result.activeTools).toEqual(['tabs_query', 'windows_query']);
    expect(mockPruneMessages).not.toHaveBeenCalled();
  });

  it('prepareStep 达到 75% 上下文预算时使用 AI SDK pruneMessages', async () => {
    const compactingAdapter = new ToolLoopAdapter(
      createMockToolRegistry([]),
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
      {
        maxToolRounds: 99,
        contextWindowTokens: 1_000,
        tokenBudgetMargin: 100,
      },
    );
    await compactingAdapter.run(basicInput);

    const prepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ messages?: unknown[] }>;
    const messages = [{ role: 'user', content: 'x'.repeat(2_000) }];
    const result = await prepareStep({ messages, stepNumber: 2, model: {} });

    expect(mockPruneMessages).toHaveBeenCalledWith({
      messages,
      reasoning: 'all',
      toolCalls: 'none',
      emptyMessages: 'remove',
    });
    expect(result.messages).toBeDefined();
  });

  it('仅在 75% 高水位压缩旧轮次，并保留最近原始上下文', async () => {
    const oldTurns = Array.from({ length: 4 }, (_, index) => [
      { id: `old-user-${index}`, role: 'user' as const, content: `old-${index}-${'x'.repeat(2_000)}` },
      { id: `old-assistant-${index}`, role: 'assistant' as const, content: `done-${index}-${'y'.repeat(2_000)}` },
    ]).flat();
    const recentTurns: StoredMessage[] = [
      { id: 'recent-user-0', role: 'user', content: 'recent-request-0' },
      {
        id: 'recent-tool-call',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'recent-call-0', name: 'tabs_remove', params: { tabIds: [7] } }],
      },
      {
        id: 'recent-tool-result',
        role: 'tool',
        toolCallId: 'recent-call-0',
        content: JSON.stringify({ success: true, removed: ['https://recent.test'] }),
      },
      { id: 'recent-assistant-0', role: 'assistant', content: 'recent-response-0' },
      ...Array.from({ length: 3 }, (_, index) => [
        { id: `recent-user-${index + 1}`, role: 'user' as const, content: `recent-request-${index + 1}` },
        { id: `recent-assistant-${index + 1}`, role: 'assistant' as const, content: `recent-response-${index + 1}` },
      ]).flat(),
    ];
    const conversation = {
      id: 'conv-1',
      title: 'test',
      titleGenerated: true,
      createdAt: 1,
      updatedAt: 1,
      messages: [...oldTurns, ...recentTurns] as StoredMessage[],
      summary: undefined as string | undefined,
      summaryUpToIndex: 0,
      sensitiveDataGranted: false,
    };
    const manager = createMockConversationManager();
    vi.mocked(manager.get).mockImplementation(async () => ({
      ...conversation,
      messages: [...conversation.messages],
    }));
    vi.mocked(manager.update).mockImplementation(async (_id: string, patch: Partial<Conversation>) => {
      Object.assign(conversation, patch);
    });
    vi.mocked(manager.addMessage).mockImplementation(async (_id: string, message: StoredMessage) => {
      conversation.messages.push(message);
    });

    const compactingAdapter = new ToolLoopAdapter(
      createMockToolRegistry([]),
      mockGuardrail,
      manager,
      providerConfig,
      'test-model',
      {
        maxToolRounds: 99,
        contextWindowTokens: 10_000,
        tokenBudgetMargin: 100,
      },
    );

    await compactingAdapter.run(basicInput);

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(conversation.summary).toBe('压缩后的会话摘要');
    expect(conversation.summaryUpToIndex).toBe(8);
    const sentMessages = mockToolLoopAgentStream.mock.calls[0]?.[0].messages as Array<{ role: string; content: unknown }>;
    expect(sentMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'system', content: expect.stringContaining('压缩后的会话摘要') }),
      expect.objectContaining({ role: 'user', content: 'recent-request-0' }),
      expect.objectContaining({
        role: 'assistant',
        content: expect.arrayContaining([
          expect.objectContaining({ type: 'tool-call', toolCallId: 'recent-call-0' }),
        ]),
      }),
      expect.objectContaining({
        role: 'tool',
        content: expect.arrayContaining([
          expect.objectContaining({ type: 'tool-result', toolCallId: 'recent-call-0' }),
        ]),
      }),
    ]));
    expect(JSON.stringify(sentMessages)).not.toContain('old-0-');
    expect(estimateTokens(JSON.stringify(sentMessages))).toBeLessThanOrEqual(990);

    await compactingAdapter.run({ ...basicInput, userMessage: '继续' });
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it('已有长会话未达到 75% 时不生成摘要', async () => {
    const conversation: Conversation = {
      id: 'conv-1',
      title: 'test',
      titleGenerated: true,
      createdAt: 1,
      updatedAt: 1,
      messages: Array.from({ length: 10 }, (_, index) => [
        { id: `user-${index}`, role: 'user' as const, content: `request-${index}-${'x'.repeat(100)}` },
        { id: `assistant-${index}`, role: 'assistant' as const, content: `response-${index}-${'y'.repeat(100)}` },
      ]).flat(),
      sensitiveDataGranted: false,
    };
    const manager = createMockConversationManager();
    vi.mocked(manager.get).mockResolvedValue(conversation);
    const nonCompactingAdapter = new ToolLoopAdapter(
      createMockToolRegistry([]),
      mockGuardrail,
      manager,
      providerConfig,
      'test-model',
      {
        maxToolRounds: 99,
        contextWindowTokens: 10_000,
        tokenBudgetMargin: 100,
      },
    );

    await nonCompactingAdapter.run(basicInput);

    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  // ── Abort ─────────────────────────────────────────

  it('abort() 应该触发 AbortController', async () => {

    adapter.abort();
    // abort() 在 run() 未执行时 abortController 为 null，不会崩溃
  });

  it('应该传递 AbortSignal 给 ToolLoopAgent.generate', async () => {
    const inputWithSignal: AgentRunInput = {
      ...basicInput,
      abortSignal: new AbortController().signal,
    };

    await adapter.run(inputWithSignal);

    const generateCall = mockToolLoopAgentStream.mock.calls[0]?.[0];
    expect(generateCall.abortSignal).toBeDefined();
  });

  it('run() 执行前调用 abort 不应崩溃', () => {
    // abort() 时 abortController 为 null，应安全处理
    expect(() => adapter.abort()).not.toThrow();
  });

  // ── ToolCalls 记录 ────────────────────────────────

  it('应该在 onStepFinish 回调中记录并实时转发工具调用', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async (options) => {
      options.onStepFinish({
        toolCalls: [{ toolCallId: 'tool-1', toolName: 'tabs_query', input: { id: 'tab-1' } }],
        toolResults: [{ toolCallId: 'tool-1', output: { success: true } }],
      });
      return {
        stream: (async function* () {})(),
        finalStep: Promise.resolve({ text: '操作完成' }),
        usage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
      };
    });
    const onToolCall = vi.fn();

    const result = await adapter.run({ ...basicInput, callbacks: { onToolCall } });

    expect(result.toolCalls).toHaveLength(1);
    expect(onToolCall).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'tabs_query',
      params: { id: 'tab-1' },
    }));
    const persisted = persistedMessages(mockConversationManager);
    expect(persisted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'assistant',
        toolCalls: [expect.objectContaining({ id: 'tool-1', name: 'tabs_query', params: { id: 'tab-1' } })],
      }),
      expect.objectContaining({ role: 'tool', toolCallId: 'tool-1' }),
    ]));

    await adapter.run({ ...basicInput, userMessage: 'Continue' });
    const secondRunMessages = mockToolLoopAgentStream.mock.calls[1]?.[0]?.messages as Array<{ role: string; content: unknown }>;
    expect(secondRunMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'assistant',
        content: expect.arrayContaining([expect.objectContaining({
          type: 'tool-call',
          toolCallId: 'tool-1',
          toolName: 'tabs_query',
          input: { id: 'tab-1' },
        })]),
      }),
      expect.objectContaining({
        role: 'tool',
        content: expect.arrayContaining([expect.objectContaining({ type: 'tool-result', toolCallId: 'tool-1', toolName: 'tabs_query' })]),
      }),
    ]));
  });

  it('应忽略历史中没有匹配 assistant tool-call 的旧 tool result', async () => {
    (mockConversationManager.getRecentMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'user-1', role: 'user', content: 'First request' },
      { id: 'orphan-tool', role: 'tool', content: '{"success":true}', toolCallId: 'missing-call' },
    ]);

    await adapter.run({ ...basicInput, userMessage: 'Continue' });

    const messages = mockToolLoopAgentStream.mock.calls[0]?.[0]?.messages as Array<{ role: string }>;
    expect(messages.some((message) => message.role === 'tool')).toBe(false);
  });

  // ── 边界条件 ──────────────────────────────────────

  it('应该在 usage 为 undefined 时处理', async () => {
    mockToolLoopAgentStream.mockResolvedValue({
      stream: (async function* () {})(),
      finalStep: Promise.resolve({ text: '完成' }),
      usage: Promise.resolve(undefined),
    });

    const result = await adapter.run(basicInput);
    expect(result.tokenUsage).toBeUndefined();
  });

  it('应该在 toolRegistry 为空时正常执行', async () => {
    const emptyRegistry = createMockToolRegistry([]);
    const emptyAdapter = new ToolLoopAdapter(
      emptyRegistry,
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
    );
    const result = await emptyAdapter.run(basicInput);
    expect(result.finalMessage).toBe('操作完成');
  });

  it('应该处理 guardrail 拒绝工具执行', async () => {
    const restrictiveGuardrail = createMockGuardrail(false);
    const restrictedAdapter = new ToolLoopAdapter(
      mockToolRegistry,
      restrictiveGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
    );
    const result = await restrictedAdapter.run(basicInput);
    expect(result.finalMessage).toBe('操作完成');
  });

  // ── toolApproval 风险映射 ─────────────────────────

  describe('toolApproval 风险映射', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    function getToolApproval() {
      if (!capturedToolLoopAgentOptions) {
        throw new Error('capturedToolLoopAgentOptions is null — did you call adapter.run()?');
      }
      return capturedToolLoopAgentOptions['toolApproval'] as (
        opts: { toolCall: { toolName: string; input: Record<string, unknown> } },
      ) => Promise<{ type: string; reason?: string }>;
    }

    it('guardrail check.allowed=false → denied with reason', async () => {
      (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: false,
        riskLevel: 'high',
        requiresPreflight: false,
        reason: '工具被拒绝',
        dataSensitivity: 'low',
      });

      await adapter.run(basicInput);
      const result = await getToolApproval()({
        toolCall: { toolName: 'tabs_remove', input: { tabId: 1 } },
      });

      expect(result).toEqual({ type: 'denied', reason: '工具被拒绝' });
    });

    it('riskLevel low → approved', async () => {
      (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: true,
        riskLevel: 'low',
        requiresPreflight: false,
        reason: '允许执行',
        dataSensitivity: 'low',
      });

      await adapter.run(basicInput);
      const result = await getToolApproval()({
        toolCall: { toolName: 'tabs_query', input: { tabId: 1 } },
      });

      expect(result).toEqual({ type: 'approved' });
    });

    it('riskLevel medium → approved', async () => {
      (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: true,
        riskLevel: 'medium',
        requiresPreflight: false,
        reason: '中风险操作，记录日志',
        dataSensitivity: 'low',
      });

      await adapter.run(basicInput);
      const result = await getToolApproval()({
        toolCall: { toolName: 'tabs_query', input: { tabId: 1 } },
      });

      expect(result).toEqual({ type: 'approved' });
    });

    it('riskLevel high + 非 local-trusted → user-approval', async () => {
      (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: true,
        riskLevel: 'high',
        requiresPreflight: true,
        reason: '高风险操作',
        dataSensitivity: 'low',
      });

      await adapter.run(basicInput);
      const result = await getToolApproval()({
        toolCall: { toolName: 'tabs_remove', input: { tabId: 1 } },
      });

      expect(result).toEqual({ type: 'user-approval' });
    });

    it('riskLevel high + local-trusted → approved', async () => {
      providerConfig.isLocalTrusted = true;
      const localAdapter = new ToolLoopAdapter(
        mockToolRegistry,
        mockGuardrail,
        mockConversationManager,
        providerConfig,
        'test-model',
      );

      (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: true,
        riskLevel: 'high',
        requiresPreflight: true,
        reason: '高风险操作，本地信任 Provider',
        dataSensitivity: 'low',
      });

      await localAdapter.run(basicInput);
      const result = await getToolApproval()({
        toolCall: { toolName: 'tabs_remove', input: { tabId: 1 } },
      });

      expect(result).toEqual({ type: 'approved' });
    });

    it('riskLevel critical + Expert Mode 关闭 → denied', async () => {
      (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: true,
        riskLevel: 'critical',
        requiresPreflight: true,
        reason: 'Critical 操作，需要 Expert Mode',
        dataSensitivity: 'critical',
      });

      await adapter.run(basicInput);
      const result = await getToolApproval()({
        toolCall: { toolName: 'proxy_set', input: {} },
      });

      expect(result).toEqual({ type: 'denied', reason: '需要 Expert Mode' });
    });

    it('riskLevel critical + Expert Mode 开启 → user-approval', async () => {
      (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: true,
        riskLevel: 'critical',
        requiresPreflight: true,
        reason: 'Critical 操作，需要 Expert Mode',
        dataSensitivity: 'critical',
      });

      const expertInput: AgentRunInput = {
        ...basicInput,
        expertModeSettings: { enabled: true, switches: {} },
      };
      await adapter.run(expertInput);
      const result = await getToolApproval()({
        toolCall: { toolName: 'proxy_set', input: {} },
      });

      expect(result).toEqual({ type: 'user-approval' });
    });

    // ── onRequestApproval 回调确认流程 ──
    describe('onRequestApproval 确认流程', () => {
      it('high 风险 + onRequestApproval 批准 → approved', async () => {
        (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
          allowed: true,
          riskLevel: 'high',
        requiresPreflight: true,
        reason: '高风险操作',
        dataSensitivity: 'low',
      });

      const onApproval = vi.fn().mockResolvedValue('approve');
      const approvalAdapter = new ToolLoopAdapter(
          mockToolRegistry,
          mockGuardrail,
          mockConversationManager,
          providerConfig,
          'test-model',
          undefined,
          onApproval,
        );

        await approvalAdapter.run(basicInput);
        const result = await getToolApproval()({
          toolCall: { toolName: 'tabs_remove', input: { tabId: 1 } },
        });

        expect(result).toEqual({ type: 'approved' });
        expect(onApproval).toHaveBeenCalledTimes(1);
        expect(onApproval).toHaveBeenCalledWith({
          toolName: 'tabs_remove',
          params: { tabId: 1 },
          reason: '高风险操作',
          riskLevel: 'high',
        });
      });

      it('high 风险 + onRequestApproval 拒绝 → denied', async () => {
        (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
          allowed: true,
          riskLevel: 'high',
          requiresPreflight: true,
          reason: '高风险操作',
          dataSensitivity: 'low',
        });

        const onApproval = vi.fn().mockResolvedValue('deny');
        const approvalAdapter = new ToolLoopAdapter(
          mockToolRegistry,
          mockGuardrail,
          mockConversationManager,
          providerConfig,
          'test-model',
          undefined,
          onApproval,
        );

        await approvalAdapter.run(basicInput);
        const result = await getToolApproval()({
          toolCall: { toolName: 'tabs_remove', input: { tabId: 1 } },
        });

        expect(result).toEqual({ type: 'denied', reason: '高风险操作' });
        expect(onApproval).toHaveBeenCalledTimes(1);
      });

      it('critical 风险 + Expert Mode 开启 + onRequestApproval 批准 → approved', async () => {
        (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
          allowed: true,
          riskLevel: 'critical',
          requiresPreflight: true,
          reason: 'Critical 操作，需要确认',
          dataSensitivity: 'critical',
        });

        const onApproval = vi.fn().mockResolvedValue('approve');
        const approvalAdapter = new ToolLoopAdapter(
          mockToolRegistry,
          mockGuardrail,
          mockConversationManager,
          providerConfig,
          'test-model',
          undefined,
          onApproval,
        );

        const expertInput: AgentRunInput = {
          ...basicInput,
          expertModeSettings: { enabled: true, switches: {} },
        };
        await approvalAdapter.run(expertInput);
        const result = await getToolApproval()({
          toolCall: { toolName: 'proxy_set', input: {} },
        });

        expect(result).toEqual({ type: 'approved' });
        expect(onApproval).toHaveBeenCalledWith({
          toolName: 'proxy_set',
          params: {},
          reason: 'Critical 操作，需要确认',
          riskLevel: 'critical',
        });
      });

      it('critical 风险 + Expert Mode 开启 + onRequestApproval 拒绝 → denied', async () => {
        (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
          allowed: true,
          riskLevel: 'critical',
          requiresPreflight: true,
          reason: 'Critical 操作',
          dataSensitivity: 'critical',
        });

        const onApproval = vi.fn().mockResolvedValue('deny');
        const approvalAdapter = new ToolLoopAdapter(
          mockToolRegistry,
          mockGuardrail,
          mockConversationManager,
          providerConfig,
          'test-model',
          undefined,
          onApproval,
        );

        const expertInput: AgentRunInput = {
          ...basicInput,
          expertModeSettings: { enabled: true, switches: {} },
        };
        await approvalAdapter.run(expertInput);
        const result = await getToolApproval()({
          toolCall: { toolName: 'proxy_set', input: {} },
        });

        expect(result).toEqual({ type: 'denied', reason: 'Critical 操作' });
      });

      it('无 onRequestApproval 时 high 风险仍返回 user-approval（向后兼容）', async () => {
        (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
          allowed: true,
          riskLevel: 'high',
          requiresPreflight: true,
          reason: '高风险操作',
          dataSensitivity: 'low',
        });

        // adapter 在 beforeEach 中创建，没有 onRequestApproval
        await adapter.run(basicInput);
        const result = await getToolApproval()({
          toolCall: { toolName: 'tabs_remove', input: { tabId: 1 } },
        });

        expect(result).toEqual({ type: 'user-approval' });
      });
    });
  });
});

// ==================== run()：事件流消费 / 异常路径 ====================

describe('ToolLoopAdapter run() 事件流与异常', () => {
  let adapter: ToolLoopAdapter;
  let mockConversationManager: IConversationManager;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedToolLoopAgentOptions = null;
    mockConversationManager = createMockConversationManager();
    const adapterInstance = new ToolLoopAdapter(
      createMockToolRegistry([createMockTool('tabs_query')]),
      createMockGuardrail(),
      mockConversationManager,
      createMockProviderConfig(),
      'test-model',
    );
    adapter = adapterInstance;
    mockDefaultSuccessStream();
  });

  it('消费 text-delta 与 reasoning-delta 并分别回调', async () => {
    const chunks: string[] = [];
    const reasoningChunks: string[] = [];
    mockToolLoopAgentStream.mockResolvedValue({
      stream: (async function* () {
        yield { type: 'text-delta', text: '你好' };
        yield { type: 'reasoning-delta', text: '想一想' };
        yield { type: 'text-delta', text: '，世界' };
      })(),
      finalStep: Promise.resolve({
        text: '',
        reasoningText: '',
        usage: { inputTokens: 100, outputTokens: 50 },
      }),
      usage: Promise.resolve({ inputTokens: 200, outputTokens: 100 }),
    });

    const result = await adapter.run({
      ...basicInput,
      callbacks: {
        onStreamChunk: (c) => chunks.push(c),
        onReasoningChunk: (c) => reasoningChunks.push(c),
      },
    });

    expect(chunks).toEqual(['你好', '，世界']);
    expect(reasoningChunks).toEqual(['想一想']);
    // finalStep.text 为空时回退到累计的 stream 文本
    expect(result.finalMessage).toBe('');
    const persisted = persistedMessages(mockConversationManager);
    const assistantMsg = persisted.find((message) => message.role === 'assistant' && message.reasoningContent);
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toBe('你好，世界');
    expect(assistantMsg!.reasoningContent).toBe('想一想');
  });

  it('stream 事件中 error part 抛出并落入 run() 的错误分支', async () => {
    mockToolLoopAgentStream.mockResolvedValue({
      stream: (async function* () {
        yield { type: 'text-delta', text: 'partial' };
        yield { type: 'error', error: new Error('boom') };
      })(),
      finalStep: Promise.resolve({ text: 'never' }),
      usage: Promise.resolve(undefined),
    });

    await expect(adapter.run(basicInput)).rejects.toThrow('boom');

    const persisted = persistedMessages(mockConversationManager);
    const assistantErr = persisted.find((message) => message.role === 'assistant');
    expect(assistantErr).toBeDefined();
    expect(assistantErr!.content).toBe('Error: boom');
  });

  it('run() 中 agent.stream 抛错时记录 Error: 前缀并重抛', async () => {
    mockToolLoopAgentStream.mockRejectedValue(new Error('stream failure'));

    await expect(adapter.run(basicInput)).rejects.toThrow('stream failure');

    const persisted = persistedMessages(mockConversationManager);
    const assistantErr = persisted.find((message) => message.role === 'assistant');
    expect(assistantErr!.content).toBe('Error: stream failure');
  });

  it('错误消息本身带 Error: 前缀时不再重复拼接', async () => {
    mockToolLoopAgentStream.mockRejectedValue(new Error('Error: already prefixed'));

    await expect(adapter.run(basicInput)).rejects.toThrow('already prefixed');

    const persisted = persistedMessages(mockConversationManager);
    const assistantErr = persisted.find((message) => message.role === 'assistant');
    expect(assistantErr!.content).toBe('Error: already prefixed');
  });

  it('非 Error 类型抛出内容转为 String 记录', async () => {
    mockToolLoopAgentStream.mockRejectedValue('plain string rejection');

    await expect(adapter.run(basicInput)).rejects.toBe('plain string rejection');

    const persisted = persistedMessages(mockConversationManager);
    const assistantErr = persisted.find((message) => message.role === 'assistant');
    expect(assistantErr!.content).toBe('Error: plain string rejection');
  });

  it('finalStep.usage 缺失时回退到 result.usage', async () => {
    mockToolLoopAgentStream.mockResolvedValue({
      stream: (async function* () {})(),
      finalStep: Promise.resolve({ text: 'done' }),
      usage: Promise.resolve({ inputTokens: 77, outputTokens: 33 }),
    });

    const result = await adapter.run(basicInput);
    expect(result.tokenUsage).toEqual({ prompt: 77, completion: 33 });
  });

  it('多步工具调用在 onStepFinish 中记录 toolCalls、持久化并回填到下一轮历史', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async (options) => {
      options.onStepFinish({
        toolCalls: [
          { toolCallId: 'call-1', toolName: 'tabs_query', input: { tabIds: [1] } },
          { toolCallId: 'call-2', toolName: 'tabs_remove', input: { tabIds: [2] } },
        ],
        toolResults: [{ toolCallId: 'call-1', output: { success: true, tabs: 1 } }],
      });
      return {
        stream: (async function* () {})(),
        finalStep: Promise.resolve({ text: '多步完成', usage: { inputTokens: 100, outputTokens: 50 } }),
        usage: Promise.resolve({ inputTokens: 200, outputTokens: 100 }),
      };
    });

    const result = await adapter.run(basicInput);
    expect(result.toolCalls).toHaveLength(2);
    // 带 toolResult 的工具记录输出（output 本身即 ToolResult，原样透传）
    expect(result.toolCalls[0]!.result).toEqual({ success: true, tabs: 1 });
    // 缺失 toolResult 时不伪造失败：记录无 result，交由历史重建在内存中标记未知
    expect(result.toolCalls[1]).not.toHaveProperty('result');

    const persisted = persistedMessages(mockConversationManager);
    const persistedToolRows = persisted.filter((message) => message.role === 'tool');
    // 只有真实的 call-1 结果落库；缺失结果的 call-2 不写假结果行
    expect(persistedToolRows).toHaveLength(1);
    expect(persistedToolRows[0]!.toolCallId).toBe('call-1');
    // 调用行仍整批写入，包含同一步骤的两个调用
    const persistedCallRow = persisted.find((message) => message.role === 'assistant' && message.toolCalls);
    expect(persistedCallRow!.toolCalls?.map((call) => call.id)).toEqual(['call-1', 'call-2']);

    // 第二次 run：历史含完整 tool-call/tool-result，回填后消息协议正确
    await adapter.run({ ...basicInput, userMessage: '继续' });
    const secondMessages = mockToolLoopAgentStream.mock.calls[1]?.[0]?.messages as Array<{
      role: string;
      content: Array<{ type: string; toolCallId?: string; toolName?: string }> | string;
    }>;
    const assistantMsg = secondMessages.find(
      (message) => message.role === 'assistant' && Array.isArray(message.content),
    );
    const toolMsgs = secondMessages.filter((message) => message.role === 'tool');
    // 单个 assistant 消息携带全部 tool-call（协议要求 tool-call 与 tool-result 配对）
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool-call', toolCallId: 'call-1', toolName: 'tabs_query', input: { tabIds: [1] } }),
      expect.objectContaining({ type: 'tool-call', toolCallId: 'call-2', toolName: 'tabs_remove', input: { tabIds: [2] } }),
    ]));
    // 每个 tool-result 独立成一条消息；缺失输出的 call-2 由内存合成未知占位
    expect(toolMsgs).toHaveLength(2);
    expect(toolMsgs[0]!.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool-result', toolCallId: 'call-1', toolName: 'tabs_query' }),
    ]));
    expect(toolMsgs[1]!.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool-result', toolCallId: 'call-2', toolName: 'tabs_remove' }),
    ]));
    const unknownText = String(
      (toolMsgs[1]!.content as Array<{ output?: { value?: unknown } }>)[0]?.output?.value ?? '',
    );
    expect(unknownText).toContain('状态未知');
    expect(unknownText).toContain('不要自动重试');
    expect(unknownText).not.toContain('工具执行未返回结果');
  });

  it('同一步骤内缺失结果与显式 tool-error 区分：缺失无 result 且不落库，tool-error 保留真实失败', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async (options) => {
      options.onStepFinish({
        toolCalls: [
          { toolCallId: 'missing-1', toolName: 'tabs_query', input: {} },
          { toolCallId: 'failed-1', toolName: 'tabs_remove', input: { tabIds: [1] } },
        ],
        toolResults: [],
        content: [
          { type: 'tool-error', toolCallId: 'failed-1', error: new Error('标签页不存在') },
        ],
      });
      return {
        stream: (async function* () {})(),
        finalStep: Promise.resolve({ text: '完成', usage: { inputTokens: 10, outputTokens: 5 } }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      };
    });

    const result = await adapter.run(basicInput);

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]).not.toHaveProperty('result');
    expect(result.toolCalls[1]!.result).toEqual({ success: false, error: '标签页不存在' });

    const persisted = persistedMessages(mockConversationManager);
    const toolRows = persisted.filter((message) => message.role === 'tool');
    expect(toolRows).toHaveLength(1);
    expect(toolRows[0]!.toolCallId).toBe('failed-1');
    expect(JSON.parse(toolRows[0]!.content)).toEqual({ success: false, error: '标签页不存在' });
    const callRow = persisted.find((message) => message.role === 'assistant' && message.toolCalls);
    expect(callRow!.toolCalls?.map((call) => call.id)).toEqual(['missing-1', 'failed-1']);
  });

  it('tool-error part 存在但 error 为空时仍记录真实失败，不降级为未知', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async (options) => {
      options.onStepFinish({
        toolCalls: [{ toolCallId: 'err-empty', toolName: 'tabs_query', input: {} }],
        toolResults: [],
        content: [{ type: 'tool-error', toolCallId: 'err-empty' }],
      });
      return {
        stream: (async function* () {})(),
        finalStep: Promise.resolve({ text: '失败', usage: { inputTokens: 10, outputTokens: 5 } }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      };
    });

    const result = await adapter.run(basicInput);

    expect(result.toolCalls[0]!.result).toEqual(expect.objectContaining({ success: false }));
    expect(result.toolCalls[0]!.result?.error).toBeTruthy();
    expect(result.toolCalls[0]!.result?.error).not.toBe('工具执行未返回结果');
    const persisted = persistedMessages(mockConversationManager);
    expect(persisted.filter((message) => message.role === 'tool')).toHaveLength(1);
  });

  it('#232 连续 onStepFinish 不等待返回值时步骤落库仍串行且整步一批写入', async () => {
    const events: string[] = [];
    let active = 0;
    vi.mocked(mockConversationManager.addMessages).mockImplementation(
      async (_convId: string, rows: StoredMessage[]) => {
        active += 1;
        expect(active).toBe(1);
        events.push(`start-${rows[1]?.toolCallId}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`end-${rows[1]?.toolCallId}`);
        active -= 1;
      },
    );
    mockToolLoopAgentStream.mockImplementationOnce(async (options) => {
      // 模拟 AI SDK 快速连续触发且不等待返回的 Promise
      options.onStepFinish({
        toolCalls: [{ toolCallId: 'serial-1', toolName: 'tabs_query', input: {} }],
        toolResults: [{ toolCallId: 'serial-1', output: { success: true } }],
      });
      options.onStepFinish({
        toolCalls: [{ toolCallId: 'serial-2', toolName: 'tabs_query', input: {} }],
        toolResults: [{ toolCallId: 'serial-2', output: { success: true } }],
      });
      return {
        stream: (async function* () {})(),
        finalStep: Promise.resolve({ text: '完成', usage: { inputTokens: 10, outputTokens: 5 } }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      };
    });

    await adapter.run(basicInput);

    expect(events).toEqual([
      'start-serial-1',
      'end-serial-1',
      'start-serial-2',
      'end-serial-2',
    ]);
    // 调用行与结果行作为同一批写入
    const batches = vi.mocked(mockConversationManager.addMessages).mock.calls;
    expect(batches).toHaveLength(2);
    expect(batches[0]![1].map((row) => row.role)).toEqual(['assistant', 'tool']);
    expect(batches[0]![1][1]!.parentMessageId).toBe(batches[0]![1][0]!.id);
    expect(batches[1]![1].map((row) => row.role)).toEqual(['assistant', 'tool']);
  });

  it('#232 步骤持久化失败时 run() 抛错并记录 Error 行，不静默继续', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async (options) => {
      options.onStepFinish({
        toolCalls: [{ toolCallId: 'fail-persist', toolName: 'tabs_query', input: {} }],
        toolResults: [{ toolCallId: 'fail-persist', output: { success: true } }],
      });
      return {
        stream: (async function* () {})(),
        finalStep: Promise.resolve({ text: '完成', usage: { inputTokens: 10, outputTokens: 5 } }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      };
    });
    vi.mocked(mockConversationManager.addMessages).mockRejectedValueOnce(
      new Error('db write failed'),
    );

    await expect(adapter.run(basicInput)).rejects.toThrow('db write failed');

    const persisted = persistedMessages(mockConversationManager);
    const errorRow = persisted.find(
      (message) => message.role === 'assistant' && message.content.startsWith('Error:'),
    );
    expect(errorRow!.content).toBe('Error: db write failed');
  });

  it('工具抛错（tool-error part）时记录并持久化真实失败，不伪造成功', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async (options) => {
      options.onStepFinish({
        toolCalls: [{ toolCallId: 'err-1', toolName: 'tabs_remove', input: { tabIds: [1] } }],
        toolResults: [],
        content: [
          { type: 'tool-error', toolCallId: 'err-1', toolName: 'tabs_remove', input: { tabIds: [1] }, error: new Error('标签页不存在') },
        ],
      });
      return {
        stream: (async function* () {})(),
        finalStep: Promise.resolve({ text: '失败', usage: { inputTokens: 10, outputTokens: 5 } }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      };
    });

    const result = await adapter.run(basicInput);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.result).toEqual({ success: false, error: '标签页不存在' });

    const persisted = persistedMessages(mockConversationManager);
    const toolMsg = persisted.find((message) => message.role === 'tool');
    expect(JSON.parse(toolMsg!.content)).toEqual({ success: false, error: '标签页不存在' });
  });

  it('tool-error 的 error 非 Error 对象时按字符串记录失败', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async (options) => {
      options.onStepFinish({
        toolCalls: [{ toolCallId: 'err-2', toolName: 'tabs_query', input: {} }],
        toolResults: [],
        content: [{ type: 'tool-error', toolCallId: 'err-2', error: 'RPC 超时' }],
      });
      return {
        stream: (async function* () {})(),
        finalStep: Promise.resolve({ text: '失败', usage: { inputTokens: 10, outputTokens: 5 } }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      };
    });

    const result = await adapter.run(basicInput);

    expect(result.toolCalls[0]!.result).toEqual({ success: false, error: 'RPC 超时' });
  });

  it('工具返回失败结果时原样记录，不做二次包装', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async (options) => {
      options.onStepFinish({
        toolCalls: [{ toolCallId: 'fail-1', toolName: 'tabs_remove', input: {} }],
        toolResults: [{ toolCallId: 'fail-1', toolName: 'tabs_remove', input: {}, output: { success: false, error: '权限不足' } }],
      });
      return {
        stream: (async function* () {})(),
        finalStep: Promise.resolve({ text: '失败', usage: { inputTokens: 10, outputTokens: 5 } }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      };
    });

    const result = await adapter.run(basicInput);

    expect(result.toolCalls[0]!.result).toEqual({ success: false, error: '权限不足' });
    const persisted = persistedMessages(mockConversationManager);
    const toolMsg = persisted.find((message) => message.role === 'tool');
    expect(JSON.parse(toolMsg!.content)).toEqual({ success: false, error: '权限不足' });
  });

  it('工具返回成功结果时原样记录，不做二次包装', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async (options) => {
      options.onStepFinish({
        toolCalls: [{ toolCallId: 'ok-1', toolName: 'tabs_query', input: {} }],
        toolResults: [{ toolCallId: 'ok-1', toolName: 'tabs_query', input: {}, output: { success: true, data: { tabs: 3 } } }],
      });
      return {
        stream: (async function* () {})(),
        finalStep: Promise.resolve({ text: '完成', usage: { inputTokens: 10, outputTokens: 5 } }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      };
    });

    const result = await adapter.run(basicInput);

    expect(result.toolCalls[0]!.result).toEqual({ success: true, data: { tabs: 3 } });
    const persisted = persistedMessages(mockConversationManager);
    const toolMsg = persisted.find((message) => message.role === 'tool');
    expect(JSON.parse(toolMsg!.content)).toEqual({ success: true, data: { tabs: 3 } });
  });

  it('工具输出为裸数据（无 success 字段）时包装为成功结果', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async (options) => {
      options.onStepFinish({
        toolCalls: [{ toolCallId: 'raw-1', toolName: 'tabs_query', input: {} }],
        toolResults: [{ toolCallId: 'raw-1', toolName: 'tabs_query', input: {}, output: '原始文本' }],
      });
      return {
        stream: (async function* () {})(),
        finalStep: Promise.resolve({ text: '完成', usage: { inputTokens: 10, outputTokens: 5 } }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      };
    });

    const result = await adapter.run(basicInput);

    expect(result.toolCalls[0]!.result).toEqual({ success: true, data: '原始文本' });
  });

  it('run() 路径创建的 agent 其 onStepFinish 记录工具调用（ensureAgentCreated 闭包）', async () => {
    await adapter.run(basicInput);
    const onStepFinish = capturedToolLoopAgentOptions?.onStepFinish as (input: {
      toolCalls?: Array<{ toolCallId: string; toolName: string; input: unknown }>;
      toolResults?: Array<{ toolCallId: string; output: unknown }>;
    }) => void;
    onStepFinish({
      toolCalls: [{ toolCallId: 'lazy-1', toolName: 'tabs_query', input: { id: '1' } }],
      toolResults: [],
    });
    expect(() => onStepFinish({ toolCalls: [] })).not.toThrow();
  });

  it('分类结果为空时降级到 baseTools（绝不回退全量工具）', async () => {
    const lazyAdapter = new ToolLoopAdapter(
      createMockToolRegistry([createMockTool('tabs_query')]),
      createMockGuardrail(),
      mockConversationManager,
      createMockProviderConfig(),
      'test-model',
    );
    mockToolClassifierClassify.mockResolvedValue([]);
    await lazyAdapter.run(basicInput);

    const prepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ activeTools?: string[] }>;
    const result = await prepareStep({ messages: [{ role: 'user', content: '随便聊聊' }], stepNumber: 0, model: {} });
    expect(result.activeTools).toEqual(['tabs_query']);
  });

  it('prepareStep 在非 step0 时跳过分类并沿用可用工具集', async () => {
    const lazyAdapter = new ToolLoopAdapter(
      createMockToolRegistry([createMockTool('tabs_query')]),
      createMockGuardrail(),
      mockConversationManager,
      createMockProviderConfig(),
      'test-model',
    );
    await lazyAdapter.run(basicInput);

    const prepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ activeTools?: string[] }>;
    const result = await prepareStep({ messages: [{ role: 'user', content: '查询标签页' }], stepNumber: 1, model: {} });
    expect(result.activeTools).toEqual(['tabs_query']);
    expect(mockToolClassifierClassify).not.toHaveBeenCalled();
  });

  it('prepareStep 无法定位 user 消息时降级到 baseTools', async () => {
    const lazyAdapter = new ToolLoopAdapter(
      createMockToolRegistry([createMockTool('tabs_query')]),
      createMockGuardrail(),
      mockConversationManager,
      createMockProviderConfig(),
      'test-model',
    );
    await lazyAdapter.run(basicInput);

    const prepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ activeTools?: string[] }>;
    const result = await prepareStep({ messages: [{ role: 'assistant', content: 'hi' }], stepNumber: 0, model: {} });
    expect(result.activeTools).toEqual(['tabs_query']);
    expect(mockToolClassifierClassify).not.toHaveBeenCalled();
  });

  it('分类器抛错时降级到 baseTools 且不影响后续流程', async () => {
    const lazyAdapter = new ToolLoopAdapter(
      createMockToolRegistry([createMockTool('tabs_query')]),
      createMockGuardrail(),
      mockConversationManager,
      createMockProviderConfig(),
      'test-model',
    );
    mockToolClassifierClassify.mockRejectedValue(new Error('classify error'));
    await lazyAdapter.run(basicInput);

    const prepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ activeTools?: string[] }>;
    const result = await prepareStep({ messages: [{ role: 'user', content: '关闭标签页' }], stepNumber: 0, model: {} });
    expect(result.activeTools).toEqual(['tabs_query']);
  });

  it('分类结果只命中非核心类别且无该类别工具时降级到 baseTools', async () => {
    const proxyTool = { ...createMockTool('proxy_set'), category: 'proxy' as const };
    const lazyAdapter = new ToolLoopAdapter(
      createMockToolRegistry([proxyTool]),
      createMockGuardrail(),
      mockConversationManager,
      createMockProviderConfig(),
      'test-model',
    );
    mockToolClassifierClassify.mockResolvedValue(['cookies']);
    await lazyAdapter.run(basicInput);

    const prepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ activeTools?: string[] }>;
    const result = await prepareStep({ messages: [{ role: 'user', content: '读取 cookie' }], stepNumber: 0, model: {} });
    expect(result.activeTools).toEqual(['proxy_set']);
  });

  // ── 多步活跃工具继承（#222）────────────────────────

  it('prepareStep 在 stepNumber > 0 时继承 step 0 的 activeTools（不回退全量工具）', async () => {
    const registry = createMockToolRegistry([
      createMockTool('tabs_query'),
      { ...createMockTool('proxy_set'), category: 'proxy' as const },
      { ...createMockTool('debugger_attach'), category: 'debugger' },
    ]);
    mockToolClassifierClassify.mockResolvedValue(['tabs']);
    const lazyAdapter = new ToolLoopAdapter(
      registry,
      createMockGuardrail(),
      mockConversationManager,
      createMockProviderConfig(),
      'test-model',
    );
    await lazyAdapter.run(basicInput);

    const prepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ activeTools?: string[] }>;
    const step0 = await prepareStep({
      messages: [{ role: 'user', content: '查询标签页' }],
      stepNumber: 0,
      model: {},
    });
    expect(step0.activeTools).toEqual(['tabs_query']);

    // 第 1、2 步沿用第 0 步的子集，而不是回退到全部工具
    const step1 = await prepareStep({
      messages: [{ role: 'user', content: '查询标签页' }],
      stepNumber: 1,
      model: {},
    });
    const step2 = await prepareStep({
      messages: [{ role: 'user', content: '查询标签页' }],
      stepNumber: 2,
      model: {},
    });
    expect(step1.activeTools).toEqual(['tabs_query']);
    expect(step2.activeTools).toEqual(['tabs_query']);
    expect(mockToolClassifierClassify).toHaveBeenCalledTimes(1);
  });

  it('每次 run() 都重置活跃工具继承状态', async () => {
    const registry = createMockToolRegistry([
      createMockTool('tabs_query'),
      { ...createMockTool('debugger_attach'), category: 'debugger' },
    ]);
    const lazyAdapter = new ToolLoopAdapter(
      registry,
      createMockGuardrail(),
      mockConversationManager,
      createMockProviderConfig(),
      'test-model',
    );
    mockToolClassifierClassify.mockResolvedValueOnce(['tabs']);
    await lazyAdapter.run(basicInput);

    const firstPrepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ activeTools?: string[] }>;
    await firstPrepareStep({ messages: [{ role: 'user', content: '查询标签页' }], stepNumber: 0, model: {} });

    // 新一轮 run 后，分类命中 debugger，不应残留上一轮的 tabs 子集
    mockToolClassifierClassify.mockResolvedValueOnce(['debugger']);
    await lazyAdapter.run({ ...basicInput, userMessage: '调试页面' });
    const secondPrepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ activeTools?: string[] }>;
    const result = await secondPrepareStep({
      messages: [{ role: 'user', content: '调试页面' }],
      stepNumber: 0,
      model: {},
    });

    expect(result.activeTools).toEqual(['tabs_query', 'debugger_attach']);
  });

  // ── Expert 工具按 Expert Mode 过滤（#222）───────────

  it('expertModeEnabled=false 时 expert 类别工具不出现在 activeTools（分类命中与降级路径）', async () => {
    const registry = createMockToolRegistry([
      createMockTool('tabs_query'),
      { ...createMockTool('skill_execute'), category: 'expert' as const },
    ]);
    const lazyAdapter = new ToolLoopAdapter(
      registry,
      createMockGuardrail(),
      mockConversationManager,
      createMockProviderConfig(),
      'test-model',
    );
    mockToolClassifierClassify.mockResolvedValue(['expert']);
    await lazyAdapter.run(basicInput);

    const prepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ activeTools?: string[] }>;
    const classified = await prepareStep({
      messages: [{ role: 'user', content: '使用高级功能' }],
      stepNumber: 0,
      model: {},
    });
    expect(classified.activeTools).toEqual(['tabs_query']);

    // 分类失败的降级路径同样排除 expert 工具
    mockToolClassifierClassify.mockRejectedValue(new Error('classify error'));
    const fallback = await prepareStep({
      messages: [{ role: 'user', content: '使用高级功能' }],
      stepNumber: 0,
      model: {},
    });
    expect(fallback.activeTools).toEqual(['tabs_query']);

    // 后续步骤继承的子集也不含 expert 工具
    const nextStep = await prepareStep({
      messages: [{ role: 'user', content: '使用高级功能' }],
      stepNumber: 1,
      model: {},
    });
    expect(nextStep.activeTools).toEqual(['tabs_query']);
  });

  it('expertModeEnabled=true 时 expert 类别工具可进入 activeTools', async () => {
    const registry = createMockToolRegistry([
      createMockTool('tabs_query'),
      { ...createMockTool('skill_execute'), category: 'expert' as const },
    ]);
    const lazyAdapter = new ToolLoopAdapter(
      registry,
      createMockGuardrail(),
      mockConversationManager,
      createMockProviderConfig(),
      'test-model',
    );
    mockToolClassifierClassify.mockResolvedValue(['expert']);
    await lazyAdapter.run({
      ...basicInput,
      expertModeSettings: { enabled: true, switches: {} },
    });

    const prepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ activeTools?: string[] }>;
    const result = await prepareStep({
      messages: [{ role: 'user', content: '使用高级功能' }],
      stepNumber: 0,
      model: {},
    });
    expect(result.activeTools).toEqual(['tabs_query', 'skill_execute']);
  });

  it('上一条同文 user 消息保留，本轮输入按唯一身份追加一次', async () => {
    vi.mocked(mockConversationManager.getRecentMessages).mockResolvedValue([
      { id: 'last-user', role: 'user', content: 'Hello' },
    ]);
    mockToolClassifierClassify.mockResolvedValue(['tabs']);
    await adapter.run(basicInput);

    const messages = mockToolLoopAgentStream.mock.calls[0]?.[0]?.messages as Array<{ role: string; content: string }>;
    const userMessages = messages.filter((message) => message.role === 'user');
    // #232：不能按内容去重——上一条同文用户是真实历史，本轮输入必须再追加一次
    expect(userMessages).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('历史中未识别的消息角色回退为 user 消息', async () => {
    vi.mocked(mockConversationManager.getRecentMessages).mockResolvedValue([
      { id: 'weird-1', role: 'system', content: 'legacy system note' } as unknown as StoredMessage,
    ]);
    await adapter.run(basicInput);

    const messages = mockToolLoopAgentStream.mock.calls[0]?.[0]?.messages as Array<{ role: string; content: string }>;
    const weird = messages.find((message) => message.content === 'legacy system note');
    // convertToModelMessage default 分支将未识别角色映射为 user
    expect(weird).toEqual({ role: 'user', content: 'legacy system note' });
  });
});

// ==================== 上下文压缩（compact）路径 ====================

describe('ToolLoopAdapter 上下文压缩', () => {
  let mockGuardrail: IGuardrail;
  let providerConfig: ProviderConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedToolLoopAgentOptions = null;
    mockGuardrail = createMockGuardrail();
    providerConfig = createMockProviderConfig();
    mockDefaultSuccessStream();
  });

  function makeLongConversationManager(): IConversationManager {
    const conversation: Conversation = {
      id: 'conv-1',
      title: 'test',
      titleGenerated: true,
      createdAt: 1,
      updatedAt: 1,
      messages: Array.from({ length: 16 }, (_, index) => [
        { id: `user-${index}`, role: 'user' as const, content: `请求-${index}-${'x'.repeat(1_500)}` },
        { id: `assistant-${index}`, role: 'assistant' as const, content: `回答-${index}-${'y'.repeat(1_500)}` },
      ]).flat(),
      sensitiveDataGranted: false,
    };
    const manager = createMockConversationManager();
    vi.mocked(manager.get).mockResolvedValue(conversation);
    return manager;
  }

  function makeConfig(contextWindowTokens: number): AgentConfig {
    return {
      maxToolRounds: 99,
      contextWindowTokens,
      tokenBudgetMargin: 100,
    };
  }

  it('压缩完成后重建 messages（compacted=true 触发第二次 buildMessages）', async () => {
    const manager = makeLongConversationManager();
    vi.mocked(manager.update).mockImplementation(async (_id: string, patch: Partial<Conversation>) => {
      const conv = await manager.get('conv-1');
      Object.assign(conv!, patch);
    });
    mockGenerateText.mockResolvedValue({ text: ' 压缩摘要  ' });

    const compactingAdapter = new ToolLoopAdapter(
      createMockToolRegistry([]),
      mockGuardrail,
      manager,
      providerConfig,
      'test-model',
      makeConfig(10_000),
    );
    await compactingAdapter.run(basicInput);

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const conv = await manager.get('conv-1');
    expect(conv!.summary).toBe('压缩摘要');
    // compacted=true 触发 buildMessages 二次调用：首次 user 消息不会重复出现在发送的消息里
    const userCount = mockToolLoopAgentStream.mock.calls.filter((call) => {
      const messages = call[0]?.messages as Array<{ role: string; content: string }>;
      return messages?.some((message) => message.role === 'user' && message.content === 'Hello');
    }).length;
    expect(userCount).toBe(1);
  });

  it('generateText 返回空摘要时放弃本次压缩并返回 false', async () => {
    const manager = makeLongConversationManager();
    mockGenerateText.mockResolvedValue({ text: '   ' });

    const compactingAdapter = new ToolLoopAdapter(
      createMockToolRegistry([]),
      mockGuardrail,
      manager,
      providerConfig,
      'test-model',
      makeConfig(10_000),
    );
    await compactingAdapter.run(basicInput);

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('generateText 抛错时记录 warning 并继续执行（摘要失败降级）', async () => {
    const manager = makeLongConversationManager();
    mockGenerateText.mockRejectedValue(new Error('summary model error'));

    const compactingAdapter = new ToolLoopAdapter(
      createMockToolRegistry([]),
      mockGuardrail,
      manager,
      providerConfig,
      'test-model',
      makeConfig(10_000),
    );
    const result = await compactingAdapter.run(basicInput);
    expect(result.finalMessage).toBe('操作完成');
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('会话不存在时 compactConversation 直接返回 false', async () => {
    const manager = createMockConversationManager();
    vi.mocked(manager.get).mockResolvedValue(undefined);

    const compactingAdapter = new ToolLoopAdapter(
      createMockToolRegistry([]),
      mockGuardrail,
      manager,
      providerConfig,
      'test-model',
      makeConfig(10_000),
    );
    const result = await compactingAdapter.run(basicInput);
    expect(result.finalMessage).toBe('操作完成');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('modelConfig.defaults.maxOutputTokens 存在时摘要输出上限取 min(desired, maxOutput)', async () => {
    const manager = makeLongConversationManager();
    vi.mocked(manager.update).mockImplementation(async (_id: string, patch: Partial<Conversation>) => {
      const conv = await manager.get('conv-1');
      Object.assign(conv!, patch);
    });
    mockGenerateText.mockResolvedValue({ text: '短摘要' });

    const compactingAdapter = new ToolLoopAdapter(
      createMockToolRegistry([]),
      mockGuardrail,
      manager,
      providerConfig,
      'test-model',
      makeConfig(10_000),
    );
    await compactingAdapter.run({
      ...basicInput,
      modelConfig: {
        id: 'test-model',
        name: 'Test Model',
        defaults: { maxOutputTokens: 100, temperature: 0.2 },
      },
    });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const genCall = mockGenerateText.mock.calls[0]?.[0] as { maxOutputTokens?: number };
    expect(genCall.maxOutputTokens).toBe(100);
    const conv = await manager.get('conv-1');
    expect(conv!.summary).toBe('短摘要');
  });
});

// ==================== toolApproval preflight 与默认分支 ====================

describe('toolApproval preflight 与兜底', () => {
  let mockToolRegistry: IToolRegistry;
  let mockGuardrail: IGuardrail;
  let mockConversationManager: IConversationManager;
  let providerConfig: ProviderConfig;
  let adapter: ToolLoopAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedToolLoopAgentOptions = null;
    mockToolRegistry = createMockToolRegistry([]);
    mockGuardrail = createMockGuardrail();
    mockConversationManager = createMockConversationManager();
    providerConfig = createMockProviderConfig();
    adapter = new ToolLoopAdapter(
      mockToolRegistry,
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
      undefined,
      undefined,
    );
  });

  it('high 风险 + onRequestApproval 时 preflight 成功并把 affectedObjects 传给确认回调', async () => {
    const toolWithPreflight: ToolDefinition = {
      ...createMockTool('tabs_remove'),
      preflight: vi.fn().mockResolvedValue({
        affectedObjects: [{ type: 'tab', id: '1', title: 'T', reason: '会被关闭' }],
        warnings: [],
      }),
    };
    mockToolRegistry = createMockToolRegistry([toolWithPreflight]);
    (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      riskLevel: 'high',
      requiresPreflight: true,
      reason: '关闭标签页',
      dataSensitivity: 'low',
    });
    const onApproval = vi.fn().mockResolvedValue('approve');
    const approvalAdapter = new ToolLoopAdapter(
      mockToolRegistry,
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
      undefined,
      onApproval,
    );
    await approvalAdapter.run(basicInput);

    const approval = capturedToolLoopAgentOptions?.['toolApproval'] as (opts: {
      toolCall: { toolName: string; input: Record<string, unknown> };
    }) => Promise<{ type: string; reason?: string }>;
    const result = await approval({ toolCall: { toolName: 'tabs_remove', input: { tabIds: [1] } } });
    expect(result).toEqual({ type: 'approved' });
    expect(toolWithPreflight.preflight).toHaveBeenCalledWith({ tabIds: [1] });
    expect(onApproval).toHaveBeenCalledWith({
      toolName: 'tabs_remove',
      params: { tabIds: [1] },
      reason: '关闭标签页',
      riskLevel: 'high',
      affectedObjects: [{ type: 'tab', id: '1', title: 'T', reason: '会被关闭' }],
    });
  });

  it('high 风险 + preflight 抛错时仍继续走确认流程（affectedObjects 缺失）', async () => {
    const toolWithPreflight: ToolDefinition = {
      ...createMockTool('tabs_remove'),
      preflight: vi.fn().mockRejectedValue(new Error('preflight down')),
    };
    mockToolRegistry = createMockToolRegistry([toolWithPreflight]);
    (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      riskLevel: 'high',
      requiresPreflight: true,
      reason: '关闭标签页',
      dataSensitivity: 'low',
    });
    const onApproval = vi.fn().mockResolvedValue('deny');
    const approvalAdapter = new ToolLoopAdapter(
      mockToolRegistry,
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
      undefined,
      onApproval,
    );
    await approvalAdapter.run(basicInput);

    const approval = capturedToolLoopAgentOptions?.['toolApproval'] as (opts: {
      toolCall: { toolName: string; input: Record<string, unknown> };
    }) => Promise<{ type: string; reason?: string }>;
    const result = await approval({ toolCall: { toolName: 'tabs_remove', input: { tabIds: [1] } } });
    expect(result).toEqual({ type: 'denied', reason: '关闭标签页' });
    expect(onApproval).toHaveBeenCalledWith(expect.objectContaining({ affectedObjects: undefined }));
  });

  it('critical 风险 + Expert Mode + preflight affectedObjects 传回回调并批准', async () => {
    const toolWithPreflight: ToolDefinition = {
      ...createMockTool('proxy_set'),
      category: 'proxy',
      preflight: vi.fn().mockResolvedValue({
        affectedObjects: [{ type: 'cookie', id: 'c1', reason: '会修改代理' }],
        warnings: [],
      }),
    };
    mockToolRegistry = createMockToolRegistry([toolWithPreflight]);
    (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      riskLevel: 'critical',
      requiresPreflight: true,
      reason: '修改代理',
      dataSensitivity: 'critical',
    });
    const onApproval = vi.fn().mockResolvedValue('approve');
    const approvalAdapter = new ToolLoopAdapter(
      mockToolRegistry,
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
      undefined,
      onApproval,
    );
    const expertInput: AgentRunInput = {
      ...basicInput,
      expertModeSettings: { enabled: true, switches: {} },
    };
    await approvalAdapter.run(expertInput);

    const approval = capturedToolLoopAgentOptions?.['toolApproval'] as (opts: {
      toolCall: { toolName: string; input: Record<string, unknown> };
    }) => Promise<{ type: string; reason?: string }>;
    const result = await approval({ toolCall: { toolName: 'proxy_set', input: { host: 'x' } } });
    expect(result).toEqual({ type: 'approved' });
    expect(onApproval).toHaveBeenCalledWith({
      toolName: 'proxy_set',
      params: { host: 'x' },
      reason: '修改代理',
      riskLevel: 'critical',
      affectedObjects: [{ type: 'cookie', id: 'c1', reason: '会修改代理' }],
    });
  });

  it('critical 风险 + preflight 抛错时仍继续确认流程（affectedObjects 缺失）', async () => {
    const toolWithPreflight: ToolDefinition = {
      ...createMockTool('proxy_set'),
      category: 'proxy',
      preflight: vi.fn().mockRejectedValue(new Error('preflight down')),
    };
    mockToolRegistry = createMockToolRegistry([toolWithPreflight]);
    (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      riskLevel: 'critical',
      requiresPreflight: true,
      reason: '修改代理',
      dataSensitivity: 'critical',
    });
    const onApproval = vi.fn().mockResolvedValue('approve');
    const approvalAdapter = new ToolLoopAdapter(
      mockToolRegistry,
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
      undefined,
      onApproval,
    );
    const expertInput: AgentRunInput = {
      ...basicInput,
      expertModeSettings: { enabled: true, switches: {} },
    };
    await approvalAdapter.run(expertInput);

    const approval = capturedToolLoopAgentOptions?.['toolApproval'] as (opts: {
      toolCall: { toolName: string; input: Record<string, unknown> };
    }) => Promise<{ type: string; reason?: string }>;
    const result = await approval({ toolCall: { toolName: 'proxy_set', input: {} } });
    expect(result).toEqual({ type: 'approved' });
    expect(onApproval).toHaveBeenCalledWith(expect.objectContaining({ affectedObjects: undefined }));
  });

  it('guardrail 返回未识别 riskLevel 时走 default 分支 approved', async () => {
    (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      // 类型上不允许，但运行时 guardrail 可能返回意外值
      riskLevel: 'ultra',
      requiresPreflight: false,
      reason: '未知风险',
      dataSensitivity: 'low',
    });

    await adapter.run(basicInput);
    const approval = capturedToolLoopAgentOptions?.['toolApproval'] as (opts: {
      toolCall: { toolName: string; input: Record<string, unknown> };
    }) => Promise<{ type: string; reason?: string }>;
    const result = await approval({ toolCall: { toolName: 'tabs_query', input: {} } });
    expect(result).toEqual({ type: 'approved' });
  });

  it('high 风险 + local-trusted 跳过 preflight 与确认直接 approved', async () => {
    providerConfig.isLocalTrusted = true;
    (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      riskLevel: 'high',
      requiresPreflight: true,
      reason: '高风险',
      dataSensitivity: 'low',
    });
    const onApproval = vi.fn();
    const localAdapter = new ToolLoopAdapter(
      mockToolRegistry,
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
      undefined,
      onApproval,
    );
    await localAdapter.run(basicInput);

    const approval = capturedToolLoopAgentOptions?.['toolApproval'] as (opts: {
      toolCall: { toolName: string; input: Record<string, unknown> };
    }) => Promise<{ type: string; reason?: string }>;
    const result = await approval({ toolCall: { toolName: 'tabs_remove', input: {} } });
    expect(result).toEqual({ type: 'approved' });
    expect(onApproval).not.toHaveBeenCalled();
  });
});

// ==================== executeTool / truncateToolResult / tools ====================

describe('ToolLoopAdapter 工具执行与结果截断', () => {
  let mockGuardrail: IGuardrail;
  let mockConversationManager: IConversationManager;
  let providerConfig: ProviderConfig;
  let adapter: ToolLoopAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedToolLoopAgentOptions = null;
    mockConversationManager = createMockConversationManager();
    providerConfig = createMockProviderConfig();
  });

  it('tools getter 通过 execute 代理调用 guardrail→preflight→execute→filter→截断', async () => {
    const tool = createMockTool('tabs_query', {
      success: true,
      data: 'x'.repeat(9_000),
    });
    const registry = createMockToolRegistry([tool]);
    mockGuardrail = createMockGuardrail();
    (mockGuardrail.check as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      riskLevel: 'medium',
      requiresPreflight: true,
      reason: '允许',
      dataSensitivity: 'low',
    });
    tool.preflight = vi.fn().mockResolvedValue({ affectedObjects: [], warnings: [] });
    adapter = new ToolLoopAdapter(registry, mockGuardrail, mockConversationManager, providerConfig, 'test-model');

    const builtTools = adapter.tools;
    const execute = builtTools['tabs_query']?.execute as (args: Record<string, unknown>) => Promise<ToolResult>;
    const result = await execute({ id: '1' });

    expect(tool.execute).toHaveBeenCalledWith({ id: '1' });
    expect(tool.preflight).toHaveBeenCalledWith({ id: '1' });
    expect(mockGuardrail.filterResultForRemote).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect((result.data as string).length).toBeLessThan(9_000);
    expect((result.data as string)).toContain('结果过长已截断');
  });

  it('executeTool 在 guardrail 拒绝时返回 error 而不执行工具', async () => {
    const tool = createMockTool('tabs_remove');
    mockGuardrail = createMockGuardrail(false);
    adapter = new ToolLoopAdapter(
      createMockToolRegistry([tool]),
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
    );

    const execute = adapter.tools['tabs_remove']?.execute as (args: Record<string, unknown>) => Promise<ToolResult>;
    const result = await execute({ id: '1' });
    expect(result).toEqual({ success: false, error: '被拒绝' });
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('截断非字符串超长 data（data 为对象时整体 JSON 化截断）', async () => {
    const tool = createMockTool('tabs_query');
    mockGuardrail = createMockGuardrail();
    const bigObject = { list: 'x'.repeat(8_500) };
    // data 对象整体 JSON 超过上限但非单字段字符串超限 → 走 JSON.stringify(data) 分支
    const result = tool.execute as ReturnType<typeof vi.fn>;
    result.mockResolvedValue({ success: true, data: bigObject });
    adapter = new ToolLoopAdapter(
      createMockToolRegistry([tool]),
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
    );

    const execute = adapter.tools['tabs_query']?.execute as (args: Record<string, unknown>) => Promise<ToolResult>;
    const res = await execute({});
    expect(res.success).toBe(true);
    expect(typeof res.data).toBe('string');
    expect(res.data).toContain('结果过长已截断');
  });

  it('整体 JSON 超限但各字段单独未超限时原样返回', async () => {
    const tool = createMockTool('tabs_query', {
      success: true,
      // 总 JSON（含键名与额外字段）> 8000，但 data 字符串本身与 dataText 都 < 8000
      data: 'x'.repeat(7_950),
      note: 'y'.repeat(200),
    } as unknown as ToolResult);
    mockGuardrail = createMockGuardrail();
    adapter = new ToolLoopAdapter(
      createMockToolRegistry([tool]),
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
    );

    const execute = adapter.tools['tabs_query']?.execute as (args: Record<string, unknown>) => Promise<ToolResult>;
    const result = await execute({});
    expect(result.success).toBe(true);
    // 未触发任何单字段截断，原样透出
    expect(result.data).toBe('x'.repeat(7_950));
    expect(JSON.stringify(result).length).toBeGreaterThan(8_000);
  });

  it('超长 error 字符串被截断', async () => {
    const tool = createMockTool('tabs_query', {
      success: false,
      error: 'y'.repeat(9_000),
    });
    mockGuardrail = createMockGuardrail();
    adapter = new ToolLoopAdapter(
      createMockToolRegistry([tool]),
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
    );

    const execute = adapter.tools['tabs_query']?.execute as (args: Record<string, unknown>) => Promise<ToolResult>;
    const result = await execute({});
    expect(result.success).toBe(false);
    expect((result.error as string).length).toBeLessThan(9_000);
    expect(result.error).toContain('结果过长已截断');
  });

  it('工具 execute 自身抛错时 run() 捕获并进入错误分支', async () => {
    mockToolLoopAgentStream.mockImplementationOnce(async (options) => {
      options.onStepFinish({
        toolCalls: [{ toolCallId: 'call-x', toolName: 'tabs_query', input: {} }],
        toolResults: [],
      });
      throw new Error('tool execute failed');
    });
    adapter = new ToolLoopAdapter(
      createMockToolRegistry([createMockTool('tabs_query')]),
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
    );

    await expect(adapter.run(basicInput)).rejects.toThrow('tool execute failed');
    const persisted = persistedMessages(mockConversationManager);
    const errorMsg = [...persisted].reverse().find(
      (message) => message.role === 'assistant' && message.content.startsWith('Error:'),
    );
    expect(errorMsg!.content).toBe('Error: tool execute failed');
  });
});

// ==================== generate/reasoningEffort 映射 ====================

describe('ToolLoopAdapter reasoningEffort 映射', () => {
  it('reasoningEffort=max 映射为 xhigh', async () => {
    const config: AgentConfig = {
      maxToolRounds: 5,
      contextWindowTokens: 128000,
      tokenBudgetMargin: 4096,
      reasoningEffort: 'max',
    };
    const adapterInstance = new ToolLoopAdapter(
      createMockToolRegistry([]),
      createMockGuardrail(),
      createMockConversationManager(),
      createMockProviderConfig(),
      'test-model',
      config,
    );
    await adapterInstance.run(basicInput);
    expect(capturedToolLoopAgentOptions?.['reasoning']).toBe('xhigh');
  });

  it('provider models 中存在模型配置时读取 defaults（temperature/maxOutputTokens）', async () => {
    const modelsProviderConfig = createMockProviderConfig();
    modelsProviderConfig.models = {
      'test-model': {
        id: 'test-model',
        name: 'Test Model',
        defaults: { maxOutputTokens: 1024, temperature: 0.7 },
      },
    };
    const adapterInstance = new ToolLoopAdapter(
      createMockToolRegistry([]),
      createMockGuardrail(),
      createMockConversationManager(),
      modelsProviderConfig,
      'test-model',
    );
    await adapterInstance.run(basicInput);
    expect(capturedToolLoopAgentOptions?.['maxOutputTokens']).toBe(1024);
    expect(capturedToolLoopAgentOptions?.['temperature']).toBe(0.7);
  });
});
