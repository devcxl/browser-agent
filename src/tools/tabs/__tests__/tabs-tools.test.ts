import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types';
import { createTabsTools } from '../index';
import {
  createTabSearchTool,
  createTabOpenTool,
  createTabNavigateTool,
  createTabFocusTool,
  createTabSetTool,
  createTabCloseTool,
} from '../tabs-tools';

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

const mockTab = {
  id: 7,
  title: '示例页',
  url: 'https://example.com',
  active: true,
  windowId: 1,
  favIconUrl: 'data:image/svg+xml;base64,AAAA',
};

function getTool(name: string, rpc: IJsonRpcClient) {
  return createTabsTools(rpc).find((t) => t.name === name)!;
}

describe('tab_search', () => {
  it('提供 tabId 时走 tabs.get 并返回单个标签页', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue(mockTab);
    const tool = getTool('tab_search', rpc);

    const result = await tool.execute({ tabId: 7 });

    expect(rpc.request).toHaveBeenCalledWith('tabs.get', { tabId: 7 });
    expect(result.success).toBe(true);
    // 图标字段被剔除
    expect((result.data as Record<string, unknown>).favIconUrl).toBeUndefined();
    expect((result.data as Record<string, unknown>).title).toBe('示例页');
  });

  it('无条件时默认查询当前窗口', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue([mockTab]);
    const tool = getTool('tab_search', rpc);

    await tool.execute({});

    expect(rpc.request).toHaveBeenCalledWith('tabs.query', {
      queryInfo: { currentWindow: true },
    });
  });

  it('按关键词对标题和 URL 做包含匹配', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue([
      { id: 1, title: 'GitHub Repo', url: 'https://github.com' },
      { id: 2, title: '示例', url: 'https://example.com/github-mirror' },
      { id: 3, title: '无关页', url: 'https://news.com' },
    ]);
    const tool = getTool('tab_search', rpc);

    const result = await tool.execute({ keyword: 'GITHUB' });

    expect((result.data as Array<Record<string, unknown>>).map((t) => t.id)).toEqual([1, 2]);
  });

  it('按 URL 子串筛选', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue([
      { id: 1, title: 'a', url: 'https://github.com/x' },
      { id: 2, title: 'b', url: 'https://example.com' },
    ]);
    const tool = getTool('tab_search', rpc);

    const result = await tool.execute({ url: 'github.com' });
    expect((result.data as Array<Record<string, unknown>>).map((t) => t.id)).toEqual([1]);
  });

  it('active: true 用于定位当前展示的标签页', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue([mockTab]);
    const tool = getTool('tab_search', rpc);

    await tool.execute({ active: true });

    expect(rpc.request).toHaveBeenCalledWith('tabs.query', {
      queryInfo: { active: true },
    });
  });

  it('RPC 失败返回错误结果', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockRejectedValue(new Error('RPC failed'));
    const tool = getTool('tab_search', rpc);
    expect(await tool.execute({ tabId: 1 })).toEqual({ success: false, error: 'RPC failed' });
  });
});

describe('tab_open', () => {
  it('调用 tabs.create 并返回裁剪后的标签页', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue(mockTab);
    const tool = getTool('tab_open', rpc);

    const result = await tool.execute({ url: 'https://example.com', active: false, pinned: true });

    expect(rpc.request).toHaveBeenCalledWith('tabs.create', {
      createProperties: { url: 'https://example.com', active: false, pinned: true, windowId: undefined, index: undefined },
    });
    expect((result.data as Record<string, unknown>).favIconUrl).toBeUndefined();
  });

  it('url 必填', () => {
    const tool = getTool('tab_open', createMockRpc());
    expect(tool.schema.required).toEqual(['url']);
  });
});

describe('tab_navigate', () => {
  it('缺省 tabId 时先定位当前标签页再跳转', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request)
      .mockResolvedValueOnce([{ ...mockTab, id: 7 }])
      .mockResolvedValueOnce({ ...mockTab, url: 'https://next.com' });
    const tool = getTool('tab_navigate', rpc);

    await tool.execute({ url: 'https://next.com' });

    expect(rpc.request).toHaveBeenNthCalledWith(1, 'tabs.query', {
      queryInfo: { active: true, currentWindow: true },
    });
    expect(rpc.request).toHaveBeenNthCalledWith(2, 'tabs.update', {
      tabId: 7,
      updateProperties: { url: 'https://next.com' },
    });
  });

  it('无法确定当前标签页时返回错误', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValueOnce([]);
    const tool = getTool('tab_navigate', rpc);

    const result = await tool.execute({ url: 'https://next.com' });
    expect(result.success).toBe(false);
  });
});

