import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// vi.hoisted: 确保 mock 对象在 vi.mock 提升前初始化
const { mockRun, mockAbort, mockGenerateTitle, mockConfigStoreGet, mockRpcRequest, state } =
  vi.hoisted(() => ({
    mockRun: vi.fn(),
    mockAbort: vi.fn(),
    mockGenerateTitle: vi.fn(),
    mockConfigStoreGet: vi.fn(),
    mockRpcRequest: vi.fn(),
    state: {
      capturedApprovalFn: null as any,
      capturedAdapterArgs: [] as any[][],
      capturedPageExecuteFn: null as any,
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
    unregisterCategory: vi.fn(),
    getToolsByCategory: vi.fn().mockReturnValue([]),
  })),
}));
vi.mock('@/shared/jsonrpc/client', () => ({
  JsonRpcClient: vi.fn().mockImplementation(() => ({
    request: mockRpcRequest,
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
  createPageTools: vi.fn().mockImplementation((executeFn: unknown) => {
    state.capturedPageExecuteFn = executeFn;
    return [];
  }),
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
import type { ConfirmRequest, UIMessage } from '../../types';

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
    mockRpcRequest.mockReset();
  });

  it('初始状态为 idle', () => {
    const { result } = renderHook(() => useAgent());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.lastRunOutcome).toBeNull();
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
        models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    const { ToolLoopAdapter } = await import('@/agent/tool-loop-adapter');
    expect(ToolLoopAdapter).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.lastRunOutcome).toBe('complete');
  });

  it('将持久化的 Jev 设置传给工具路由适配器', async () => {
    const jevSettings = { enabled: true, apiKey: 'ts-test-key' };
    mockConfigStoreGet.mockImplementation((key: string) => Promise.resolve(
      key === 'jevSettings' ? jevSettings : { maxToolRounds: 99 },
    ));
    const { result } = renderHook(() => useAgent());

    await act(async () => {
      await result.current.run('conv-1', 'Review my recent activity.', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'chat-key',
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    expect(state.capturedAdapterArgs[0]?.[7]).toEqual(jevSettings);
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
        models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    const userCalls = onMessage.mock.calls.filter(
      (c: unknown[]) => (c[0] as UIMessage).role === 'user',
    );
    const assistantCalls = onMessage.mock.calls.filter(
      (c: unknown[]) => (c[0] as UIMessage).role === 'assistant',
    );

    expect(userCalls.length).toBeGreaterThanOrEqual(1);
    expect(userCalls[0]![0].content).toBe('测试消息');
    expect(assistantCalls.length).toBeGreaterThanOrEqual(1);
    expect(assistantCalls[assistantCalls.length - 1]![0].status).toBe('complete');
  });

  it('onMessage 回调带上报消息所属的会话（归属不能依赖“当前查看的会话”）', async () => {
    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();

    result.current.setCallbacks({ onMessage });

    await act(async () => {
      await result.current.run('conv-42', '测试消息', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'key',
        models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    expect(onMessage.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const call of onMessage.mock.calls) {
      expect(call[1]).toBe('conv-42');
    }
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
          models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
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
      models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
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

  it('AbortError 结束时记录 abort 结果，供悬浮球跳过庆祝', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    mockRun.mockRejectedValue(abortError);

    const { result } = renderHook(() => useAgent());
    result.current.setCallbacks({ onMessage: vi.fn() });

    await act(async () => {
      await result.current.run('conv-1', '你好', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'key',
        models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.lastRunOutcome).toBe('abort');
    expect(result.current.error).toBeNull();
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
        models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('网络错误');
    expect(result.current.lastRunOutcome).toBe('error');
  });

  it('confirm 流程：onRequestApproval 被调用后 resolveConfirm(true) 返回 approve', async () => {
    mockRun.mockImplementation(async () => {
      if (state.capturedApprovalFn) {
        const decision = await state.capturedApprovalFn({
          toolName: 'tabs_close',
          params: { tabId: 1 },
          affectedObjects: [{ type: 'tab', id: '1', title: 'Test', url: 'https://test.com', reason: '关闭标签页' }],
          reason: '关闭标签页可能导致未保存数据丢失',
          riskLevel: 'high',
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
        models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
      expect(result.current.status).toBe('waitingConfirmation');
    });

    const confirmReq = onConfirm.mock.calls[0]![0] as ConfirmRequest;
    expect(confirmReq.toolName).toBe('tabs_close');
    expect(confirmReq.affectedObjects[0]!.type).toBe('tab');
    expect(confirmReq.warnings[0]!).toContain('未保存数据');

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
          reason: '',
          riskLevel: 'high',
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
        models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
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
              contextWindowTokens: 128000,
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
        models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
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
        models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    const toolCalls = onMessage.mock.calls.filter(
      (c: unknown[]) => (c[0] as UIMessage).role === 'tool',
    );
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(toolCalls[0]![0].toolCallDisplay).toBeDefined();
    expect(toolCalls[0]![0].toolCallDisplay.name).toBe('tabs_query');

    expect(onTokenUsage).toHaveBeenCalledWith({ prompt: 50, completion: 30 });
  });

  it('结果缺失的工具记录映射为 unknown，不伪造成功或失败', async () => {
    mockRun.mockResolvedValue({
      finalMessage: '操作完成',
      toolCalls: [
        {
          toolName: 'tabs_remove',
          params: { tabIds: [1] },
          riskLevel: 'low' as const,
          confirmed: true,
          timestamp: Date.now(),
          toolCallId: 'call-unknown',
        },
      ],
    });

    const { result } = renderHook(() => useAgent());
    const onMessage = vi.fn();
    result.current.setCallbacks({ onMessage });

    await act(async () => {
      await result.current.run('conv-1', '删除这个标签页', {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.test.com',
        apiKey: 'key',
        models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
        isLocalTrusted: false,
      }, 'gpt-4o');
    });

    const toolMessages = onMessage.mock.calls.filter(
      (c: unknown[]) => (c[0] as UIMessage).role === 'tool',
    );
    expect(toolMessages).toHaveLength(1);
    expect(toolMessages[0]![0].toolCallDisplay).toEqual(expect.objectContaining({
      name: 'tabs_remove',
      status: 'unknown',
      result: undefined,
    }));
  });

  it('页面工具在 content.execute 失败时返回结构化错误而不抛出', async () => {
    const provider = {
      id: 'test',
      name: 'Test',
      endpoint: 'https://api.test.com',
      apiKey: 'key',
      models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
      isLocalTrusted: false,
    };

    const { result } = renderHook(() => useAgent());
    await act(async () => {
      await result.current.run('conv-1', '读取页面内容', provider, 'gpt-4o');
    });

    const executeFn = state.capturedPageExecuteFn;
    expect(typeof executeFn).toBe('function');

    // 端口断开 / 内容脚本缺失：RPC 拒绝应被包装为失败结果，而不是抛给调用方
    mockRpcRequest.mockRejectedValueOnce(new Error('Port disconnected'));
    await expect(executeFn({ action: 'page_getContent' })).resolves.toEqual({
      success: false,
      error: 'Port disconnected',
    });
    expect(mockRpcRequest).toHaveBeenCalledWith('content.execute', { action: 'page_getContent' });

    // 非 Error 抛出（如字符串）：使用兜底文案
    mockRpcRequest.mockRejectedValueOnce('No tab with id: 42');
    await expect(executeFn({ action: 'page_getContent' })).resolves.toEqual({
      success: false,
      error: '页面脚本不可达或通信失败',
    });

    // 正常路径保持原有成功结构
    mockRpcRequest.mockResolvedValueOnce({ text: '页面正文' });
    await expect(executeFn({ action: 'page_getContent' })).resolves.toEqual({
      success: true,
      data: { text: '页面正文' },
    });
  });

  it('工具执行期间状态为 running，供头像映射为 working', async () => {
    const provider = {
      id: 'test',
      name: 'Test',
      endpoint: 'https://api.test.com',
      apiKey: 'key',
      models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
      isLocalTrusted: false,
    };
    const record = {
      toolName: 'tabs_query',
      params: {},
      result: { success: true, data: [] },
      riskLevel: 'low' as const,
      confirmed: true,
      timestamp: Date.now(),
      toolCallId: 'call-status',
    };

    let releaseRun: () => void = () => {};
    const runGate = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    mockRun.mockImplementation(async ({ callbacks }: any) => {
      callbacks.onToolCall(record);
      await runGate;
      return { finalMessage: '完成', toolCalls: [record] };
    });

    const { result } = renderHook(() => useAgent());

    let runPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      runPromise = result.current.run('conv-1', '你好', provider, 'gpt-4o');
      // 让工具调用回调先提交，run 本身仍挂起
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(result.current.status).toBe('running');

    releaseRun();
    await act(async () => {
      await runPromise;
    });
  });

  it('用户确认后离开 waitingConfirmation（头像不再停在 listening）', async () => {
    const provider = {
      id: 'test',
      name: 'Test',
      endpoint: 'https://api.test.com',
      apiKey: 'key',
      models: { 'gpt-4o': { id: 'gpt-4o', name: 'gpt-4o' } },
      isLocalTrusted: false,
    };
    let releaseRun: () => void = () => {};
    const runGate = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    mockRun.mockImplementation(async () => {
      await runGate;
      return { finalMessage: '', toolCalls: [] };
    });

    const { result } = renderHook(() => useAgent());

    let runPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      runPromise = result.current.run('conv-1', '你好', provider, 'gpt-4o');
      // 等 run 完成依赖初始化并构造 adapter / 注册审批回调
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    let approval: Promise<'approve' | 'deny'> = Promise.resolve('approve');
    act(() => {
      approval = state.capturedApprovalFn({
        toolName: 'tabs_query',
        params: {},
        affectedObjects: [],
        warnings: [],
      });
    });
    expect(result.current.status).toBe('waitingConfirmation');

    act(() => {
      result.current.resolveConfirm(true);
    });
    expect(result.current.status).toBe('running');
    await expect(approval).resolves.toBe('approve');

    releaseRun();
    await act(async () => {
      await runPromise;
    });
  });
});
