import { describe, it, expect, vi } from 'vitest';
import { HistoryProxy } from '../proxies/history-proxy';
import type { IBrowserAdapter } from '@/adapters/types';

function createMockAdapter(): IBrowserAdapter {
  return {
    browserType: 'chrome',
    tabs: {} as any,
    windows: {} as any,
    tabGroups: {} as any,
    history: {
      search: vi.fn().mockResolvedValue([
        { id: '1', url: 'https://example.com', title: 'Example', lastVisitTime: 1000, visitCount: 5, typedCount: 0 },
      ]),
      deleteUrl: vi.fn().mockResolvedValue(undefined),
      deleteRange: vi.fn().mockResolvedValue(undefined),
      deleteAll: vi.fn().mockResolvedValue(undefined),
    },
    notifications: {} as any,
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('HistoryProxy', () => {
  it('search should delegate to adapter.history.search', async () => {
    const adapter = createMockAdapter();
    const proxy = new HistoryProxy(adapter);

    const result = await proxy.search({ text: 'test', maxResults: 10 });

    expect(adapter.history.search).toHaveBeenCalledWith({ text: 'test', maxResults: 10 });
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe('https://example.com');
  });

  it('delete with url should delegate to adapter.history.deleteUrl', async () => {
    const adapter = createMockAdapter();
    const proxy = new HistoryProxy(adapter);

    const result = await proxy.delete({ url: 'https://example.com' });

    expect(adapter.history.deleteUrl).toHaveBeenCalledWith('https://example.com');
    expect(adapter.history.deleteRange).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it('delete with startTime/endTime should delegate to adapter.history.deleteRange', async () => {
    const adapter = createMockAdapter();
    const proxy = new HistoryProxy(adapter);

    const result = await proxy.delete({ startTime: 1000, endTime: 2000 });

    expect(adapter.history.deleteRange).toHaveBeenCalledWith({ startTime: 1000, endTime: 2000 });
    expect(adapter.history.deleteUrl).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it('delete with empty params should throw', async () => {
    const adapter = createMockAdapter();
    const proxy = new HistoryProxy(adapter);

    await expect(proxy.delete({})).rejects.toThrow('history.delete requires either url or both startTime and endTime');
  });

  it('deleteAll should delegate to adapter.history.deleteAll', async () => {
    const adapter = createMockAdapter();
    const proxy = new HistoryProxy(adapter);

    const result = await proxy.deleteAll();

    expect(adapter.history.deleteAll).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });
});
