import { describe, it, expect, vi } from 'vitest';
import { ContextBuilder } from '../context-builder';
import type { AgentConfig } from '@/shared/types/agent';
import type { IToolRegistry, ToolDefinition } from '@/registry/types';
import type { IConversationManager, StoredMessage } from '@/shared/types/conversation';
import type { LowSensitivityContext } from '@/shared/types/browser';

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

function createMockConversationManager(): IConversationManager {
  return {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMessage: vi.fn(),
    getRecentMessages: vi.fn(),
    generateSummary: vi.fn(),
    needsSummary: vi.fn(),
  };
}

const defaultConfig: AgentConfig = {
  maxToolRounds: 15,
  systemPrompt: 'You are a browser assistant.',
  maxContextMessages: 20,
  contextWindowTokens: 128000,
  tokenBudgetMargin: 4096,
  microcompactKeepRecent: 10,
  microcompactMinChars: 500,
  microcompactExcludeTools: [],
  summaryThreshold: { messageCount: 30, estimatedTokens: 12_000 },
};

const defaultBrowserContext: LowSensitivityContext = {
  currentWindow: { tabs: [] },
  allWindows: [],
  tabGroups: [],
};

describe('ContextPollution (Issue #50)', () => {
  /**
   * 两轮对话集成测试：首轮含工具调用，验证第二轮 ContextBuilder 输出中
   * 每个 assistant tool_call 都有对应的 tool 响应消息，且不会使用伪造的 id。
   */
  it('两轮对话：首轮含工具调用，第二轮上下文正确重建 tool_calls/tool 对', async () => {
    const conversationManager = createMockConversationManager();

    // 模拟 DB 中存有第一轮对话的完整消息（user → assistant(tool_calls) → tool → assistant）
    const storedMessages: StoredMessage[] = [
      {
        id: 'm1',
        role: 'user',
        content: '帮我查天气',
        timestamp: 100,
      },
      {
        id: 'm2',
        role: 'assistant',
        content: '',
        timestamp: 200,
        toolCalls: [
          {
            id: 'call_real_1',
            name: 'getWeather',
            params: { city: 'Beijing' },
            result: 'success',
          },
        ],
      },
      {
        id: 'm3',
        role: 'tool',
        content: JSON.stringify({ temperature: 25, condition: 'Sunny' }),
        toolCallId: 'call_real_1',
        timestamp: 300,
      },
      {
        id: 'm4',
        role: 'assistant',
        content: '北京今天 25°C，天气晴朗。',
        timestamp: 400,
      },
    ];

    vi.mocked(conversationManager.get).mockResolvedValue({
      id: 'conv-1',
      title: 'test',
      createdAt: 0,
      updatedAt: 0,
      messages: storedMessages,
      summary: undefined,
      sensitiveDataGranted: false,
    });
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue(storedMessages);

    const toolRegistry = createMockToolRegistry([]);
    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);

    const result = await builder.build('conv-1', defaultBrowserContext);

    // 从 result 中提取历史消息（跳过 system 消息）
    const historyMessages = result.filter((m) => m.role !== 'system');

    // 验证：每条 assistant 消息的 tool_calls 使用真实 id
    const asstWithToolCall = historyMessages.find(
      (m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0,
    );
    expect(asstWithToolCall).toBeDefined();
    expect(asstWithToolCall!.tool_calls![0]!.id).toBe('call_real_1');
    // 不是伪造的 call_m2（旧模式用 msg.id 伪造）
    expect(asstWithToolCall!.tool_calls![0]!.id).not.toBe('call_m2');

    // 验证：每条 tool 消息的 tool_call_id 匹配 assistant 的 tool_calls[0].id
    const toolMsg = historyMessages.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.tool_call_id).toBe('call_real_1');
    expect(toolMsg!.tool_call_id).toBe(asstWithToolCall!.tool_calls![0]!.id);

    // 验证：assistant 和 tool 消息成对出现，顺序正确
    const asstIndex = historyMessages.indexOf(asstWithToolCall!);
    const toolIndex = historyMessages.indexOf(toolMsg!);
    expect(toolIndex).toBe(asstIndex + 1);
  });
});
