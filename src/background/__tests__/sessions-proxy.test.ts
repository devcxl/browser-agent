import { describe, it, expect, vi } from 'vitest';
import { SessionsProxy } from '../proxies/sessions-proxy';
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
    sessions: {
      getRecentlyClosed: vi.fn().mockResolvedValue([
        { lastModified: 1000, tab: { id: 1, title: 'Tab1' } },
      ]),
      restore: vi.fn().mockResolvedValue({ lastModified: 1000, tab: { id: 1, title: 'Restored' } }),
    },
    storage: {} as any,
    clipboard: {} as any,
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('SessionsProxy', () => {
  it('save should call getRecentlyClosed and return count', async () => {
    const adapter = createMockAdapter();
    const proxy = new SessionsProxy(adapter);

    const result = await proxy.save();

    expect(adapter.sessions.getRecentlyClosed).toHaveBeenCalledWith({ maxResults: 25 });
    expect(result).toEqual({ saved: true, count: 1 });
  });

  it('restore should delegate to adapter.sessions.restore', async () => {
    const adapter = createMockAdapter();
    const proxy = new SessionsProxy(adapter);

    const result = await proxy.restore({ sessionId: 's1' });

    expect(adapter.sessions.restore).toHaveBeenCalledWith('s1');
    expect(result.tab?.title).toBe('Restored');
  });

  it('list should delegate to adapter.sessions.getRecentlyClosed', async () => {
    const adapter = createMockAdapter();
    const proxy = new SessionsProxy(adapter);

    const result = await proxy.list({ maxResults: 10 });

    expect(adapter.sessions.getRecentlyClosed).toHaveBeenCalledWith({ maxResults: 10 });
    expect(result).toHaveLength(1);
  });

  it('delete should return error (no manual delete API)', async () => {
    const adapter = createMockAdapter();
    const proxy = new SessionsProxy(adapter);

    const result = await proxy.delete({ sessionId: 's1' });

    expect(result.success).toBe(false);
  });
});
