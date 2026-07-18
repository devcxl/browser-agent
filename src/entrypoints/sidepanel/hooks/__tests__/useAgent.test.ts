import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// vi.hoisted: 确保 mock 对象在 vi.mock 提升前初始化
const { mockRun, mockAbort, mockToolLoopAdapterRun, mockToolLoopAdapterAbort, mockGenerateTitle, mockConfigStoreGet, mockFeatureFlags, state } =
  vi.hoisted(() => ({
    mockRun: vi.fn(),
    mockAbort: vi.fn(),
    mockToolLoopAdapterRun: vi.fn(),
    mockToolLoopAdapterAbort: vi.fn(),
    mockGenerateTitle: vi.fn(),
    mockConfigStoreGet: vi.fn(),
    mockFeatureFlags: { useToolLoopAgent: false },
    state: {
      capturedHooks: null as any,
      capturedToolLoopAdapterArgs: [] as any[][],
    },
  }));

// Mock AgentLoop module - capture hooks passed to constructor
vi.mock('@/agent/agent-loop', () => ({
  AgentLoop: vi.fn().mockImplementation((...args: any[]) => {
    state.capturedHooks = args[5]; // hooks is 6th constructor arg
    return {
      run: mockRun,
      abort: mockAbort,
    };
  }),
}));

// Mock ToolLoopAdapter module
vi.mock('@/agent/tool-loop-adapter', () => ({
  ToolLoopAdapter: vi.fn().mockImplementation((...args: any[]) => {
    state.capturedToolLoopAdapterArgs.push(args);
    return {
      run: mockToolLoopAdapterRun,
      abort: mockToolLoopAdapterAbort,
    };
  }),
}));

