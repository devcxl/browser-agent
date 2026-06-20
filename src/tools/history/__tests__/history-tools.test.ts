import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types';
import { createHistoryTools } from '../index';

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

describe('History tools', () => {
  describe('createHistoryTools', () => {
    it('返回 3 个工具', () => {
      const rpc = createMockRpc();
      const tools = createHistoryTools(rpc);
      expect(tools).toHaveLength(3);
    });

    it('所有工具的 category 为 "history"', () => {
      const rpc = createMockRpc();
      const tools = createHistoryTools(rpc);
      for (const tool of tools) {
        expect(tool.category).toBe('history');
      }
    });

    it('history_search: riskLevel medium, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createHistoryTools(rpc);
      const tool = tools.find((t) => t.name === 'history_search')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('history_delete: riskLevel high, confirmationRequired true, 有 preflight', () => {
      const rpc = createMockRpc();
      const tools = createHistoryTools(rpc);
      const tool = tools.find((t) => t.name === 'history_delete')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.preflight).toBeDefined();
    });

    it('history_deleteAll: riskLevel critical, confirmationRequired true, 有 preflight', () => {
      const rpc = createMockRpc();
      const tools = createHistoryTools(rpc);
      const tool = tools.find((t) => t.name === 'history_deleteAll')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('critical');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.preflight).toBeDefined();
    });

    it('history_search execute 调用 rpc.request("history.search")，默认 maxResults 50', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue([]);

      const tools = createHistoryTools(rpc);
      const tool = tools.find((t) => t.name === 'history_search')!;
      await tool.execute({ text: 'test' });

      expect(rpc.request).toHaveBeenCalledWith('history.search', { maxResults: 50, text: 'test' });
    });

    it('history_search 保留自定义 maxResults', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue([]);

      const tools = createHistoryTools(rpc);
      const tool = tools.find((t) => t.name === 'history_search')!;
      await tool.execute({ text: 'test', maxResults: 10 });

      expect(rpc.request).toHaveBeenCalledWith('history.search', { maxResults: 10, text: 'test' });
    });

    it('history_delete execute 调用 rpc.request("history.delete")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createHistoryTools(rpc);
      const tool = tools.find((t) => t.name === 'history_delete')!;
      const result = await tool.execute({ url: 'https://example.com' });

      expect(rpc.request).toHaveBeenCalledWith('history.delete', { url: 'https://example.com' });
      expect(result).toEqual({ success: true });
    });

    it('history_deleteAll execute 调用 rpc.request("history.deleteAll")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createHistoryTools(rpc);
      const tool = tools.find((t) => t.name === 'history_deleteAll')!;
      const result = await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('history.deleteAll', {});
      expect(result).toEqual({ success: true });
    });

    it('history_deleteAll preflight 返回正确格式', async () => {
      const rpc = createMockRpc();
      const tools = createHistoryTools(rpc);
      const tool = tools.find((t) => t.name === 'history_deleteAll')!;
      const result = await tool.preflight!({});

      expect(result.affectedObjects).toHaveLength(1);
      expect(result.affectedObjects[0]?.reason).toContain('清空全部浏览历史记录');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
