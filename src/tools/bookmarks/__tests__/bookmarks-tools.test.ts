import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types';
import { createBookmarksTools } from '../index';

function createMockRpc(): IJsonRpcClient {
  return {
    request: vi.fn(),
    notify: vi.fn(),
    onRequest: vi.fn(),
    onNotification: vi.fn(),
    offRequest: vi.fn(),
    offNotification: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  };
}

describe('Bookmarks tools', () => {
  describe('createBookmarksTools', () => {
    it('返回 5 个工具', () => {
      const rpc = createMockRpc();
      const tools = createBookmarksTools(rpc);
      expect(tools).toHaveLength(5);
    });

    it('所有工具的 category 为 "bookmarks"', () => {
      const rpc = createMockRpc();
      const tools = createBookmarksTools(rpc);
      for (const tool of tools) {
        expect(tool.category).toBe('bookmarks');
      }
    });

    it('bookmarks_search: riskLevel medium, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createBookmarksTools(rpc);
      const tool = tools.find((t) => t.name === 'bookmarks_search')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('bookmarks_create: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createBookmarksTools(rpc);
      const tool = tools.find((t) => t.name === 'bookmarks_create')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('bookmarks_update: riskLevel medium, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createBookmarksTools(rpc);
      const tool = tools.find((t) => t.name === 'bookmarks_update')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('bookmarks_delete: riskLevel high, confirmationRequired true, 有 preflight', () => {
      const rpc = createMockRpc();
      const tools = createBookmarksTools(rpc);
      const tool = tools.find((t) => t.name === 'bookmarks_delete')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.preflight).toBeDefined();
    });

    it('bookmarks_getTree: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createBookmarksTools(rpc);
      const tool = tools.find((t) => t.name === 'bookmarks_getTree')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('bookmarks_search execute 调用 rpc.request("bookmarks.search")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue([{ id: '1', title: 'Test', url: 'https://example.com' }]);

      const tools = createBookmarksTools(rpc);
      const tool = tools.find((t) => t.name === 'bookmarks_search')!;
      const result = await tool.execute({ query: 'test' });

      expect(rpc.request).toHaveBeenCalledWith('bookmarks.search', { query: 'test' });
      expect(result).toEqual({ success: true, data: [{ id: '1', title: 'Test', url: 'https://example.com' }] });
    });

    it('bookmarks_delete execute 调用 rpc.request("bookmarks.delete")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createBookmarksTools(rpc);
      const tool = tools.find((t) => t.name === 'bookmarks_delete')!;
      const result = await tool.execute({ id: '123' });

      expect(rpc.request).toHaveBeenCalledWith('bookmarks.delete', { id: '123' });
      expect(result).toEqual({ success: true });
    });

    it('bookmarks_getTree execute 调用 rpc.request("bookmarks.getTree")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue([{ id: '0', title: 'root', children: [] }]);

      const tools = createBookmarksTools(rpc);
      const tool = tools.find((t) => t.name === 'bookmarks_getTree')!;
      const result = await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('bookmarks.getTree', {});
      expect(result).toEqual({ success: true, data: [{ id: '0', title: 'root', children: [] }] });
    });

    it('bookmarks_delete preflight 查询书签详情', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue({ title: 'Test Bookmark', url: 'https://example.com' });

      const tools = createBookmarksTools(rpc);
      const tool = tools.find((t) => t.name === 'bookmarks_delete')!;
      const result = await tool.preflight!({ id: '123' });

      expect(rpc.request).toHaveBeenCalledWith('bookmarks.search', { id: '123' });
      expect(result.affectedObjects).toHaveLength(1);
      expect(result.affectedObjects[0]?.title).toBe('Test Bookmark');
      expect(result.affectedObjects[0]?.url).toBe('https://example.com');
    });
  });
});
