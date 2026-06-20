import { describe, it, expect, vi } from 'vitest';
import { GroupsProxy } from '../proxies/groups-proxy';
import type { IBrowserAdapter } from '@/adapters/types';

function createMockAdapter(): IBrowserAdapter {
  return {
    browserType: 'chrome',
    tabGroups: {
      query: vi.fn().mockResolvedValue([{ id: 1, collapsed: false, color: 'blue', windowId: 1 }]),
      get: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: 1, collapsed: true, color: 'red', windowId: 1 }),
      move: vi.fn(),
    },
    tabs: {} as any,
    windows: {} as any,
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('GroupsProxy', () => {
  it('query should delegate to adapter.tabGroups.query', async () => {
    const adapter = createMockAdapter();
    const proxy = new GroupsProxy(adapter);

    const result = await proxy.query({ queryInfo: {} });

    expect(adapter.tabGroups.query).toHaveBeenCalledWith({});
    expect(result).toHaveLength(1);
  });

  it('update should delegate to adapter.tabGroups.update', async () => {
    const adapter = createMockAdapter();
    const proxy = new GroupsProxy(adapter);

    const result = await proxy.update({ groupId: 1, updateProperties: { collapsed: true } });

    expect(adapter.tabGroups.update).toHaveBeenCalledWith(1, { collapsed: true });
    expect(result.collapsed).toBe(true);
  });
});
