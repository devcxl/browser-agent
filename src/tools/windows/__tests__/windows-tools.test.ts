import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types';
import { createWindowsTools } from '../index';

function createMockRpc(): IJsonRpcClient {
  return {
    request: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    onRequest: vi.fn(),
    onNotification: vi.fn(),
    offRequest: vi.fn(),
    offNotification: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  };
}

function getTool(name: string, rpc: IJsonRpcClient) {
  return createWindowsTools(rpc).find((t) => t.name === name)!;
}

const mockWindow = {
  id: 9,
  focused: true,
  incognito: false,
  alwaysOnTop: false,
  tabs: [{ id: 1, title: 'Tab', url: 'https://example.com', favIconUrl: 'data:image/svg+xml;base64,AAAA' }],
};

describe('window_list', () => {
  it('提供 windowId 时查询单个窗口并裁剪内嵌标签页', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue(mockWindow);
    const tool = getTool('window_list', rpc);

    const result = await tool.execute({ windowId: 9 });

    expect(rpc.request).toHaveBeenCalledWith('windows.get', { windowId: 9, getInfo: undefined });
    expect((result.data as { tabs: Array<Record<string, unknown>> }).tabs[0].favIconUrl).toBeUndefined();
  });

  it('未提供 windowId 时列出所有窗口', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue([mockWindow]);
    const tool = getTool('window_list', rpc);

    await tool.execute({ getInfo: { populate: true } });

    expect(rpc.request).toHaveBeenCalledWith('windows.getAll', {
      getInfo: { populate: true },
    });
  });
});

describe('window_new', () => {
  it('调用 windows.create 并传入 createData', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue(mockWindow);
    const tool = getTool('window_new', rpc);

    await tool.execute({ url: 'https://example.com', focused: false, incognito: true });

    expect(rpc.request).toHaveBeenCalledWith('windows.create', {
      createData: { url: 'https://example.com', focused: false, incognito: true, state: undefined, left: undefined, top: undefined, width: undefined, height: undefined },
    });
  });

  it('创建窗口为高风险需确认', () => {
    const tool = getTool('window_new', createMockRpc());
    expect(tool.riskLevel).toBe('high');
    expect(tool.confirmationRequired).toBe(true);
  });
});

describe('window_focus', () => {
  it('调用 windows.update 聚焦指定窗口', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue(mockWindow);
    const tool = getTool('window_focus', rpc);

    await tool.execute({ windowId: 9 });

    expect(rpc.request).toHaveBeenCalledWith('windows.update', {
      windowId: 9,
      updateInfo: { focused: true, drawAttention: undefined },
    });
  });
});

describe('window_close', () => {
  it('preflight 列出将被关闭的标签页和窗口', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request)
      .mockResolvedValueOnce([{ id: 1, title: 'Tab 1', url: 'https://example.com' }])
      .mockResolvedValueOnce({ id: 9, title: 'Window 9' });
    const tool = getTool('window_close', rpc);

    const preflight = await tool.preflight!({ windowId: 9 });

    expect(preflight.affectedObjects).toEqual([
      { type: 'tab', id: '1', title: 'Tab 1', url: 'https://example.com', reason: 'will be closed' },
      { type: 'window', id: '9', title: 'Window 9', reason: 'will be removed' },
    ]);
  });

  it('执行时调用 windows.remove', async () => {
    const rpc = createMockRpc();
    const tool = getTool('window_close', rpc);

    await tool.execute({ windowId: 9 });

    expect(rpc.request).toHaveBeenCalledWith('windows.remove', { windowId: 9 });
  });
});

describe('createWindowsTools', () => {
  it('暴露 4 个动词型工具，不再暴露旧工具', () => {
    const names = createWindowsTools(createMockRpc()).map((t) => t.name);
    expect(names).toEqual(['window_list', 'window_new', 'window_focus', 'window_close']);
    for (const retired of ['windows_getAll', 'windows_get', 'windows_create', 'windows_remove']) {
      expect(names).not.toContain(retired);
    }
  });
});