// Mock feature flags — mutable object for test control
vi.mock('@/shared/feature-flags', () => ({
  FEATURE_FLAGS: mockFeatureFlags,
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
    state.capturedHooks = null;
    state.capturedToolLoopAdapterArgs = [];
    mockRun.mockReset();
    mockRun.mockResolvedValue({ finalMessage: '完成', toolCalls: [] });
    mockAbort.mockReset();
    mockToolLoopAdapterRun.mockReset();
    mockToolLoopAdapterRun.mockResolvedValue({ finalMessage: '完成', toolCalls: [] });
    mockToolLoopAdapterAbort.mockReset();
    mockGenerateTitle.mockReset();
    mockGenerateTitle.mockResolvedValue(undefined);
    mockConfigStoreGet.mockReset();
    mockConfigStoreGet.mockResolvedValue(null);
    mockFeatureFlags.useToolLoopAgent = false;
  });

  it('初始状态为 idle', () => {
    const { result } = renderHook(() => useAgent());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('run 更新状态并调用 AgentLoop', async () => {
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
      });
    });

    const { AgentLoop } = await import('@/agent/agent-loop');
    expect(AgentLoop).toHaveBeenCalled();
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
      });
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
      await result.current.run('conv-1', '测试消息', {
        id: 'test', name: 'Test', endpoint: 'https://api.test.com', apiKey: 'key', model: 'gpt-4o', isLocalTrusted: false,
      }, 'gpt-4o');
    });

    await waitFor(() => {
      expect(mockGenerateTitle).toHaveBeenCalledWith('conv-1', expect.anything(), 'gpt-4o');
      expect(onConversationTitle).toHaveBeenCalledWith('conv-1', '测试会话标题');
    });
  });

  it('abort 在运行后调用 AgentLoop.abort', async () => {
    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();
    result.current.setCallbacks({ onMessage });

    // Run and immediately abort - the run will create the loop then abort
    const runPromise = result.current.run('conv-1', '你好', {
      id: 'test',
      name: 'Test',
      endpoint: 'https://api.test.com',
      apiKey: 'key',
      model: 'gpt-4o',
      isLocalTrusted: false,
    });

    // After the dynamic imports resolve and AgentLoop is created, abort should work
    // We need to wait a tick for the imports to resolve
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
      });
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('网络错误');
  });

  it('confirm 流程：onConfirm hook 被调用后 resolveConfirm 返回 true', async () => {
    // Make AgentLoop's run call the onConfirm hook to simulate high-risk tool
    mockRun.mockImplementation(async (_input: any) => {
      if (state.capturedHooks?.onConfirm) {
        const confirmed = await state.capturedHooks.onConfirm({
          toolName: 'tabs_close',
          params: { tabId: 1 },
          affectedObjects: [{ type: 'tab', id: '1', title: 'Test', url: 'https://test.com', reason: '关闭标签页' }],
          warnings: ['关闭标签页可能导致未保存数据丢失'],
        });
        if (!confirmed) {
          return { finalMessage: '用户取消', toolCalls: [] };
        }
      }
      return { finalMessage: '操作已确认并执行', toolCalls: [] };
    });

    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();
    const onConfirm = vi.fn();
    result.current.setCallbacks({ onMessage, onConfirm });

    // Start the run - it will hit the onConfirm hook inside AgentLoop
    let runPromise: Promise<void>;
    await act(async () => {
      runPromise = result.current.run('conv-1', '关闭标签页', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'key',
        model: 'gpt-4o',
        isLocalTrusted: false,
      });
    });

    // The run should have completed because resolveConfirm was NOT yet called
    // onConfirm callback should have been triggered
    expect(onConfirm).toHaveBeenCalled();
    expect(result.current.status).toBe('waitingConfirmation');
    const confirmReq = onConfirm.mock.calls[0][0];
    expect(confirmReq.toolName).toBe('tabs_close');
    expect(confirmReq.affectedObjects[0].type).toBe('tab');
    expect(confirmReq.warnings[0]).toContain('未保存数据');

    // Now resolve the confirmation
    await act(async () => {
      result.current.resolveConfirm(true);
    });

    // Wait for run to complete
    await act(async () => {
      await runPromise!;
    });

    // Final status should be idle (run completed)
    expect(result.current.status).toBe('idle');
  });

  it('confirm 流程：拒绝后 AgentLoop 收到 false 并返回取消消息', async () => {
    mockRun.mockImplementation(async (_input: any) => {
      if (state.capturedHooks?.onConfirm) {
        const confirmed = await state.capturedHooks.onConfirm({
          toolName: 'tabs_close',
          params: { tabId: 1 },
          affectedObjects: [],
          warnings: [],
        });
        if (!confirmed) {
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
    await act(async () => {
      runPromise = result.current.run('conv-1', '关闭标签页', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'key',
        model: 'gpt-4o',
        isLocalTrusted: false,
      });
    });

    expect(result.current.status).toBe('waitingConfirmation');

    // Reject the confirmation
    await act(async () => {
      result.current.resolveConfirm(false);
    });

    await act(async () => {
      await runPromise!;
    });

    expect(result.current.status).toBe('idle');
  });

  // ── Feature Flag 切换测试 ────────────────────────

  it('FEATURE_FLAGS.useToolLoopAgent=false 时使用 AgentLoop', async () => {
    mockFeatureFlags.useToolLoopAgent = false;

    const { result } = renderHook(() => useAgent());
    result.current.setCallbacks({ onMessage: vi.fn() });

    await act(async () => {
      await result.current.run('conv-1', '你好', {
        id: 'test', name: 'Test', endpoint: 'https://api.test.com', apiKey: 'key',
        model: 'gpt-4o', isLocalTrusted: false,
      });
    });

    const { AgentLoop } = await import('@/agent/agent-loop');
    expect(AgentLoop).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalled();
  });

  it('FEATURE_FLAGS.useToolLoopAgent=true 时使用 ToolLoopAdapter', async () => {
    mockFeatureFlags.useToolLoopAgent = true;

    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();
    result.current.setCallbacks({ onMessage });

    await act(async () => {
      await result.current.run('conv-1', '你好', {
        id: 'test', name: 'Test', endpoint: 'https://api.test.com', apiKey: 'key',
        model: 'gpt-4o', isLocalTrusted: false,
      });
    });

    const { ToolLoopAdapter } = await import('@/agent/tool-loop-adapter');
    expect(ToolLoopAdapter).toHaveBeenCalled();
    expect(mockToolLoopAdapterRun).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('ToolLoopAdapter 使用持久化的单次任务最大执行步数', async () => {
    mockFeatureFlags.useToolLoopAgent = true;
    mockConfigStoreGet.mockImplementation((key: string) => Promise.resolve(
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
    ));
    const { result } = renderHook(() => useAgent());

    await act(async () => {
      await result.current.run('conv-1', '你好', {
        id: 'test', name: 'Test', endpoint: 'https://api.test.com', apiKey: 'key',
        model: 'gpt-4o', isLocalTrusted: false,
      });
    });

    expect(state.capturedToolLoopAdapterArgs[0]?.[5]).toEqual(
      expect.objectContaining({ maxToolRounds: 7 }),
    );
  });

  it('FEATURE_FLAGS.useToolLoopAgent=true 时生成标题并通知 UI', async () => {
    mockFeatureFlags.useToolLoopAgent = true;
    mockGenerateTitle.mockResolvedValue('测试会话标题');
    const { result } = renderHook(() => useAgent());
    const onConversationTitle = vi.fn();
    result.current.setCallbacks({ onConversationTitle });

    await act(async () => {
      await result.current.run('conv-1', '你好', {
        id: 'test', name: 'Test', endpoint: 'https://api.test.com', apiKey: 'key',
        model: 'gpt-4o', isLocalTrusted: false,
      }, 'gpt-4o');
    });

    await waitFor(() => {
      expect(mockGenerateTitle).toHaveBeenCalledWith('conv-1', expect.anything(), 'gpt-4o');
      expect(onConversationTitle).toHaveBeenCalledWith('conv-1', '测试会话标题');
    });
  });

  it('FEATURE_FLAGS.useToolLoopAgent=true 时正确发送 assistant 消息', async () => {
    mockFeatureFlags.useToolLoopAgent = true;
    mockToolLoopAdapterRun.mockResolvedValue({
      finalMessage: '来自 ToolLoopAdapter 的回复',
      toolCalls: [],
    });

    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();
    result.current.setCallbacks({ onMessage });

    await act(async () => {
      await result.current.run('conv-1', '你好', {
        id: 'test', name: 'Test', endpoint: 'https://api.test.com', apiKey: 'key',
        model: 'gpt-4o', isLocalTrusted: false,
      });
    });

    const assistantCalls = onMessage.mock.calls.filter(
      (c: [UIMessage]) => c[0].role === 'assistant',
    );
    expect(assistantCalls.length).toBeGreaterThanOrEqual(1);
    expect(assistantCalls[assistantCalls.length - 1][0].content).toBe('来自 ToolLoopAdapter 的回复');
    expect(assistantCalls[assistantCalls.length - 1][0].status).toBe('complete');
  });

  it('FEATURE_FLAGS.useToolLoopAgent=true 时展示工具调用记录', async () => {
    mockFeatureFlags.useToolLoopAgent = true;
    mockToolLoopAdapterRun.mockResolvedValue({
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
        id: 'test', name: 'Test', endpoint: 'https://api.test.com', apiKey: 'key',
        model: 'gpt-4o', isLocalTrusted: false,
      });
    });

    // 应该有 tool 角色的消息
    const toolCalls = onMessage.mock.calls.filter(
      (c: [UIMessage]) => c[0].role === 'tool',
    );
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(toolCalls[0][0].toolCallDisplay).toBeDefined();
    expect(toolCalls[0][0].toolCallDisplay.name).toBe('tabs_query');

    // tokenUsage 应该被传递
    expect(onTokenUsage).toHaveBeenCalledWith({ prompt: 50, completion: 30 });
  });

  it('FEATURE_FLAGS.useToolLoopAgent=true 时 abort 调用 ToolLoopAdapter.abort', async () => {
    mockFeatureFlags.useToolLoopAgent = true;

    const { result } = renderHook(() => useAgent());
    result.current.setCallbacks({ onMessage: vi.fn() });

    const runPromise = result.current.run('conv-1', '你好', {
      id: 'test', name: 'Test', endpoint: 'https://api.test.com', apiKey: 'key',
      model: 'gpt-4o', isLocalTrusted: false,
    });

    await new Promise((r) => setTimeout(r, 50));

    act(() => {
      result.current.abort();
    });

    await act(async () => {
      await runPromise;
    });

    expect(mockToolLoopAdapterAbort).toHaveBeenCalled();
  });

  it('FEATURE_FLAGS.useToolLoopAgent=true 时 error 处理正常', async () => {
    mockFeatureFlags.useToolLoopAgent = true;
    mockToolLoopAdapterRun.mockRejectedValue(new Error('ToolLoopAdapter 错误'));

    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();
    result.current.setCallbacks({ onMessage });

    await act(async () => {
      await result.current.run('conv-1', '你好', {
        id: 'test', name: 'Test', endpoint: 'https://api.test.com', apiKey: 'key',
        model: 'gpt-4o', isLocalTrusted: false,
      });
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('ToolLoopAdapter 错误');
  });

  it('FEATURE_FLAGS 默认值为 false', () => {
    // 验证每次 beforeEach 后重置为 false
    expect(mockFeatureFlags.useToolLoopAgent).toBe(false);
  });
});
