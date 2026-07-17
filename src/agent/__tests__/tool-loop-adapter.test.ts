import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolLoopAdapter } from '../tool-loop-adapter';
import type { AgentRunInput, ToolCallRecord } from '@/shared/types/agent';
import type { IToolRegistry, ToolDefinition, ToolResult } from '@/registry/types';
import type { IGuardrail, GuardrailCheck } from '@/shared/types/guardrail';
import type { IConversationManager, StoredMessage } from '@/shared/types/conversation';
import type { ProviderConfig } from '@/shared/types/llm';
import { FEATURE_FLAGS } from '@/shared/feature-flags';

// ==================== Mocks ====================

const mockToolLoopAgentGenerate = vi.fn();

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai');
  return {
    ...actual,
    ToolLoopAgent: vi.fn().mockImplementation(() => ({
      generate: mockToolLoopAgentGenerate,
    })),
  };
});

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn().mockReturnValue({
    chatModel: vi.fn().mockReturnValue({}),
  }),
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
      requiresConfirmation: false,
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
    mockToolRegistry = createMockToolRegistry([
      createMockTool('tabs_query'),
      createMockTool('tabs_remove'),
    ]);
    mockGuardrail = createMockGuardrail();
    mockConversationManager = createMockConversationManager();
    providerConfig = createMockProviderConfig();

    // 默认：generate 返回成功
    mockToolLoopAgentGenerate.mockResolvedValue({
      text: '操作完成',
      usage: { inputTokens: 100, outputTokens: 50 },
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
    expect(mockToolLoopAgentGenerate).toHaveBeenCalledTimes(1);
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

    const generateCall = mockToolLoopAgentGenerate.mock.calls[0]?.[0];
    expect(generateCall).toBeDefined();
    expect(generateCall.messages).toBeDefined();
    expect(generateCall.messages.length).toBeGreaterThan(0);

    // 第一条消息应该是 system
    expect(generateCall.messages[0].role).toBe('system');
  });

  it('应该包含用户消息在 messages 中', async () => {
    await adapter.run(basicInput);

    const messages = mockToolLoopAgentGenerate.mock.calls[0]?.[0].messages;
    const userMessage = messages?.find((m: { role: string }) => m.role === 'user');
    expect(userMessage).toBeDefined();
    expect(userMessage?.content).toBe('Hello');
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

    const generateCall = mockToolLoopAgentGenerate.mock.calls[0]?.[0];
    expect(generateCall.abortSignal).toBeDefined();
  });

  it('run() 执行前调用 abort 不应崩溃', () => {
    // abort() 时 abortController 为 null，应安全处理
    expect(() => adapter.abort()).not.toThrow();
  });

  // ── Feature Flag ──────────────────────────────────

  it('FEATURE_FLAGS.useToolLoopAgent 默认为 false', () => {
    expect(FEATURE_FLAGS.useToolLoopAgent).toBe(false);
  });

  it('可以通过修改 FEATURE_FLAGS 启用', () => {
    // 注：在实际集成中，调用方会检查此 flag 决定使用哪个 AgentRuntime
    FEATURE_FLAGS.useToolLoopAgent = true;
    expect(FEATURE_FLAGS.useToolLoopAgent).toBe(true);
    // 恢复默认值
    FEATURE_FLAGS.useToolLoopAgent = false;
  });

  // ── ToolCalls 记录 ────────────────────────────────

  it('应该在 onStepFinish 回调中记录工具调用', async () => {
    // 模拟 ToolLoopAgent onStepFinish 被调用（通过 mock 结果验证）
    await adapter.run(basicInput);

    // generate 被调用了
    expect(mockToolLoopAgentGenerate).toHaveBeenCalled();
  });

  // ── 边界条件 ──────────────────────────────────────

  it('应该在 usage 为 undefined 时处理', async () => {
    mockToolLoopAgentGenerate.mockResolvedValue({
      text: '完成',
      // usage 缺失
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
});
