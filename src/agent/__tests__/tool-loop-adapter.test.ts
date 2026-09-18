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
        generate: mockToolLoopAgentStream,
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
    toOpenAISchema: vi.fn().mockReturnValue([]),
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
    getRecentMessages: vi.fn().mockImplementation(() => {
      return Promise.resolve([...storedMessages]);
    }),
    generateTitle: vi.fn(),
  };
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

  it('使用配置的单次任务最大执行步数', async () => {
    const config: AgentConfig = {
      maxToolRounds: 7,
      systemPrompt: 'test',
      contextWindowTokens: 128000,
      tokenBudgetMargin: 4096,
      microcompactKeepRecent: 10,
      microcompactMinChars: 500,
      microcompactExcludeTools: [],
      summaryThreshold: { messageCount: 30, estimatedTokens: 12000 },
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

    expect(mockIsStepCount).toHaveBeenCalledWith(7);
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
        systemPrompt: 'browser assistant',
        contextWindowTokens: 1_000,
        tokenBudgetMargin: 100,
        microcompactKeepRecent: 10,
        microcompactMinChars: 500,
        microcompactExcludeTools: [],
        summaryThreshold: { messageCount: 30, estimatedTokens: 12_000 },
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
        systemPrompt: 'browser assistant',
        contextWindowTokens: 10_000,
        tokenBudgetMargin: 100,
        microcompactKeepRecent: 10,
        microcompactMinChars: 500,
        microcompactExcludeTools: [],
        summaryThreshold: { messageCount: 30, estimatedTokens: 12_000 },
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
        systemPrompt: 'browser assistant',
        contextWindowTokens: 10_000,
        tokenBudgetMargin: 100,
        microcompactKeepRecent: 10,
        microcompactMinChars: 500,
        microcompactExcludeTools: [],
        summaryThreshold: { messageCount: 30, estimatedTokens: 12_000 },
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
    const persistedMessages = vi.mocked(mockConversationManager.addMessage).mock.calls.map(([, message]) => message);
    expect(persistedMessages).toEqual(expect.arrayContaining([
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

// ==================== Agent 接口（懒加载路径） ====================

describe('ToolLoopAdapter Agent 接口', () => {
  let adapter: ToolLoopAdapter;
  let mockToolRegistry: IToolRegistry;
  let mockGuardrail: IGuardrail;
  let mockConversationManager: IConversationManager;
  let providerConfig: ProviderConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedToolLoopAgentOptions = null;
    mockToolRegistry = createMockToolRegistry([createMockTool('tabs_query')]);
    mockGuardrail = createMockGuardrail();
    mockConversationManager = createMockConversationManager();
    providerConfig = createMockProviderConfig();
    adapter = new ToolLoopAdapter(
      mockToolRegistry,
      mockGuardrail,
      mockConversationManager,
      providerConfig,
      'test-model',
    );
  });

  it('version 返回 agent-v1，id 为 undefined', () => {
    expect(adapter.version).toBe('agent-v1');
    expect(adapter.id).toBeUndefined();
  });

  it('tools getter 懒加载 buildTools 并缓存', () => {
    const tools = adapter.tools;
    expect(Object.keys(tools)).toEqual(['tabs_query']);
    expect(adapter.tools).toBe(tools);
  });

  it('generate 通过懒加载 agent 转发', async () => {
    mockToolLoopAgentStream.mockResolvedValue('gen-result');
    const result = await adapter.generate({ prompt: 'x' });
    expect(result).toBe('gen-result');
    expect(mockToolLoopAgentStream).toHaveBeenCalledWith({ prompt: 'x' });
  });

  it('stream 通过懒加载 agent 转发', async () => {
    mockToolLoopAgentStream.mockResolvedValue('stream-result');
    const result = await adapter.stream({ prompt: 'x' });
    expect(result).toBe('stream-result');
    expect(mockToolLoopAgentStream).toHaveBeenCalledWith({ prompt: 'x' });
  });

  it('lazy 路径（generate）完整执行 prepareStep 与 onStepFinish', async () => {
    mockToolClassifierClassify.mockResolvedValue(['tabs']);
    const modelsProviderConfig = createMockProviderConfig();
    modelsProviderConfig.models = {
      'test-model': {
        id: 'test-model',
        name: 'Test Model',
        defaults: { maxOutputTokens: 512, temperature: 0.2 },
      },
    };
    const lazy = new ToolLoopAdapter(
      createMockToolRegistry([createMockTool('tabs_query')]),
      mockGuardrail,
      mockConversationManager,
      modelsProviderConfig,
      'test-model',
    );
    mockToolLoopAgentStream.mockResolvedValue('ok');
    await lazy.generate({ messages: [] });

    expect(capturedToolLoopAgentOptions?.['maxOutputTokens']).toBe(512);
    expect(capturedToolLoopAgentOptions?.['temperature']).toBe(0.2);

    const prepareStep = capturedToolLoopAgentOptions?.prepareStep as (input: {
      messages: Array<{ role: string; content: string }>;
      stepNumber: number;
      model: unknown;
    }) => Promise<{ activeTools?: string[]; messages?: unknown[] }>;
    const result = await prepareStep({
      messages: [{ role: 'user', content: '查询标签页' }],
      stepNumber: 0,
      model: {},
    });
    expect(result).toBeDefined();

    const onStepFinish = capturedToolLoopAgentOptions?.onStepFinish as (input: unknown) => void;
    expect(() => onStepFinish({ toolCalls: [] })).not.toThrow();
  });

  it('abort 中断后懒加载 agent 重建', async () => {
    mockToolLoopAgentStream.mockResolvedValue('x');
    await adapter.generate({ prompt: 'a' });
    await adapter.generate({ prompt: 'b' });
    expect(vi.mocked((await import('ai')).ToolLoopAgent)).toHaveBeenCalledTimes(1);

    adapter.abort();
    await adapter.generate({ prompt: 'c' });
    expect(vi.mocked((await import('ai')).ToolLoopAgent)).toHaveBeenCalledTimes(2);
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
    const persisted = vi.mocked(mockConversationManager.addMessage).mock.calls.map(([, message]) => message);
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

    const persisted = vi.mocked(mockConversationManager.addMessage).mock.calls.map(([, message]) => message);
    const assistantErr = persisted.find((message) => message.role === 'assistant');
    expect(assistantErr).toBeDefined();
    expect(assistantErr!.content).toBe('Error: boom');
  });

  it('run() 中 agent.stream 抛错时记录 Error: 前缀并重抛', async () => {
    mockToolLoopAgentStream.mockRejectedValue(new Error('stream failure'));

    await expect(adapter.run(basicInput)).rejects.toThrow('stream failure');

    const persisted = vi.mocked(mockConversationManager.addMessage).mock.calls.map(([, message]) => message);
    const assistantErr = persisted.find((message) => message.role === 'assistant');
    expect(assistantErr!.content).toBe('Error: stream failure');
  });

  it('错误消息本身带 Error: 前缀时不再重复拼接', async () => {
    mockToolLoopAgentStream.mockRejectedValue(new Error('Error: already prefixed'));

    await expect(adapter.run(basicInput)).rejects.toThrow('already prefixed');

    const persisted = vi.mocked(mockConversationManager.addMessage).mock.calls.map(([, message]) => message);
    const assistantErr = persisted.find((message) => message.role === 'assistant');
    expect(assistantErr!.content).toBe('Error: already prefixed');
  });

  it('非 Error 类型抛出内容转为 String 记录', async () => {
    mockToolLoopAgentStream.mockRejectedValue('plain string rejection');

    await expect(adapter.run(basicInput)).rejects.toBe('plain string rejection');

    const persisted = vi.mocked(mockConversationManager.addMessage).mock.calls.map(([, message]) => message);
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
    // 带 toolResult 的工具记录输出
    expect(result.toolCalls[0]!.result).toEqual({ success: true, data: { success: true, tabs: 1 } });
    // 缺失 toolResult 的工具回退 success:true
    expect(result.toolCalls[1]!.result).toEqual({ success: true });

    const persisted = vi.mocked(mockConversationManager.addMessage).mock.calls.map(([, message]) => message);
    expect(persisted.filter((message) => message.role === 'tool')).toHaveLength(2);

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
    // 每个 tool-result 独立成一条消息，且缺失输出的 call-2 回退 { success: true }
    expect(toolMsgs).toHaveLength(2);
    expect(toolMsgs[0]!.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool-result', toolCallId: 'call-1', toolName: 'tabs_query' }),
    ]));
    expect(toolMsgs[1]!.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool-result', toolCallId: 'call-2', toolName: 'tabs_remove' }),
    ]));
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

  it('无工具可用时 stream 参数不包含 activeTools（全量工具路径）', async () => {
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
    expect(result.activeTools).toBeUndefined();
  });

  it('prepareStep 在非 step0 时跳过分类直接全量工具', async () => {
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
    expect(result.activeTools).toBeUndefined();
    expect(mockToolClassifierClassify).not.toHaveBeenCalled();
  });

  it('prepareStep 无法定位 user 消息时跳过分类', async () => {
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
    expect(result.activeTools).toBeUndefined();
    expect(mockToolClassifierClassify).not.toHaveBeenCalled();
  });

  it('分类器抛错时降级到全量工具且不影响后续流程', async () => {
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
    expect(result.activeTools).toBeUndefined();
  });

  it('分类结果只命中非核心类别且无该类别工具时返回空 activeTools', async () => {
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
    expect(result.activeTools).toBeUndefined();
  });

  it('buildMessages 末尾已是同内容 user 消息时不重复追加', async () => {
    vi.mocked(mockConversationManager.getRecentMessages).mockResolvedValue([
      { id: 'last-user', role: 'user', content: 'Hello' },
    ]);
    mockToolClassifierClassify.mockResolvedValue(['tabs']);
    await adapter.run(basicInput);

    const messages = mockToolLoopAgentStream.mock.calls[0]?.[0]?.messages as Array<{ role: string; content: string }>;
    const userMessages = messages.filter((message) => message.role === 'user');
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]!.content).toBe('Hello');
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
      systemPrompt: 'browser assistant',
      contextWindowTokens,
      tokenBudgetMargin: 100,
      microcompactKeepRecent: 10,
      microcompactMinChars: 500,
      microcompactExcludeTools: [],
      summaryThreshold: { messageCount: 30, estimatedTokens: 12_000 },
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
    const persisted = vi.mocked(mockConversationManager.addMessage).mock.calls.map(([, message]) => message);
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
      systemPrompt: 'test',
      contextWindowTokens: 128000,
      tokenBudgetMargin: 4096,
      microcompactKeepRecent: 10,
      microcompactMinChars: 500,
      microcompactExcludeTools: [],
      reasoningEffort: 'max',
      summaryThreshold: { messageCount: 30, estimatedTokens: 12_000 },
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
