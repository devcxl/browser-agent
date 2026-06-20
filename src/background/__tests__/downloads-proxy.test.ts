import { describe, it, expect, vi } from 'vitest';
import { DownloadsProxy } from '../proxies/downloads-proxy';
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
    downloads: {
      search: vi.fn().mockResolvedValue([{ id: 1, filename: 'test.zip', url: 'https://test.com' }]),
      download: vi.fn().mockResolvedValue(42),
      erase: vi.fn().mockResolvedValue([1, 2]),
      open: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
    },
    cookies: {} as any,
    sessions: {} as any,
    storage: {} as any,
    clipboard: {} as any,
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('DownloadsProxy', () => {
  it('search should delegate to adapter.downloads.search', async () => {
    const adapter = createMockAdapter();
    const proxy = new DownloadsProxy(adapter);

    const result = await proxy.search({ query: 'test' });

    expect(adapter.downloads.search).toHaveBeenCalledWith({ query: 'test' });
    expect(result).toHaveLength(1);
  });

  it('download should delegate to adapter.downloads.download', async () => {
    const adapter = createMockAdapter();
    const proxy = new DownloadsProxy(adapter);

    const result = await proxy.download({ url: 'https://test.com/file.zip' });

    expect(adapter.downloads.download).toHaveBeenCalledWith({ url: 'https://test.com/file.zip' });
    expect(result).toBe(42);
  });

  it('erase should delegate to adapter.downloads.erase', async () => {
    const adapter = createMockAdapter();
    const proxy = new DownloadsProxy(adapter);

    const result = await proxy.erase({ query: 'test' });

    expect(adapter.downloads.erase).toHaveBeenCalledWith({ query: 'test' });
    expect(result).toEqual([1, 2]);
  });

  it('open should delegate to adapter.downloads.open', async () => {
    const adapter = createMockAdapter();
    const proxy = new DownloadsProxy(adapter);

    const result = await proxy.open({ downloadId: 1 });

    expect(adapter.downloads.open).toHaveBeenCalledWith(1);
    expect(result).toEqual({ success: true });
  });

  it('cancel should delegate to adapter.downloads.cancel', async () => {
    const adapter = createMockAdapter();
    const proxy = new DownloadsProxy(adapter);

    await proxy.cancel({ downloadId: 1 });

    expect(adapter.downloads.cancel).toHaveBeenCalledWith(1);
  });

  it('pause should delegate to adapter.downloads.pause', async () => {
    const adapter = createMockAdapter();
    const proxy = new DownloadsProxy(adapter);

    await proxy.pause({ downloadId: 1 });

    expect(adapter.downloads.pause).toHaveBeenCalledWith(1);
  });

  it('resume should delegate to adapter.downloads.resume', async () => {
    const adapter = createMockAdapter();
    const proxy = new DownloadsProxy(adapter);

    await proxy.resume({ downloadId: 1 });

    expect(adapter.downloads.resume).toHaveBeenCalledWith(1);
  });
});
