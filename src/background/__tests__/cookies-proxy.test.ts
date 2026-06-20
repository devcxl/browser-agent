import { describe, it, expect, vi } from 'vitest';
import { CookiesProxy } from '../proxies/cookies-proxy';
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
    cookies: {
      get: vi.fn().mockResolvedValue({ name: 'session', value: 'abc', domain: 'test.com', path: '/' }),
      getAll: vi.fn().mockResolvedValue([{ name: 'c1', value: 'v1', domain: 'test.com', path: '/' }]),
      set: vi.fn().mockResolvedValue({ name: 'new', value: 'val', domain: 'test.com', path: '/' }),
      remove: vi.fn().mockResolvedValue({ url: 'https://test.com', name: 'old' }),
      getAllCookieStores: vi.fn().mockResolvedValue([{ id: '0', tabIds: [1] }]),
    },
    sessions: {} as any,
    storage: {} as any,
    clipboard: {} as any,
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('CookiesProxy', () => {
  it('get should delegate to adapter.cookies.get', async () => {
    const adapter = createMockAdapter();
    const proxy = new CookiesProxy(adapter);

    const result = await proxy.get({ url: 'https://test.com', name: 'session' });

    expect(adapter.cookies.get).toHaveBeenCalledWith({ url: 'https://test.com', name: 'session' });
    expect(result?.name).toBe('session');
  });

  it('getAll should delegate to adapter.cookies.getAll', async () => {
    const adapter = createMockAdapter();
    const proxy = new CookiesProxy(adapter);

    const result = await proxy.getAll({ domain: 'test.com' });

    expect(adapter.cookies.getAll).toHaveBeenCalledWith({ domain: 'test.com' });
    expect(result).toHaveLength(1);
  });

  it('set should delegate to adapter.cookies.set', async () => {
    const adapter = createMockAdapter();
    const proxy = new CookiesProxy(adapter);

    const result = await proxy.set({ url: 'https://test.com', name: 'new', value: 'val' });

    expect(adapter.cookies.set).toHaveBeenCalledWith({ url: 'https://test.com', name: 'new', value: 'val' });
    expect(result?.name).toBe('new');
  });

  it('remove should delegate to adapter.cookies.remove', async () => {
    const adapter = createMockAdapter();
    const proxy = new CookiesProxy(adapter);

    const result = await proxy.remove({ url: 'https://test.com', name: 'old' });

    expect(adapter.cookies.remove).toHaveBeenCalledWith({ url: 'https://test.com', name: 'old' });
    expect(result).toEqual({ url: 'https://test.com', name: 'old' });
  });

  it('getAllCookieStores should delegate to adapter.cookies.getAllCookieStores', async () => {
    const adapter = createMockAdapter();
    const proxy = new CookiesProxy(adapter);

    const result = await proxy.getAllCookieStores();

    expect(adapter.cookies.getAllCookieStores).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });
});
