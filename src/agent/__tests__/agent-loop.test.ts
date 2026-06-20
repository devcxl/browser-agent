import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLoop, type AgentLoopHooks } from '../agent-loop';
import type { AgentConfig, AgentRunInput, ToolCallRecord } from '@/shared/types/agent';
import type { IToolRegistry, ToolDefinition, ToolResult } from '@/registry/types';
import type { IGuardrail, GuardrailCheck, GuardrailContext } from '@/shared/types/guardrail';
import type { IConversationManager, Conversation } from '@/shared/types/conversation';
import type { ILlmClient, ChatCompletionResponse, ChatMessage, ToolCallDelta } from '@/shared/types/llm';
import type { ProviderConfig, LowSensitivityContext } from '@/shared/types';

// ==================== Mocks ====================

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
      .mockImplementation(
        (_tool: { resultSensitivity: string }, result: ToolResult) => result,
      ),
  };
}

function createMockConversationManager(): IConversationManager {
  return {
    create: vi.fn(),
    get: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMessage: vi.fn(),
    getRecentMessages: vi.fn().mockResolvedValue([]),
    generateSummary: vi.fn(),
    needsSummary: vi.fn().mockResolvedValue(false),
  };
}

function createMockLlmClient(
  responses: ChatCompletionResponse[],
): ILlmClient {
  const mockChat = vi.fn();
  responses.forEach((r) => mockChat.mockResolvedValueOnce(r));
  return {
    chat: mockChat,
    chatStream: vi.fn(),
    checkHealth: vi.fn(),
  };
}

