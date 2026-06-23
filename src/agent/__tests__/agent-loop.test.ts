import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLoop, type AgentLoopHooks } from '../agent-loop';
import type { AgentConfig, AgentRunInput, ToolCallRecord } from '@/shared/types/agent';
import type { IToolRegistry, ToolDefinition, ToolResult } from '@/registry/types';
import type { IGuardrail, GuardrailCheck, GuardrailContext } from '@/shared/types/guardrail';
import type { IConversationManager, Conversation, StoredMessage } from '@/shared/types/conversation';
import type { ILlmClient, ChatCompletionResponse, ChatMessage, ToolCallDelta } from '@/shared/types/llm';
import type { ProviderConfig, LowSensitivityContext, Skill } from '@/shared/types';
import { ContextBuilder } from '../context-builder';

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
    getRecentMessages: vi.fn().mockImplementation((_convId: string) => {
      return Promise.resolve([...storedMessages]);
    }),
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

function stopResponseWithUsage(
  content: string,
  promptTokens: number,
  completionTokens: number,
): ChatCompletionResponse {
  return {
    id: 'resp-1',
    choices: [
      {
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
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

  // ── Issue #50 specific tests ──

  describe('Issue #50 (context pollution)', () => {
    // (Slice C)
    it('assistant 消息存储时 toolCalls 包含真实 id', async () => {
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
        toolCallsResponse(toolCallDelta('call_abc_123', 'tabs_query', {})),
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

      await loop.run(defaultInput);

      // 验证 addMessage 被调用 4 次：user + assistant(tool_calls) + tool + assistant(final)
      expect(conversationManager.addMessage).toHaveBeenCalledTimes(4);

      // 第 2 次：中间 assistant(tool_calls) 消息，toolCalls 含真实 id
      const midAsst = vi.mocked(conversationManager.addMessage).mock.calls[1];
      expect(midAsst![1].role).toBe('assistant');
      expect(midAsst![1].toolCalls).toBeDefined();
      expect(midAsst![1].toolCalls![0]!.id).toBe('call_abc_123');

      // 第 3 次：tool 响应持久化
      const toolCall = vi.mocked(conversationManager.addMessage).mock.calls[2];
      expect(toolCall![1].role).toBe('tool');
      expect(toolCall![1].toolCallId).toBe('call_abc_123');

      // 第 4 次：最终 assistant 消息，不含 toolCalls（已在中间消息持久化）
      const finalAsst = vi.mocked(conversationManager.addMessage).mock.calls[3];
      expect(finalAsst![1].role).toBe('assistant');
      expect(finalAsst![1].toolCalls).toBeUndefined();
    });

    // (Slice E)
    it('当前轮 user 消息不重复（build 后 messages 中仅出现一次）', async () => {
      // 模拟 DB 中已有历史 user 消息 + 刚存储的当前 user 消息
      const currentUserMsg: StoredMessage = {
        id: 'current-user',
        role: 'user',
        content: '查询当前标签页',
        timestamp: 200,
      };
      const historyMessages: StoredMessage[] = [
        {
          id: 'prev-user',
          role: 'user',
          content: '之前的对话',
          timestamp: 100,
        },
        currentUserMsg,
      ];
      vi.mocked(conversationManager.getRecentMessages).mockResolvedValue(historyMessages);

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
          data: [],
        } satisfies ToolResult),
      };

      const toolRegistry = createMockToolRegistry([toolDef]);
      const llmClient = createMockLlmClient([
        stopResponse('这是对当前问题的回复。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        createMockGuardrail(),
        conversationManager,
        llmFactory,
      );

      await loop.run(defaultInput);

      // 验证：addMessage 被调用了 2 次（user + assistant），没有 tool 消息
      expect(conversationManager.addMessage).toHaveBeenCalledTimes(2);

      // 验证：LLM 收到的 messages 中当前 user 消息只出现一次（没有重复 push）
      const llmChat = vi.mocked(llmClient.chat);
      const messagesArg = llmChat.mock.calls[0]![0]!.messages;

      const userMessages = messagesArg.filter((m) => m.role === 'user');
      // 历史中有 1 条 "之前的对话"，1 条当前 "查询当前标签页"
      expect(userMessages).toHaveLength(2);
      // 没有重复：当前消息应该只出现一次
      expect(userMessages.filter((m) => m.content === '查询当前标签页')).toHaveLength(1);
    });
  });

  // === Scenario: tool_calls 消息序列协议 ===
  describe('tool_calls 消息序列（OpenAI 协议）', () => {
    it('tool_call 后，LLM 下一轮收到的 messages 包含 assistant(tool_calls) 包裹，位于 tool(result) 之前', async () => {
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
        toolCallsResponse(toolCallDelta('call_1', 'tabs_query', {})),
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

      await loop.run(defaultInput);

      // 第二轮 LLM 调用（index 1）的 messages 应包含：
      // ... assistant(tool_calls: call_1) → tool(tool_call_id: call_1)
      const llmChat = vi.mocked(llmClient.chat);
      const secondRoundMessages = llmChat.mock.calls[1]![0]!.messages;

      const assistantToolCall = secondRoundMessages.find(
        (m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0,
      );
      const toolResult = secondRoundMessages.find(
        (m) => m.role === 'tool' && m.tool_call_id === 'call_1',
      );

      // 两者都应存在
      expect(assistantToolCall).toBeDefined();
      expect(toolResult).toBeDefined();

      // assistant(tool_calls) 必须在 tool(result) 之前
      const asstIdx = secondRoundMessages.indexOf(assistantToolCall!);
      const toolIdx = secondRoundMessages.indexOf(toolResult!);
      expect(asstIdx).toBeLessThan(toolIdx);

      // assistant 的 tool_calls id 与 tool 消息的 tool_call_id 匹配
      expect(assistantToolCall!.tool_calls![0]!.id).toBe('call_1');
    });

    it('连续两个 tool_call（同一轮 assistant）共用一个 assistant 包裹', async () => {
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
      // 第一轮返回两个 tool_call
      const llmClient = createMockLlmClient([
        toolCallsResponse(
          toolCallDelta('call_1', 'tabs_query', {}),
          toolCallDelta('call_2', 'tabs_query', {}),
        ),
        stopResponse('完成。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        createMockGuardrail(),
        conversationManager,
        llmFactory,
      );

      await loop.run(defaultInput);

      const llmChat = vi.mocked(llmClient.chat);
      const secondRoundMessages = llmChat.mock.calls[1]![0]!.messages;

      // 只应有一个 assistant(tool_calls) 消息，包含两个 tool_call
      const assistantToolCalls = secondRoundMessages.filter(
        (m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0,
      );
      expect(assistantToolCalls).toHaveLength(1);
      expect(assistantToolCalls[0]!.tool_calls).toHaveLength(2);

      // 两个 tool result 都在 assistant 之后
      const toolMsgs = secondRoundMessages.filter((m) => m.role === 'tool');
      expect(toolMsgs).toHaveLength(2);
      const asstIdx = secondRoundMessages.indexOf(assistantToolCalls[0]!);
      for (const tm of toolMsgs) {
        expect(secondRoundMessages.indexOf(tm)).toBeGreaterThan(asstIdx);
      }
    });
  });

  // === Scenario: DB 持久化序列 ===
  describe('DB 持久化序列（assistant(tool_calls) 必须独立持久化）', () => {
    it('tool_call 场景：addMessage 序列为 user → assistant(tool_calls) → tool → assistant(final)', async () => {
      const toolDef: ToolDefinition = {
        name: 'tabs_query',
        description: '查询标签页',
        schema: { type: 'object', properties: {} },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn().mockResolvedValue({ success: true, data: [] } satisfies ToolResult),
      };

      const toolRegistry = createMockToolRegistry([toolDef]);
      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_x1', 'tabs_query', {})),
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

      await loop.run(defaultInput);

      const calls = vi.mocked(conversationManager.addMessage).mock.calls;
      // 预期 4 次：user → assistant(tool_calls) → tool → assistant(final)
      expect(calls).toHaveLength(4);

      const roles = calls.map((c) => c[1].role);
      expect(roles).toEqual(['user', 'assistant', 'tool', 'assistant']);

      // 第 2 条：中间 assistant(tool_calls) 消息，含真实 tool_call id
      const midAsst = calls[1]![1];
      expect(midAsst.toolCalls).toBeDefined();
      expect(midAsst.toolCalls).toHaveLength(1);
      expect(midAsst.toolCalls![0]!.id).toBe('call_x1');

      // 第 3 条：tool 消息，toolCallId 匹配中间 assistant 的 tool_call id
      const toolMsg = calls[2]![1];
      expect(toolMsg.role).toBe('tool');
      expect(toolMsg.toolCallId).toBe('call_x1');

      // 第 4 条：最终 assistant 消息，不应再携带 toolCalls（已在中间消息持久化）
      const finalAsst = calls[3]![1];
      expect(finalAsst.role).toBe('assistant');
      expect(finalAsst.toolCalls).toBeUndefined();
    });

    it('多轮 tool_call：每个 tool_calls 响应都独立持久化为 assistant 消息', async () => {
      const toolDef: ToolDefinition = {
        name: 'tabs_query',
        description: '查询标签页',
        schema: { type: 'object', properties: {} },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn().mockResolvedValue({ success: true, data: [] } satisfies ToolResult),
      };

      const toolRegistry = createMockToolRegistry([toolDef]);
      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_a', 'tabs_query', {})),
        toolCallsResponse(toolCallDelta('call_b', 'tabs_query', {})),
        stopResponse('完成。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        createMockGuardrail(),
        conversationManager,
        llmFactory,
      );

      await loop.run(defaultInput);

      const calls = vi.mocked(conversationManager.addMessage).mock.calls;
      // user → asst(call_a) → tool → asst(call_b) → tool → asst(final)
      expect(calls).toHaveLength(6);
      const roles = calls.map((c) => c[1].role);
      expect(roles).toEqual(['user', 'assistant', 'tool', 'assistant', 'tool', 'assistant']);

      // 两个中间 assistant 消息各有 1 个 toolCall，id 分别为 call_a / call_b
      expect(calls[1]![1].toolCalls![0]!.id).toBe('call_a');
      expect(calls[3]![1].toolCalls![0]!.id).toBe('call_b');

      // 最终 assistant 不含 toolCalls
      expect(calls[5]![1].toolCalls).toBeUndefined();
    });
  });

  // === Token Usage Tests ===
  it('单轮有 usage → 返回 tokenUsage', async () => {
    const llmClient = createMockLlmClient([stopResponseWithUsage('完成。', 50, 30)]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      createMockToolRegistry([]),
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.tokenUsage).toEqual({ prompt: 50, completion: 30 });
  });

  // === Scenario 14 ===
  it('多轮累加 usage', async () => {
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
    const toolCallResp = toolCallsResponse(toolCallDelta('call_1', 'noop', {}));

    const resp1 = { ...toolCallResp, usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } };
    const resp2 = { ...toolCallResp, usage: { prompt_tokens: 60, completion_tokens: 40, total_tokens: 100 } };
    const resp3 = { ...toolCallResp, usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 } };
    const resp4 = { ...stopResponseWithUsage('完成。', 10, 5), usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };

    const config: AgentConfig = { ...defaultConfig, maxToolRounds: 4 };
    const llmClient = createMockLlmClient([resp1, resp2, resp3, resp4]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      config,
      toolRegistry,
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.tokenUsage).toEqual({ prompt: 200, completion: 115 });
  });

  // === Scenario 15 ===
  it('usage 为 undefined → 不累积', async () => {
    const llmClient = createMockLlmClient([stopResponse('完成。')]);
    const llmFactory = vi.fn().mockReturnValue(llmClient);

    const loop = new AgentLoop(
      defaultConfig,
      createMockToolRegistry([]),
      createMockGuardrail(),
      conversationManager,
      llmFactory,
    );

    const output = await loop.run(defaultInput);

    expect(output.tokenUsage).toEqual({ prompt: 0, completion: 0 });
  });

  // === Skill Interception Tests ===

  describe('Skill tool call 拦截', () => {
    const mockSkill: Skill = {
      id: 'skill-1',
      name: 'caveman',
      description: '压缩输出模式',
      prompt: '用 caveman 模式回复',
      enabled: true,
      createdAt: 100,
      updatedAt: 100,
    };

    it('匹配 skill → 拦截成功，activeSkillNames 更新，不经过 guardrail 和 execute', async () => {
      const toolDef: ToolDefinition = {
        name: 'skill',
        description: '激活一个技能',
        schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn(),
      };

      const toolRegistry = createMockToolRegistry([toolDef]);
      const guardrail = createMockGuardrail();
      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_skill', 'skill', { name: 'caveman' })),
        stopResponse('激活 caveman 成功。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        guardrail,
        conversationManager,
        llmFactory,
      );

      const output = await loop.run({
        ...defaultInput,
        skills: [mockSkill],
      });

      // 验证
      expect(output.finalMessage).toBe('激活 caveman 成功。');
      // tool 不执行
      expect(toolDef.execute).not.toHaveBeenCalled();
      // guardrail.check 不被调用（skill 拦截在 guardrail 之前）
      expect(guardrail.check).not.toHaveBeenCalled();
      // addMessage 序列：user + assistant(tool_calls) + tool + assistant(final)
      expect(conversationManager.addMessage).toHaveBeenCalledTimes(4);

      // 第二轮 LLM 调用的 messages 应包含 skill prompt
      const llmChat = vi.mocked(llmClient.chat);
      const secondRoundMessages = llmChat.mock.calls[1]![0]!.messages;
      const systemMsg = secondRoundMessages.find((m) => m.role === 'system');
      expect(systemMsg?.content).toContain('caveman');
    });

    it('不匹配的 skill name → 返回错误 result', async () => {
      const toolDef: ToolDefinition = {
        name: 'skill',
        description: '激活一个技能',
        schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn().mockResolvedValue({ success: false, error: 'unknown skill' } satisfies ToolResult),
      };

      const toolRegistry = createMockToolRegistry([toolDef]);
      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_bad', 'skill', { name: 'nonexistent' })),
        stopResponse('未找到技能。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        createMockGuardrail(),
        conversationManager,
        llmFactory,
      );

      const output = await loop.run({
        ...defaultInput,
        skills: [mockSkill],
      });

      expect(output.finalMessage).toBe('未找到技能。');
      expect(output.toolCalls).toHaveLength(1);
      expect(output.toolCalls[0]!.toolName).toBe('skill');
      expect(output.toolCalls[0]!.result.success).toBe(false);
    });

    it('非 skill tool call 不受影响', async () => {
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

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        createMockGuardrail(),
        conversationManager,
        llmFactory,
      );

      await loop.run({
        ...defaultInput,
        skills: [mockSkill],
      });

      // 正常执行流程
      expect(toolDef.execute).toHaveBeenCalledWith({});
      // addMessage 序列：user + assistant(tool_calls) + tool + assistant(final)
      expect(conversationManager.addMessage).toHaveBeenCalledTimes(4);
    });
  });
});
