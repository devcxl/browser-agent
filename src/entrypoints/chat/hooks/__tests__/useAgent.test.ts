import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ToolCallRecord } from '@/shared/types/agent';

// Mock AgentLoop module
const mockRun = vi.fn();
const mockAbort = vi.fn();
vi.mock('@/agent/agent-loop', () => ({
  AgentLoop: vi.fn().mockImplementation(() => ({
    run: mockRun,
    abort: mockAbort,
  })),
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
});
