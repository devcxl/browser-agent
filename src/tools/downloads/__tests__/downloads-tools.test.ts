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

    it('downloads_download: riskLevel high, confirmationRequired true', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_download')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
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

    it('downloads_erase preflight 携带过滤条件时拼接条件描述', async () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_erase')!;
      const startedBefore = new Date('2026-01-01T00:00:00.000Z').getTime();
      const startedAfter = new Date('2025-01-01T00:00:00.000Z').getTime();
      const result = await tool.preflight!({
        startedBefore,
        startedAfter,
        totalBytesGreater: 1024,
        totalBytesLess: 999999,
        urlRegex: '.*\\.pdf$',
      });

      expect(result.affectedObjects).toHaveLength(1);
      const reason = result.affectedObjects[0]?.reason ?? '';
      expect(reason).toContain('开始时间<2026-01-01T00:00:00.000Z');
      expect(reason).toContain('开始时间>2025-01-01T00:00:00.000Z');
      expect(reason).toContain('大小>1024B');
      expect(reason).toContain('大小<999999B');
      expect(reason).toContain('URL 匹配: .*\\.pdf$');
    });

    it('downloads_erase execute 调用 rpc.request("downloads.erase")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_erase')!;
      const result = await tool.execute({ urlRegex: '.*' });

      expect(rpc.request).toHaveBeenCalledWith('downloads.erase', { urlRegex: '.*' });
      expect(result).toEqual({ success: true });
    });

    it('downloads_open execute 调用 rpc.request("downloads.open")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_open')!;
      const result = await tool.execute({ downloadId: 1 });

      expect(rpc.request).toHaveBeenCalledWith('downloads.open', { downloadId: 1 });
      expect(result).toEqual({ success: true });
    });

    it('downloads_cancel execute 调用 rpc.request("downloads.cancel")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_cancel')!;
      const result = await tool.execute({ downloadId: 2 });

      expect(rpc.request).toHaveBeenCalledWith('downloads.cancel', { downloadId: 2 });
      expect(result).toEqual({ success: true });
    });

    it('downloads_pause execute 调用 rpc.request("downloads.pause")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_pause')!;
      const result = await tool.execute({ downloadId: 3 });

      expect(rpc.request).toHaveBeenCalledWith('downloads.pause', { downloadId: 3 });
      expect(result).toEqual({ success: true });
    });

    it('downloads_resume execute 调用 rpc.request("downloads.resume")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'downloads_resume')!;
      const result = await tool.execute({ downloadId: 4 });

      expect(rpc.request).toHaveBeenCalledWith('downloads.resume', { downloadId: 4 });
      expect(result).toEqual({ success: true });
    });
  });
});
