import { describe, it, expect, vi } from 'vitest';
import { BookmarksProxy } from '../proxies/bookmarks-proxy';
import type { IBrowserAdapter } from '@/adapters/types';

function createMockAdapter(): IBrowserAdapter {
  return {
    browserType: 'chrome',
    tabs: {} as any,
    windows: {} as any,
    tabGroups: {} as any,
    history: {} as any,
    notifications: {} as any,
    bookmarks: {
      search: vi.fn().mockResolvedValue([{ id: '1', title: 'Test', url: 'https://test.com' }]),
      create: vi.fn().mockResolvedValue({ id: '2', title: 'New', url: 'https://new.com' }),
      update: vi.fn().mockResolvedValue({ id: '1', title: 'Updated' }),
      remove: vi.fn().mockResolvedValue(undefined),
      getTree: vi.fn().mockResolvedValue([{ id: '0', title: 'Root', children: [] }]),
    },
    downloads: {} as any,
    cookies: {} as any,
    sessions: {} as any,
    storage: {} as any,
    clipboard: {} as any,
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('BookmarksProxy', () => {
  it('search should delegate to adapter.bookmarks.search', async () => {
    const adapter = createMockAdapter();
    const proxy = new BookmarksProxy(adapter);

    const result = await proxy.search({ query: 'test' });

    expect(adapter.bookmarks.search).toHaveBeenCalledWith({ query: 'test' });
    expect(result).toHaveLength(1);
  });

  it('create should delegate to adapter.bookmarks.create', async () => {
    const adapter = createMockAdapter();
    const proxy = new BookmarksProxy(adapter);

    const result = await proxy.create({ title: 'New', url: 'https://new.com' });

    expect(adapter.bookmarks.create).toHaveBeenCalledWith({ title: 'New', url: 'https://new.com' });
    expect(result.id).toBe('2');
  });

  it('update should delegate to adapter.bookmarks.update', async () => {
    const adapter = createMockAdapter();
    const proxy = new BookmarksProxy(adapter);

    const result = await proxy.update({ id: '1', changes: { title: 'Updated' } });

    expect(adapter.bookmarks.update).toHaveBeenCalledWith('1', { title: 'Updated' });
    expect(result.title).toBe('Updated');
  });

  it('remove should delegate to adapter.bookmarks.remove', async () => {
    const adapter = createMockAdapter();
    const proxy = new BookmarksProxy(adapter);

    const result = await proxy.remove({ id: '1' });

    expect(adapter.bookmarks.remove).toHaveBeenCalledWith('1');
    expect(result).toEqual({ success: true });
  });

  it('getTree should delegate to adapter.bookmarks.getTree', async () => {
    const adapter = createMockAdapter();
    const proxy = new BookmarksProxy(adapter);

    const result = await proxy.getTree();

    expect(adapter.bookmarks.getTree).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });
});
