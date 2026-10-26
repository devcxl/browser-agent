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

describe('错误分支', () => {
  it('group_update 失败返回错误（Error 与非 Error 两种形态）', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockRejectedValueOnce(new Error('update failed'))
      .mockRejectedValueOnce('plain string failure');
    const tool = getTool('group_update', rpc);
    expect(await tool.execute({ groupId: 12, collapsed: true })).toEqual({ success: false, error: 'update failed' });
    expect(await tool.execute({ groupId: 12, collapsed: true })).toEqual({ success: false, error: 'Unknown error' });
  });

  it('group_assign 移出分组失败返回错误', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockRejectedValueOnce(new Error('ungroup failed'));
    const tool = getTool('group_assign', rpc);
    expect(await tool.execute({ tabIds: [1] })).toEqual({ success: false, error: 'ungroup failed' });
  });

  it('group_create 二次更新标题失败时整体返回错误', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockResolvedValueOnce(12)
      .mockRejectedValueOnce(new Error('rename failed'));
    const tool = getTool('group_create', rpc);
    expect(await tool.execute({ tabIds: [1], title: '工作' })).toEqual({ success: false, error: 'rename failed' });
  });

  it('group_list 失败返回错误', async () => {
    const rpc = createMockRpc();
    vi.mocked(rpc.request).mockRejectedValueOnce(new Error('query failed'));
    const tool = getTool('group_list', rpc);
    expect(await tool.execute({})).toEqual({ success: false, error: 'query failed' });
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
const SAMPLE_PARAMS: Record<string, Record<string, unknown>> = {"group_list": {}, "group_create": {"tabIds": [1]}, "group_update": {"groupId": 1}, "group_assign": {"tabIds": [1]}};

describe('tabgroups 全工具异常归一化', () => {
  it('每个工具执行异常都返回失败结果（Error 与非 Error 两侧）', async () => {
    const rpc = createMockRpc();
    const tools = createTabGroupsTools(rpc);
    for (const tool of tools) {
      for (const rejection of [new Error('E1'), 'E2-string']) {
        vi.mocked(rpc.request).mockRejectedValue(rejection);
        const result = await tool.execute(SAMPLE_PARAMS[tool.name] ?? {});
        expect(result.success).toBe(false);
      }
    }
  });
});
