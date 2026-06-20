import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types';
import { createDownloadsTools } from '../index';

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

describe('Downloads tools', () => {
  describe('createDownloadsTools', () => {
    it('返回 7 个工具', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      expect(tools).toHaveLength(7);
    });

    it('所有工具的 category 为 "downloads"', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      for (const tool of tools) {
        expect(tool.category).toBe('downloads');
      }
    });

    it('downloads_search: riskLevel medium, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_search')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('downloads_download: riskLevel medium, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_download')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('downloads_erase: riskLevel high, confirmationRequired true, 有 preflight', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_erase')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.preflight).toBeDefined();
    });

    it('downloads_open: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_open')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('downloads_cancel: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_cancel')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('downloads_pause: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_pause')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('downloads_resume: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_resume')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('downloads_search execute 调用 rpc.request("downloads.search")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue([{ id: 1, filename: 'test.pdf' }]);

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_search')!;
      const result = await tool.execute({ query: 'test' });

      expect(rpc.request).toHaveBeenCalledWith('downloads.search', { query: 'test' });
      expect(result).toEqual({ success: true, data: [{ id: 1, filename: 'test.pdf' }] });
    });

    it('downloads_download execute 调用 rpc.request("downloads.download")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue({ id: 42 });

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_download')!;
      const result = await tool.execute({ url: 'https://example.com/file.pdf' });

      expect(rpc.request).toHaveBeenCalledWith('downloads.download', { url: 'https://example.com/file.pdf' });
      expect(result).toEqual({ success: true, data: { id: 42 } });
    });

    it('downloads_erase preflight 返回正确格式', async () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_erase')!;
      const result = await tool.preflight!({});

      expect(result.affectedObjects).toHaveLength(1);
      expect(result.affectedObjects[0]?.reason).toContain('清除所有下载记录');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