function toolCallDelta(
  id: string,
  name: string,
  args: Record<string, unknown>,
): ToolCallDelta {
  return {
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

function stopResponse(content: string): ChatCompletionResponse {
  return {
    id: 'resp-1',
    choices: [
      {
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
  };
}

function toolCallsResponse(
  ...tcs: ToolCallDelta[]
): ChatCompletionResponse {
  return {
    id: 'resp-1',
    choices: [
      {
        message: { role: 'assistant', content: null, tool_calls: tcs },
        finish_reason: 'tool_calls',
      },
    ],
  };
}

// ==================== Fixtures ====================

const defaultConfig: AgentConfig = {
  maxToolRounds: 15,
  systemPrompt: 'You are a browser assistant.',
  maxContextMessages: 20,
  summaryThreshold: { messageCount: 30, estimatedTokens: 12_000, toolCallCount: 50 },
};

const defaultProviderConfig: ProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4o',
  isLocalTrusted: false,
};

const defaultBrowserContext: LowSensitivityContext = {
  currentWindow: { tabs: [] },
  allWindows: [],
  tabGroups: [],
};

const defaultInput: AgentRunInput = {
  conversationId: 'conv-1',
  userMessage: '查询当前标签页',
  providerConfig: defaultProviderConfig,
  browserContext: defaultBrowserContext,
};

describe('AgentLoop', () => {
  let conversationManager: IConversationManager;

  beforeEach(() => {
    conversationManager = createMockConversationManager();
  });

  // === Scenario 1 ===
  it('单轮：用户消息 → LLM 无 tool_call → 文本回复', async () => {
    const llmClient = createMockLlmClient([stopResponse('当前没有打开的标签页。')]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      createMockToolRegistry([]),
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.finalMessage).toBe('当前没有打开的标签页。');
    expect(output.toolCalls).toEqual([]);
    expect(conversationManager.addMessage).toHaveBeenCalledTimes(2); // user + assistant
  });

  // === Scenario 2 ===
  it('单轮：1 个 tool_call → 执行成功 → 最终回复', async () => {
    const toolDef: ToolDefinition = {
      name: 'tabs_query',
      description: '查询标签页',
      schema: { type: 'object', properties: {} },
      category: 'tabs',
      riskLevel: 'low',
      confirmationRequired: false,
      resultSensitivity: 'low',
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'Example', url: 'https://example.com' }],
      } satisfies ToolResult),
    };

    const toolRegistry = createMockToolRegistry([toolDef]);
    const llmClient = createMockLlmClient([
      toolCallsResponse(toolCallDelta('call_1', 'tabs_query', {})),
      stopResponse('当前有 1 个标签页：Example'),
    ]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      toolRegistry,
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.finalMessage).toBe('当前有 1 个标签页：Example');
    expect(output.toolCalls).toHaveLength(1);
    expect(output.toolCalls[0]!.toolName).toBe('tabs_query');
    expect(output.toolCalls[0]!.result.success).toBe(true);
    expect(toolDef.execute).toHaveBeenCalledWith({});
  });

  // === Scenario 3 ===
  it('多轮：2 个连续 tool_call 依次执行', async () => {
    const toolDef1: ToolDefinition = {
      name: 'tabs_query',
      description: '查询标签页',
      schema: { type: 'object', properties: {} },
      category: 'tabs',
      riskLevel: 'low',
      confirmationRequired: false,
      resultSensitivity: 'low',
      execute: vi.fn().mockResolvedValue({ success: true, data: [{ id: 1, title: 'Tab 1' }] }),
    };
    const toolDef2: ToolDefinition = {
      name: 'tabs_create',
      description: '创建标签页',
      schema: { type: 'object', properties: { url: { type: 'string' } } },
      category: 'tabs',
      riskLevel: 'low',
      confirmationRequired: false,
      resultSensitivity: 'low',
      execute: vi.fn().mockResolvedValue({ success: true, data: { id: 2, url: 'https://new.com' } }),
    };

    const toolRegistry = createMockToolRegistry([toolDef1, toolDef2]);
    const llmClient = createMockLlmClient([
      toolCallsResponse(toolCallDelta('call_1', 'tabs_query', {})),
      toolCallsResponse(toolCallDelta('call_2', 'tabs_create', { url: 'https://new.com' })),
      stopResponse('已完成查询并创建了新标签页。'),
    ]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      toolRegistry,
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.finalMessage).toBe('已完成查询并创建了新标签页。');
    expect(output.toolCalls).toHaveLength(2);
    expect(output.toolCalls[0]!.toolName).toBe('tabs_query');
    expect(output.toolCalls[1]!.toolName).toBe('tabs_create');
  });

  // === Scenario 4 ===
  it('无效 tool name → LLM 收到错误反馈重试后修正', async () => {
    const toolDef: ToolDefinition = {
      name: 'tabs_query',
      description: '查询标签页',
      schema: { type: 'object', properties: {} },
      category: 'tabs',
      riskLevel: 'low',
      confirmationRequired: false,
      resultSensitivity: 'low',
      execute: vi.fn().mockResolvedValue({ success: true, data: [] }),
    };

    const toolRegistry = createMockToolRegistry([toolDef]);
    const llmClient = createMockLlmClient([
      toolCallsResponse(toolCallDelta('call_1', 'nonexistent_tool', {})),
      toolCallsResponse(toolCallDelta('call_2', 'tabs_query', {})),
      stopResponse('查询完成。'),
    ]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      toolRegistry,
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.finalMessage).toBe('查询完成。');
    expect(output.toolCalls).toHaveLength(1);
    expect(output.toolCalls[0]!.toolName).toBe('tabs_query');
  });

  // === Scenario 5 ===
  it('无效 tool name 连续 3 次 → 终止', async () => {
    const toolRegistry = createMockToolRegistry([]);
    const llmClient = createMockLlmClient([
      toolCallsResponse(toolCallDelta('call_1', 'bad_tool', {})),
      toolCallsResponse(toolCallDelta('call_2', 'bad_tool', {})),
      toolCallsResponse(toolCallDelta('call_3', 'bad_tool', {})),
      toolCallsResponse(toolCallDelta('call_4', 'bad_tool', {})),
    ]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      toolRegistry,
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.finalMessage).toBe('LLM 持续调用不存在的工具。');
    expect(output.toolCalls).toHaveLength(0);
  });

  // === Scenario 6 ===
  it('无效 JSON 参数 → 重试后修正', async () => {
    const toolDef: ToolDefinition = {
      name: 'tabs_create',
      description: '创建标签页',
      schema: { type: 'object', properties: { url: { type: 'string' } } },
      category: 'tabs',
      riskLevel: 'low',
      confirmationRequired: false,
      resultSensitivity: 'low',
      execute: vi.fn().mockResolvedValue({ success: true, data: { id: 2 } }),
    };

    const toolRegistry = createMockToolRegistry([toolDef]);
    const llmClient = createMockLlmClient([
      {
        id: 'resp-1',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'tabs_create', arguments: '{invalid json}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
      toolCallsResponse(toolCallDelta('call_2', 'tabs_create', { url: 'https://ok.com' })),
      stopResponse('创建成功。'),
    ]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      toolRegistry,
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.finalMessage).toBe('创建成功。');
    expect(output.toolCalls).toHaveLength(1);
    expect(toolDef.execute).toHaveBeenCalledWith({ url: 'https://ok.com' });
  });

  // === Scenario 7 ===
  it('无效 JSON 参数连续 3 次 → 终止', async () => {
    const toolDef: ToolDefinition = {
      name: 'tabs_create',
      description: '创建标签页',
      schema: { type: 'object', properties: {} },
      category: 'tabs',
      riskLevel: 'low',
      confirmationRequired: false,
      resultSensitivity: 'low',
      execute: vi.fn(),
    };

    const toolRegistry = createMockToolRegistry([toolDef]);
    const badDelta: ToolCallDelta = {
      id: 'call_bad',
      type: 'function',
      function: { name: 'tabs_create', arguments: '{bad}' },
    };
    const llmClient = createMockLlmClient([
      toolCallsResponse(badDelta),
      toolCallsResponse(badDelta),
      toolCallsResponse(badDelta),
      toolCallsResponse(badDelta),
    ]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      toolRegistry,
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.finalMessage).toBe('工具参数持续错误。');
    expect(toolDef.execute).not.toHaveBeenCalled();
  });

  // === Scenario 8 ===
  it('Guardrail 拒绝 → toolCalls 含失败记录', async () => {
    const toolDef: ToolDefinition = {
      name: 'tabs_close',
      description: '关闭标签页',
      schema: { type: 'object', properties: {} },
      category: 'tabs',
      riskLevel: 'high',
      confirmationRequired: true,
      resultSensitivity: 'low',
      execute: vi.fn(),
    };

    const guardrail = createMockGuardrail(false);
    const toolRegistry = createMockToolRegistry([toolDef]);
    const llmClient = createMockLlmClient([
      toolCallsResponse(toolCallDelta('call_1', 'tabs_close', {})),
      stopResponse('无法关闭标签页。'),
    ]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      toolRegistry,
      guardrail,
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.toolCalls).toHaveLength(1);
    expect(output.toolCalls[0]!.toolName).toBe('tabs_close');
    expect(output.toolCalls[0]!.result.success).toBe(false);
    expect(output.toolCalls[0]!.result.error).toBe('被拒绝');
    expect(toolDef.execute).not.toHaveBeenCalled();
  });

  // === Scenario 9 ===
  it('达到 maxToolRounds → 终止', async () => {
    const toolDef: ToolDefinition = {
      name: 'noop',
      description: 'noop',
      schema: { type: 'object', properties: {} },
      category: 'tabs',
      riskLevel: 'low',
      confirmationRequired: false,
      resultSensitivity: 'low',
      execute: vi.fn().mockResolvedValue({ success: true, data: {} }),
    };

    const toolRegistry = createMockToolRegistry([toolDef]);
    const config: AgentConfig = { ...defaultConfig, maxToolRounds: 3 };

    const toolCallResp = toolCallsResponse(toolCallDelta('call_n', 'noop', {}));
    const llmClient = createMockLlmClient([
      toolCallResp,
      toolCallResp,
      toolCallResp,
    ]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      config,
      toolRegistry,
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.finalMessage).toBe('操作步骤过多，已达到最大执行轮次。');
    expect(output.toolCalls).toHaveLength(3);
  });

  // === Scenario 10 ===
  it('AbortController 中止 → 立即停止', async () => {
    const toolDef: ToolDefinition = {
      name: 'slow_tool',
      description: '慢操作',
      schema: { type: 'object', properties: {} },
      category: 'tabs',
      riskLevel: 'low',
      confirmationRequired: false,
      resultSensitivity: 'low',
      execute: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ success: true, data: {} }), 5000),
          ),
      ),
    };

    const toolRegistry = createMockToolRegistry([toolDef]);
    const llmClient = createMockLlmClient([
      toolCallsResponse(toolCallDelta('call_1', 'slow_tool', {})),
    ]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      toolRegistry,
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const runPromise = loop.run(defaultInput);
    loop.abort();

    const output = await runPromise;
    expect(output.finalMessage).toBe('操作已被中止。');
  });

  // === Scenario 11 ===
  it('LLM API 调用失败 → 错误向上抛出', async () => {
    const llmClient = createMockLlmClient([]);
    llmClient.chat = vi.fn().mockRejectedValue(new Error('API 调用失败'));
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      createMockToolRegistry([]),
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    await expect(loop.run(defaultInput)).rejects.toThrow('API 调用失败');
  });

  // === Scenario 12 ===
  it('工具执行失败 → 错误注入上下文', async () => {
    const toolDef: ToolDefinition = {
      name: 'tabs_query',
      description: '查询标签页',
      schema: { type: 'object', properties: {} },
      category: 'tabs',
      riskLevel: 'low',
      confirmationRequired: false,
      resultSensitivity: 'low',
      execute: vi.fn().mockResolvedValue({
        success: false,
        error: '权限不足',
      } satisfies ToolResult),
    };

    const toolRegistry = createMockToolRegistry([toolDef]);
    const llmClient = createMockLlmClient([
      toolCallsResponse(toolCallDelta('call_1', 'tabs_query', {})),
      stopResponse('查询失败，请检查权限。'),
    ]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      toolRegistry,
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.toolCalls).toHaveLength(1);
    expect(output.toolCalls[0]!.result.success).toBe(false);
    expect(output.toolCalls[0]!.result.error).toBe('权限不足');
    expect(output.finalMessage).toBe('查询失败，请检查权限。');
  });

  // === Hooks Tests ===

  describe('AgentLoop hooks', () => {
    it('onStreamChunk 在 stop 响应时被调用', async () => {
      const llmClient = createMockLlmClient([stopResponse('你好！我是助手。')]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);
      const onStreamChunk = vi.fn();

      const loop = new AgentLoop(
        defaultConfig,
        createMockToolRegistry([]),
        createMockGuardrail(),
        conversationManager,
        llmFactory,
        { onStreamChunk },
      );

      await loop.run(defaultInput);

      expect(onStreamChunk).toHaveBeenCalled();
      // Should be called with chunks of the final message
      const calls = onStreamChunk.mock.calls.map((c: [string]) => c[0]);
      const combined = calls.join('');
      expect(combined).toBe('你好！我是助手。');
    });

    it('onToolCall 在工具执行完成后被调用', async () => {
      const toolDef: ToolDefinition = {
        name: 'tabs_query',
        description: '查询标签页',
        schema: { type: 'object', properties: {} },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: [{ id: 1, title: 'Example' }],
        } satisfies ToolResult),
      };

      const toolRegistry = createMockToolRegistry([toolDef]);
      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_1', 'tabs_query', {})),
        stopResponse('查询完成。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);
      const onToolCall = vi.fn();

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        createMockGuardrail(),
        conversationManager,
        llmFactory,
        { onToolCall },
      );

      await loop.run(defaultInput);

      expect(onToolCall).toHaveBeenCalledTimes(1);
      const record: ToolCallRecord = onToolCall.mock.calls[0][0];
      expect(record.toolName).toBe('tabs_query');
      expect(record.result.success).toBe(true);
    });

    it('onConfirm 在高风险工具需确认时被调用', async () => {
      const toolDef: ToolDefinition = {
        name: 'tabs_close',
        description: '关闭标签页',
        schema: { type: 'object', properties: { tabId: { type: 'number' } } },
        category: 'tabs',
        riskLevel: 'high',
        confirmationRequired: true,
        resultSensitivity: 'low',
        execute: vi.fn().mockResolvedValue({ success: true, data: {} }),
        preflight: vi.fn().mockResolvedValue({
          affectedObjects: [{ type: 'tab', id: '1', reason: '关闭标签页' }],
          warnings: ['关闭后将无法恢复'],
        }),
      };

      const toolRegistry = createMockToolRegistry([toolDef]);
      // Guardrail returns allowed=true but requiresConfirmation=true for high risk
      const guardrail: IGuardrail = {
        check: vi.fn().mockResolvedValue({
          allowed: true,
          riskLevel: 'high',
          requiresPreflight: true,
          requiresConfirmation: true,
          reason: '高风险操作，需要用户确认',
          dataSensitivity: 'low',
        } satisfies GuardrailCheck),
        filterResultForRemote: vi.fn().mockImplementation((_t, r) => r),
      };

      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_1', 'tabs_close', { tabId: 1 })),
        stopResponse('已关闭标签页。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const onConfirm = vi.fn().mockResolvedValue(true);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        guardrail,
        conversationManager,
        llmFactory,
        { onConfirm },
      );

      const output = await loop.run(defaultInput);

      expect(onConfirm).toHaveBeenCalledTimes(1);
      const request = onConfirm.mock.calls[0][0];
      expect(request.toolName).toBe('tabs_close');
      expect(request.params).toEqual({ tabId: 1 });
      expect(toolDef.execute).toHaveBeenCalled(); // confirmed, so tool executed
      expect(output.toolCalls[0]!.confirmed).toBe(true);
    });

    it('onConfirm 拒绝后跳过工具执行', async () => {
      const toolDef: ToolDefinition = {
        name: 'tabs_close',
        description: '关闭标签页',
        schema: { type: 'object', properties: { tabId: { type: 'number' } } },
        category: 'tabs',
        riskLevel: 'high',
        confirmationRequired: true,
        resultSensitivity: 'low',
        execute: vi.fn(),
        preflight: vi.fn().mockResolvedValue({
          affectedObjects: [{ type: 'tab', id: '1', reason: '关闭标签页' }],
          warnings: ['关闭后将无法恢复'],
        }),
      };

      const toolRegistry = createMockToolRegistry([toolDef]);
      const guardrail: IGuardrail = {
        check: vi.fn().mockResolvedValue({
          allowed: true,
          riskLevel: 'high',
          requiresPreflight: true,
          requiresConfirmation: true,
          reason: '高风险操作，需要用户确认',
          dataSensitivity: 'low',
        } satisfies GuardrailCheck),
        filterResultForRemote: vi.fn().mockImplementation((_t, r) => r),
      };

      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_1', 'tabs_close', { tabId: 1 })),
        stopResponse('已取消操作。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const onConfirm = vi.fn().mockResolvedValue(false);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        guardrail,
        conversationManager,
        llmFactory,
        { onConfirm },
      );

      const output = await loop.run(defaultInput);

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(toolDef.execute).not.toHaveBeenCalled();
      // Tool call record should exist but with confirmed=false and a skip note
      expect(output.toolCalls[0]!.confirmed).toBe(false);
    });
  });
});
