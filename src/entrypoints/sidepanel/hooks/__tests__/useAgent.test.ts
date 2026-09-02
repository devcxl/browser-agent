import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// vi.hoisted: 确保 mock 对象在 vi.mock 提升前初始化
const { mockRun, mockAbort, mockGenerateTitle, mockConfigStoreGet, state } =
  vi.hoisted(() => ({
    mockRun: vi.fn(),
    mockAbort: vi.fn(),
    mockGenerateTitle: vi.fn(),
    mockConfigStoreGet: vi.fn(),
    state: {
      capturedApprovalFn: null as any,
      capturedAdapterArgs: [] as any[][],
    },
  }));

// Mock ToolLoopAdapter module
vi.mock('@/agent/tool-loop-adapter', () => ({
  ToolLoopAdapter: vi.fn().mockImplementation((...args: any[]) => {
    state.capturedAdapterArgs.push(args);
    state.capturedApprovalFn = args[6]; // onRequestApproval 是第 7 个参数 (index 6)
    return {
      run: mockRun,
      abort: mockAbort,
    };
  }),
}));

vi.mock('@/provider', () => ({
  LlmClient: vi.fn(),
}));
vi.mock('@/agent/context-builder', () => ({
  ContextBuilder: vi.fn().mockImplementation(() => ({
    build: vi.fn().mockResolvedValue([]),
  })),
}));
vi.mock('@/shared/db/database', () => ({
  Database: {
    getInstance: vi.fn().mockReturnValue({}),
    resetInstance: vi.fn(),
  },
}));
vi.mock('@/conversation', () => ({
  ConversationManager: vi.fn().mockImplementation(() => ({
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMessage: vi.fn(),
    getRecentMessages: vi.fn().mockResolvedValue([]),
    generateTitle: mockGenerateTitle,
  })),
}));
vi.mock('@/guardrail', () => ({
  Guardrail: vi.fn().mockImplementation(() => ({
    check: vi.fn(),
    filterResultForRemote: vi.fn(),
  })),
}));
vi.mock('@/registry', () => ({
  ToolRegistry: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    registerAll: vi.fn(),
    getAllTools: vi.fn().mockReturnValue([]),
    getTool: vi.fn(),
    toOpenAISchema: vi.fn().mockReturnValue([]),
    unregisterCategory: vi.fn(),
    getToolsByCategory: vi.fn().mockReturnValue([]),
  })),
}));
vi.mock('@/shared/jsonrpc/client', () => ({
  JsonRpcClient: vi.fn().mockImplementation(() => ({
    request: vi.fn(),
    notify: vi.fn(),
    onRequest: vi.fn(),
    onNotification: vi.fn(),
    offRequest: vi.fn(),
    offNotification: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  })),
}));
vi.mock('@/tools/tabs', () => ({
  createTabsTools: vi.fn().mockReturnValue([]),
}));
vi.mock('@/tools/windows', () => ({
  createWindowsTools: vi.fn().mockReturnValue([]),
}));
vi.mock('@/tools/tabgroups', () => ({
  createTabGroupsTools: vi.fn().mockReturnValue([]),
}));
vi.mock('@/tools/phase2-register', () => ({
  registerPhase2Tools: vi.fn(),
}));
vi.mock('@/tools/page', () => ({
  createPageTools: vi.fn().mockReturnValue([]),
}));
vi.mock('@/tools/skill-tool', () => ({
  createSkillTool: vi.fn().mockReturnValue({
    name: 'skill',
    description: 'mock skill tool',
    schema: { type: 'object', properties: {}, required: [] },
    category: 'expert',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    execute: vi.fn().mockResolvedValue({ success: true, data: {} }),
  }),
}));
vi.mock('@/shared/storage', () => ({
  SkillStore: {
    getInstance: vi.fn().mockReturnValue({
      getEnabled: vi.fn().mockResolvedValue([]),
      loadReady: vi.fn().mockResolvedValue([]),
    }),
  },
  ConfigStore: {
    getInstance: vi.fn().mockReturnValue({
      get: mockConfigStoreGet,
      set: vi.fn(),
      getAll: vi.fn(),
      patch: vi.fn(),
      onChange: vi.fn(),
    }),
  },
}));

