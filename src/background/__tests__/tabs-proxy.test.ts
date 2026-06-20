import { describe, it, expect, vi } from 'vitest';
import { TabsProxy } from '../proxies/tabs-proxy';
import type { IBrowserAdapter } from '@/adapters/types';

function createMockAdapter(): IBrowserAdapter {
  return {
    browserType: 'chrome',
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 1, title: 'tab1', index: 0, windowId: 1, groupId: -1, active: true, pinned: false, discarded: false, incognito: false }]),
      get: vi.fn().mockResolvedValue({ id: 1, title: 'tab1', index: 0, windowId: 1, groupId: -1, active: true, pinned: false, discarded: false, incognito: false }),
      create: vi.fn().mockResolvedValue({ id: 1, title: 'new tab', index: 0, windowId: 1, groupId: -1, active: true, pinned: false, discarded: false, incognito: false }),
      update: vi.fn().mockResolvedValue({ id: 1, title: 'updated', index: 0, windowId: 1, groupId: -1, active: true, pinned: false, discarded: false, incognito: false }),
      remove: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue([{ id: 1, index: 0, windowId: 2, groupId: -1, active: true, pinned: false, discarded: false, incognito: false }]),
      group: vi.fn().mockResolvedValue(42),
      ungroup: vi.fn().mockResolvedValue(undefined),
      getCurrent: vi.fn(),
      reload: vi.fn(),
      duplicate: vi.fn(),
      highlight: vi.fn(),
    },
    windows: {} as any,
    tabGroups: {} as any,
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('TabsProxy', () => {
  it('query should delegate to adapter.tabs.query', async () => {
    const adapter = createMockAdapter();
    const proxy = new TabsProxy(adapter);

    const result = await proxy.query({ queryInfo: { active: true } });

    expect(adapter.tabs.query).toHaveBeenCalledWith({ active: true });
    expect(result).toHaveLength(1);
  });

  it('get should delegate to adapter.tabs.get', async () => {
    const adapter = createMockAdapter();
    const proxy = new TabsProxy(adapter);

    const result = await proxy.get({ tabId: 1 });

    expect(adapter.tabs.get).toHaveBeenCalledWith(1);
    expect(result.id).toBe(1);
  });

  it('create should delegate to adapter.tabs.create', async () => {
    const adapter = createMockAdapter();
    const proxy = new TabsProxy(adapter);

    const result = await proxy.create({ createProperties: { url: 'https://example.com' } });

    expect(adapter.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com' });
    expect(result.id).toBe(1);
  });

  it('update should delegate to adapter.tabs.update', async () => {
    const adapter = createMockAdapter();
    const proxy = new TabsProxy(adapter);

    const result = await proxy.update({ tabId: 1, updateProperties: { active: true } });

    expect(adapter.tabs.update).toHaveBeenCalledWith(1, { active: true });
    expect(result.title).toBe('updated');
  });

  it('remove should delegate to adapter.tabs.remove and return removedCount', async () => {
    const adapter = createMockAdapter();
    const proxy = new TabsProxy(adapter);

    const result = await proxy.remove({ tabIds: [1, 2, 3] });

    expect(adapter.tabs.remove).toHaveBeenCalledWith([1, 2, 3]);
    expect(result).toEqual({ removedCount: 3 });
  });

  it('move should delegate to adapter.tabs.move', async () => {
    const adapter = createMockAdapter();
    const proxy = new TabsProxy(adapter);

    await proxy.move({ tabIds: [1], moveProperties: { windowId: 2, index: 0 } });

    expect(adapter.tabs.move).toHaveBeenCalledWith([1], { windowId: 2, index: 0 });
  });

  it('group should delegate to adapter.tabs.group and return groupId', async () => {
    const adapter = createMockAdapter();
    const proxy = new TabsProxy(adapter);

    const result = await proxy.group({ tabIds: [1, 2] });

    expect(adapter.tabs.group).toHaveBeenCalledWith({ tabIds: [1, 2] });
    expect(result).toEqual({ groupId: 42 });
  });

  it('ungroup should delegate to adapter.tabs.ungroup', async () => {
    const adapter = createMockAdapter();
    const proxy = new TabsProxy(adapter);

    await proxy.ungroup({ tabIds: [1] });

    expect(adapter.tabs.ungroup).toHaveBeenCalledWith([1]);
  });
});
