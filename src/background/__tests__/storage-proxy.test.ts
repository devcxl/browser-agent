import { describe, it, expect, vi } from 'vitest';
import { StorageProxy } from '../proxies/storage-proxy';
import type { IBrowserAdapter } from '@/adapters/types';

function createMockAdapter(): IBrowserAdapter {
  return {
    browserType: 'chrome',
    tabs: {} as any,
    windows: {} as any,
    tabGroups: {} as any,
    history: {} as any,
    notifications: {} as any,
    bookmarks: {} as any,
    downloads: {} as any,
    cookies: {} as any,
    sessions: {} as any,
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ key1: 'value1', key2: 'value2' }),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
    clipboard: {} as any,
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('StorageProxy', () => {
  it('get should delegate to adapter.storage.local.get', async () => {
    const adapter = createMockAdapter();
    const proxy = new StorageProxy(adapter);

    const result = await proxy.get({ keys: ['key1', 'key2'] });

    expect(adapter.storage.local.get).toHaveBeenCalledWith(['key1', 'key2']);
    expect(result).toEqual({ key1: 'value1', key2: 'value2' });
  });

  it('get without keys should pass undefined', async () => {
    const adapter = createMockAdapter();
    const proxy = new StorageProxy(adapter);

    await proxy.get({});

    expect(adapter.storage.local.get).toHaveBeenCalledWith(undefined);
  });

  it('set should delegate to adapter.storage.local.set', async () => {
    const adapter = createMockAdapter();
    const proxy = new StorageProxy(adapter);

    const result = await proxy.set({ items: { foo: 'bar' } });

    expect(adapter.storage.local.set).toHaveBeenCalledWith({ foo: 'bar' });
    expect(result).toEqual({ success: true });
  });

  it('remove should delegate to adapter.storage.local.remove', async () => {
    const adapter = createMockAdapter();
    const proxy = new StorageProxy(adapter);

    const result = await proxy.remove({ keys: ['key1'] });

    expect(adapter.storage.local.remove).toHaveBeenCalledWith(['key1']);
    expect(result).toEqual({ success: true });
  });

  it('remove without keys should pass empty array', async () => {
    const adapter = createMockAdapter();
    const proxy = new StorageProxy(adapter);

    await proxy.remove({});

    expect(adapter.storage.local.remove).toHaveBeenCalledWith([]);
  });
});
