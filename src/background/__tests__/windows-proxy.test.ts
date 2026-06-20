import { describe, it, expect, vi } from 'vitest';
import { WindowsProxy } from '../proxies/windows-proxy';
import type { IBrowserAdapter } from '@/adapters/types';

function createMockAdapter(): IBrowserAdapter {
  return {
    browserType: 'chrome',
    windows: {
      getAll: vi.fn().mockResolvedValue([{ id: 1, focused: true, incognito: false, alwaysOnTop: false }]),
      get: vi.fn().mockResolvedValue({ id: 1, focused: true, incognito: false, alwaysOnTop: false }),
      create: vi.fn().mockResolvedValue({ id: 2, focused: true, incognito: false, alwaysOnTop: false }),
      remove: vi.fn().mockResolvedValue(undefined),
      update: vi.fn(),
      getCurrent: vi.fn(),
      getLastFocused: vi.fn(),
    },
    tabs: {} as any,
    tabGroups: {} as any,
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('WindowsProxy', () => {
  it('getAll should delegate to adapter.windows.getAll', async () => {
    const adapter = createMockAdapter();
    const proxy = new WindowsProxy(adapter);

    const result = await proxy.getAll();

    expect(adapter.windows.getAll).toHaveBeenCalledWith(undefined);
    expect(result).toHaveLength(1);
  });

  it('getAll should pass getInfo', async () => {
    const adapter = createMockAdapter();
    const proxy = new WindowsProxy(adapter);

    await proxy.getAll({ getInfo: { populate: true } });

    expect(adapter.windows.getAll).toHaveBeenCalledWith({ populate: true });
  });

  it('get should delegate to adapter.windows.get', async () => {
    const adapter = createMockAdapter();
    const proxy = new WindowsProxy(adapter);

    const result = await proxy.get({ windowId: 1 });

    expect(adapter.windows.get).toHaveBeenCalledWith(1, undefined);
    expect(result.id).toBe(1);
  });

  it('create should delegate to adapter.windows.create', async () => {
    const adapter = createMockAdapter();
    const proxy = new WindowsProxy(adapter);

    const result = await proxy.create({ createData: { url: 'https://example.com' } });

    expect(adapter.windows.create).toHaveBeenCalledWith({ url: 'https://example.com' });
    expect(result.id).toBe(2);
  });

  it('remove should delegate to adapter.windows.remove', async () => {
    const adapter = createMockAdapter();
    const proxy = new WindowsProxy(adapter);

    await proxy.remove({ windowId: 1 });

    expect(adapter.windows.remove).toHaveBeenCalledWith(1);
  });
});
