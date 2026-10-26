import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types';
import { createTabGroupsTools } from '../index';

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
  return createTabGroupsTools(rpc).find((t) => t.name === name)!;
}

describe('group_list', () => {
  it('按条件查询标签分组', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue([{ id: 3, color: 'blue', title: '工作' }]);
    const tool = getTool('group_list', rpc);

    const result = await tool.execute({ color: 'blue' });

    expect(rpc.request).toHaveBeenCalledWith('tabGroups.query', { queryInfo: { color: 'blue' } });
    expect(result.success).toBe(true);
  });
});

describe('group_create', () => {
  it('用 tabIds 创建分组并设置标题和颜色', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValueOnce(12); // tabs.group → groupId
    const tool = getTool('group_create', rpc);

    const result = await tool.execute({ tabIds: [1, 2], title: '工作', color: 'blue' });

    expect(rpc.request).toHaveBeenNthCalledWith(1, 'tabs.group', {
      tabIds: [1, 2],
      createProperties: { windowId: undefined },
    });
    expect(rpc.request).toHaveBeenNthCalledWith(2, 'tabGroups.update', {
      groupId: 12,
      updateProperties: { title: '工作', color: 'blue' },
    });
    expect(result.data).toEqual({ groupId: 12, tabIds: [1, 2] });
  });

  it('不设置标题/颜色时不做二次更新', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValueOnce(12);
    const tool = getTool('group_create', rpc);

    await tool.execute({ tabIds: [1] });

    expect(rpc.request).toHaveBeenCalledTimes(1);
  });

  it('创建分组失败时返回错误', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockRejectedValue(new Error('RPC failed'));
    const tool = getTool('group_create', rpc);

    const result = await tool.execute({ tabIds: [1] });
    expect(result).toEqual({ success: false, error: 'RPC failed' });
  });
});

describe('group_update', () => {
  it('更新分组属性', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValue({ id: 12, collapsed: true });
    const tool = getTool('group_update', rpc);

    await tool.execute({ groupId: 12, collapsed: true });

    expect(rpc.request).toHaveBeenCalledWith('tabGroups.update', {
      groupId: 12,
      updateProperties: { title: undefined, color: undefined, collapsed: true },
    });
  });
});

describe('group_assign', () => {
  it('提供 groupId 时把标签页加入分组', async () => {
    const rpc = createMockRpc();
    const tool = getTool('group_assign', rpc);

    const result = await tool.execute({ tabIds: [1, 2], groupId: 12 });

    expect(rpc.request).toHaveBeenCalledWith('tabs.group', { tabIds: [1, 2], groupId: 12 });
    expect(result.data).toEqual({ groupId: 12, tabIds: [1, 2] });
  });

  it('缺省 groupId 时移出分组', async () => {
    const rpc = createMockRpc();
    const tool = getTool('group_assign', rpc);

    const result = await tool.execute({ tabIds: [1, 2] });

    expect(rpc.request).toHaveBeenCalledWith('tabs.ungroup', { tabIds: [1, 2] });
    expect(result.data).toEqual({ ungrouped: [1, 2] });
  });
});

describe('createTabGroupsTools', () => {
  it('暴露 4 个动词型工具，不再暴露旧工具', () => {
    const names = createTabGroupsTools(createMockRpc()).map((t) => t.name);
    expect(names).toEqual(['group_list', 'group_create', 'group_update', 'group_assign']);
    for (const retired of ['tabGroups_query', 'tabGroups_update']) {
      expect(names).not.toContain(retired);
    }
  });
});