describe('tab_focus', () => {
  it('激活指定标签页', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue(mockTab);
    const tool = getTool('tab_focus', rpc);

    await tool.execute({ tabId: 7 });

    expect(rpc.request).toHaveBeenCalledWith('tabs.update', {
      tabId: 7,
      updateProperties: { active: true },
    });
  });
});

describe('tab_set', () => {
  it('设置 pinned', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue({ ...mockTab, pinned: true });
    const tool = getTool('tab_set', rpc);

    await tool.execute({ tabId: 7, pinned: true });

    expect(rpc.request).toHaveBeenCalledWith('tabs.update', {
      tabId: 7,
      updateProperties: { pinned: true },
    });
  });

  it('设置 index 时走 tabs.move 并返回移动后的标签页', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue([{ ...mockTab, index: 2 }]);
    const tool = getTool('tab_set', rpc);

    const result = await tool.execute({ tabId: 7, index: 2 });

    expect(rpc.request).toHaveBeenCalledWith('tabs.move', {
      tabIds: [7],
      moveProperties: { index: 2, windowId: undefined },
    });
    expect((result.data as Record<string, unknown>).index).toBe(2);
  });

  it('未提供任何要修改的字段时返回错误', async () => {
    const tool = getTool('tab_set', createMockRpc());
    const result = await tool.execute({ tabId: 7 });
    expect(result.success).toBe(false);
  });
});

describe('tab_close', () => {
  it('preflight 返回受影响标签页清单，批量时给出警告', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockImplementation((_method: string, params: Record<string, unknown>) =>
      Promise.resolve({ id: params.tabId, title: `Tab ${params.tabId}`, url: 'https://example.com' }));
    const tool = getTool('tab_close', rpc);

    const preflight = await tool.preflight!({ tabIds: [1, 2, 3, 4, 5, 6] });

    expect(preflight.affectedObjects).toHaveLength(6);
    expect(preflight.warnings).toContain('正在批量关闭 6 个标签页，请确认操作。');
  });

  it('执行时调用 tabs.remove', async () => {
    const rpc = createMockRpc();
    const tool = getTool('tab_close', rpc);

    await tool.execute({ tabIds: [1, 2] });

    expect(rpc.request).toHaveBeenCalledWith('tabs.remove', { tabIds: [1, 2] });
  });
});

describe('createTabsTools', () => {
  it('暴露 6 个动词型工具，不再暴露旧工具', () => {
    const rpc = createMockRpc();
    const names = createTabsTools(rpc).map((t) => t.name);
    expect(names).toEqual(['tab_search', 'tab_open', 'tab_navigate', 'tab_focus', 'tab_set', 'tab_close']);
    for (const retired of ['tabs_query', 'tabs_current', 'tabs_manage', 'tabs_remove']) {
      expect(names).not.toContain(retired);
    }
  });
});

// 保留对单个工厂的元数据断言（抽样）
describe('tool metadata', () => {
  it('tab_search 低风险免确认；tab_close 高风险需确认', () => {
    const rpc = createMockRpc();
    const search = createTabSearchTool(rpc);
    const close = createTabCloseTool(rpc);
    expect(search.riskLevel).toBe('low');
    expect(search.confirmationRequired).toBe(false);
    expect(close.riskLevel).toBe('high');
    expect(close.confirmationRequired).toBe(true);
    expect(close.preflight).toBeTypeOf('function');
  });

  it('tab_open / tab_navigate / tab_focus / tab_set 类别均为 tabs', () => {
    const rpc = createMockRpc();
    expect(createTabOpenTool(rpc).category).toBe('tabs');
    expect(createTabNavigateTool(rpc).category).toBe('tabs');
    expect(createTabFocusTool(rpc).category).toBe('tabs');
    expect(createTabSetTool(rpc).category).toBe('tabs');
  });
});
