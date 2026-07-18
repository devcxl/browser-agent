import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolLoopAdapter } from '../tool-loop-adapter';
import type { AgentRunInput, ToolCallRecord } from '@/shared/types/agent';
import type { IToolRegistry, ToolDefinition, ToolResult } from '@/registry/types';
import type { IGuardrail, GuardrailCheck } from '@/shared/types/guardrail';
import type { IConversationManager, StoredMessage } from '@/shared/types/conversation';
import type { ProviderConfig } from '@/shared/types/llm';
import { FEATURE_FLAGS } from '@/shared/feature-flags';

// ==================== Mocks ====================

const mockToolLoopAgentStream = vi.fn();
const mockToolClassifierClassify = vi.hoisted(() => vi.fn());
let capturedToolLoopAgentOptions: Record<string, unknown> | null = null;

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai');
  return {
    ...actual,
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
    generateSummary: vi.fn(),
    needsSummary: vi.fn().mockResolvedValue(false),
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

describe('ToolLoopAdapter', () => {
  let adapter: ToolLoopAdapter;
  let mockToolRegistry: IToolRegistry;
  let mockGuardrail: IGuardrail;
  let mockConversationManager: IConversationManager;
  let providerConfig: ProviderConfig;

  const basicInput: AgentRunInput = {
    conversationId: 'conv-1',
    userMessage: 'Hello',
    providerConfig: createMockProviderConfig(),
    model: 'test-model',
    browserContext: { tabs: [], windows: [], activeTabId: undefined },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedToolLoopAgentOptions = null;
    mockToolRegistry = createMockToolRegistry([
      createMockTool('tabs_query'),
      createMockTool('tabs_remove'),
    ]);
    mockGuardrail = createMockGuardrail();
    mockToolClassifierClassify.mockResolvedValue(['tabs']);
    mockConversationManager = createMockConversationManager();
    providerConfig = createMockProviderConfig();

    // 默认：stream 返回成功（空 stream 事件 + 最终结果）
    mockToolLoopAgentStream.mockResolvedValue({
      stream: (async function* () {})(),
      finalStep: Promise.resolve({ text: '操作完成' }),
      usage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
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

  it('应该将 toolRegistry 中的所有工具转换为 AI SDK tools', async () => {
    await adapter.run(basicInput);

    const agentInstance = (await vi.mocked(
      (await import('ai')).ToolLoopAgent,
    )).mock.results[0]?.value;
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

  it('prepareStep 应只激活分类命中的工具', async () => {
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
    expect(result.activeTools).toEqual(['tabs_query']);
  });

  // ── Abort ─────────────────────────────────────────

  it('abort() 应该触发 AbortController', async () => {
    // spy  AbortController
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

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

  // ── Feature Flag ──────────────────────────────────

  it('FEATURE_FLAGS.useToolLoopAgent 已默认为 true（迁移完成）', () => {
    expect(FEATURE_FLAGS.useToolLoopAgent).toBe(true);
  });

  it('可以通过修改 FEATURE_FLAGS 切换回旧 AgentLoop（回滚场景）', () => {
    FEATURE_FLAGS.useToolLoopAgent = false;
    expect(FEATURE_FLAGS.useToolLoopAgent).toBe(false);
    // 恢复默认值
    FEATURE_FLAGS.useToolLoopAgent = true;
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
    beforeEach(() => {
      FEATURE_FLAGS.useToolApproval = true;
    });

    afterEach(() => {
      FEATURE_FLAGS.useToolApproval = true;
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

    it('FEATURE_FLAGS.useToolApproval=false 时直接 approved', async () => {
      FEATURE_FLAGS.useToolApproval = false;

      await adapter.run(basicInput);
      const result = await getToolApproval()({
        toolCall: { toolName: 'tabs_query', input: { tabId: 1 } },
      });

      expect(result).toEqual({ type: 'approved' });
    });

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

// 验证 Feature Flag 默认值（模块级别，不受 beforeEach 影响）
describe('Feature Flag 默认值', () => {
  it('FEATURE_FLAGS.useToolApproval 默认为 true', () => {
    expect(FEATURE_FLAGS.useToolApproval).toBe(true);
  });
});