import { useAgent } from '../useAgent';
import type { UIMessage } from '../../types';

describe('useAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.capturedApprovalFn = null;
    state.capturedAdapterArgs = [];
    mockRun.mockReset();
    mockRun.mockResolvedValue({ finalMessage: '完成', toolCalls: [] });
    mockAbort.mockReset();
    mockGenerateTitle.mockReset();
    mockGenerateTitle.mockResolvedValue(undefined);
    mockConfigStoreGet.mockReset();
    mockConfigStoreGet.mockResolvedValue(null);
  });

  it('初始状态为 idle', () => {
    const { result } = renderHook(() => useAgent());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('run 更新状态并调用 ToolLoopAdapter', async () => {
    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();

    result.current.setCallbacks({ onMessage });

    await act(async () => {
      await result.current.run('conv-1', '你好', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'key',
        model: 'gpt-4o',
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    const { ToolLoopAdapter } = await import('@/agent/tool-loop-adapter');
    expect(ToolLoopAdapter).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('run 发送 user 和 assistant 消息', async () => {
    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();

    result.current.setCallbacks({ onMessage });

    await act(async () => {
      await result.current.run('conv-1', '测试消息', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'key',
        model: 'gpt-4o',
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    const userCalls = onMessage.mock.calls.filter(
      (c: [UIMessage]) => c[0].role === 'user',
    );
    const assistantCalls = onMessage.mock.calls.filter(
      (c: [UIMessage]) => c[0].role === 'assistant',
    );

    expect(userCalls.length).toBeGreaterThanOrEqual(1);
    expect(userCalls[0][0].content).toBe('测试消息');
    expect(assistantCalls.length).toBeGreaterThanOrEqual(1);
    expect(assistantCalls[assistantCalls.length - 1][0].status).toBe('complete');
  });

  it('首轮完成后异步生成标题并通知 UI', async () => {
    mockGenerateTitle.mockResolvedValue('测试会话标题');
    const { result } = renderHook(() => useAgent());
    const onConversationTitle = vi.fn();
    result.current.setCallbacks({ onConversationTitle });

    await act(async () => {
      await result.current.run(
        'conv-1',
        '测试消息',
        {
          id: 'test',
          name: 'Test',
          endpoint: 'https://api.test.com',
          apiKey: 'key',
          model: 'gpt-4o',
          isLocalTrusted: false,
        },
        'gpt-4o',
      );
    });

    await waitFor(() => {
      expect(mockGenerateTitle).toHaveBeenCalledWith('conv-1', expect.anything(), 'gpt-4o');
      expect(onConversationTitle).toHaveBeenCalledWith('conv-1', '测试会话标题');
    });
  });

  it('abort 在运行后调用 ToolLoopAdapter.abort', async () => {
    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();
    result.current.setCallbacks({ onMessage });

    const runPromise = result.current.run('conv-1', '你好', {
      id: 'test',
      name: 'Test',
      endpoint: 'https://api.test.com',
      apiKey: 'key',
      model: 'gpt-4o',
      isLocalTrusted: false,
    }, 'gpt-4o');

    await new Promise((r) => setTimeout(r, 50));

    act(() => {
      result.current.abort();
    });

    await act(async () => {
      await runPromise;
    });

    expect(mockAbort).toHaveBeenCalled();
  });

  it('abort 在 idle 时安全调用', () => {
    const { result } = renderHook(() => useAgent());

    expect(() => {
      result.current.abort();
    }).not.toThrow();
  });

  it('error 时设置错误状态', async () => {
    mockRun.mockRejectedValue(new Error('网络错误'));

    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();
    result.current.setCallbacks({ onMessage });

    await act(async () => {
      await result.current.run('conv-1', '你好', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'key',
        model: 'gpt-4o',
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('网络错误');
  });

  it('confirm 流程：onRequestApproval 被调用后 resolveConfirm(true) 返回 approve', async () => {
    mockRun.mockImplementation(async () => {
      if (state.capturedApprovalFn) {
        const decision = await state.capturedApprovalFn({
          toolName: 'tabs_close',
          params: { tabId: 1 },
          affectedObjects: [{ type: 'tab', id: '1', title: 'Test', url: 'https://test.com', reason: '关闭标签页' }],
          warnings: '关闭标签页可能导致未保存数据丢失',
        });
        if (decision === 'deny') {
          return { finalMessage: '用户取消', toolCalls: [] };
        }
      }
      return { finalMessage: '操作已确认并执行', toolCalls: [] };
    });

    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();
    const onConfirm = vi.fn();
    result.current.setCallbacks({ onMessage, onConfirm });

    let runPromise: Promise<void>;
    act(() => {
      runPromise = result.current.run('conv-1', '关闭标签页', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'key',
        model: 'gpt-4o',
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
      expect(result.current.status).toBe('waitingConfirmation');
    });

    const confirmReq = onConfirm.mock.calls[0][0];
    expect(confirmReq.toolName).toBe('tabs_close');
    expect(confirmReq.affectedObjects[0].type).toBe('tab');
    expect(confirmReq.warnings[0]).toContain('未保存数据');

    await act(async () => {
      result.current.resolveConfirm(true);
    });

    await act(async () => {
      await runPromise!;
    });

    expect(result.current.status).toBe('idle');
  });

  it('confirm 流程：拒绝后收到 false 并返回取消消息', async () => {
    mockRun.mockImplementation(async () => {
      if (state.capturedApprovalFn) {
        const decision = await state.capturedApprovalFn({
          toolName: 'tabs_close',
          params: { tabId: 1 },
          affectedObjects: [],
          warnings: '',
        });
        if (decision === 'deny') {
          return { finalMessage: '用户取消', toolCalls: [] };
        }
      }
      return { finalMessage: '执行成功', toolCalls: [] };
    });

    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();
    const onConfirm = vi.fn();
    result.current.setCallbacks({ onMessage, onConfirm });

    let runPromise: Promise<void>;
    act(() => {
      runPromise = result.current.run('conv-1', '关闭标签页', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'key',
        model: 'gpt-4o',
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('waitingConfirmation');
    });

    await act(async () => {
      result.current.resolveConfirm(false);
    });

    await act(async () => {
      await runPromise!;
    });

    expect(result.current.status).toBe('idle');
  });

  it('使用持久化的单次任务最大执行步数', async () => {
    mockConfigStoreGet.mockImplementation((key: string) =>
      Promise.resolve(
        key === 'agentSettings'
          ? {
              maxToolRounds: 7,
              systemPrompt: 'test',
              contextWindowTokens: 128000,
              tokenBudgetMargin: 4096,
              microcompactKeepRecent: 10,
              microcompactMinChars: 500,
              microcompactExcludeTools: [],
              reasoningEffort: 'medium',
              summaryThreshold: { messageCount: 30, estimatedTokens: 12000 },
            }
          : null,
      ),
    );
    const { result } = renderHook(() => useAgent());

    await act(async () => {
      await result.current.run('conv-1', '你好', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'key',
        model: 'gpt-4o',
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    expect(state.capturedAdapterArgs[0]?.[5]).toEqual(
      expect.objectContaining({ maxToolRounds: 7 }),
    );
  });

  it('展示工具调用记录与 tokenUsage', async () => {
    mockRun.mockResolvedValue({
      finalMessage: '操作完成',
      toolCalls: [
        {
          toolName: 'tabs_query',
          params: {},
          result: { success: true, data: [] },
          riskLevel: 'low' as const,
          confirmed: true,
          timestamp: Date.now(),
          toolCallId: 'call-1',
        },
      ],
      tokenUsage: { prompt: 50, completion: 30 },
    });

    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();
    const onTokenUsage = vi.fn();
    result.current.setCallbacks({ onMessage, onTokenUsage });

    await act(async () => {
      await result.current.run('conv-1', '你好', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'key',
        model: 'gpt-4o',
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    const toolCalls = onMessage.mock.calls.filter(
      (c: [UIMessage]) => c[0].role === 'tool',
    );
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(toolCalls[0][0].toolCallDisplay).toBeDefined();
    expect(toolCalls[0][0].toolCallDisplay.name).toBe('tabs_query');

    expect(onTokenUsage).toHaveBeenCalledWith({ prompt: 50, completion: 30 });
  });
});
