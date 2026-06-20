import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ToolCallRecord } from '@/shared/types/agent';

// Mock AgentLoop module - capture hooks passed to constructor
let capturedHooks: any = null;
const mockRun = vi.fn();
const mockAbort = vi.fn();
vi.mock('@/agent/agent-loop', () => ({
  AgentLoop: vi.fn().mockImplementation((...args: any[]) => {
    capturedHooks = args[5]; // hooks is 6th constructor arg
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

import { useAgent } from '../useAgent';
import type { UIMessage, ConfirmRequest } from '../../types';

describe('useAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedHooks = null;
    mockRun.mockReset();
    mockRun.mockResolvedValue({ finalMessage: '完成', toolCalls: [] });
    mockAbort.mockReset();
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

  it('requestConfirm 设置状态为 waitingConfirmation', () => {
    const { result } = renderHook(() => useAgent());
    const onConfirm = vi.fn();
    result.current.setCallbacks({ onConfirm });

    act(() => {
      result.current.requestConfirm({
        toolName: 'tabs_close',
        params: { tabId: 1 },
        affectedObjects: [],
        warnings: [],
      });
    });

    expect(result.current.status).toBe('waitingConfirmation');
    expect(onConfirm).toHaveBeenCalled();
  });

  it('resumeAfterConfirm 恢复状态为 streaming', () => {
    const { result } = renderHook(() => useAgent());

    act(() => {
      result.current.resumeAfterConfirm();
    });

    expect(result.current.status).toBe('streaming');
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
    mockRun.mockImplementation(async (input: any) => {
      if (capturedHooks?.onConfirm) {
        const confirmed = await capturedHooks.onConfirm({
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
    mockRun.mockImplementation(async (input: any) => {
      if (capturedHooks?.onConfirm) {
        const confirmed = await capturedHooks.onConfirm({
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
});
