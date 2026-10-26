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

    it('download_search: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_search')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('download_start: riskLevel high, confirmationRequired true', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_start')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
    });

    it('download_clear: riskLevel high, confirmationRequired true, 有 preflight', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_clear')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.preflight).toBeDefined();
    });

    it('download_open: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_open')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('download_cancel: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_cancel')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('download_pause: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_pause')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('download_resume: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_resume')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('download_search execute 调用 rpc.request("downloads.search")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue([{ id: 1, filename: 'test.pdf' }]);

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_search')!;
      const result = await tool.execute({ query: 'test' });

      expect(rpc.request).toHaveBeenCalledWith('downloads.search', { query: 'test' });
      expect(result).toEqual({ success: true, data: [{ id: 1, filename: 'test.pdf' }] });
    });

    it('download_start execute 调用 rpc.request("downloads.download")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue({ id: 42 });

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_start')!;
      const result = await tool.execute({ url: 'https://example.com/file.pdf' });

      expect(rpc.request).toHaveBeenCalledWith('downloads.download', { url: 'https://example.com/file.pdf' });
      expect(result).toEqual({ success: true, data: { id: 42 } });
    });

    it('download_start preflight 展示来源 URL 与警告', async () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_start')!;

      const result = await tool.preflight!({ url: 'https://example.com/file.pdf', filename: 'file.pdf' });

      expect(result.affectedObjects[0]?.id).toBe('https://example.com/file.pdf');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('download_clear preflight 返回正确格式', async () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_clear')!;
      const result = await tool.preflight!({});

      expect(result.affectedObjects).toHaveLength(1);
      expect(result.affectedObjects[0]?.reason).toContain('清除所有下载记录');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('download_clear preflight 携带过滤条件时拼接条件描述', async () => {
      const rpc = createMockRpc();
      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_clear')!;
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

    it('download_clear execute 调用 rpc.request("downloads.erase")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_clear')!;
      const result = await tool.execute({ urlRegex: '.*' });

      expect(rpc.request).toHaveBeenCalledWith('downloads.erase', { urlRegex: '.*' });
      expect(result).toEqual({ success: true });
    });

    it('download_open execute 调用 rpc.request("downloads.open")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_open')!;
      const result = await tool.execute({ downloadId: 1 });

      expect(rpc.request).toHaveBeenCalledWith('downloads.open', { downloadId: 1 });
      expect(result).toEqual({ success: true });
    });

    it('download_cancel execute 调用 rpc.request("downloads.cancel")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_cancel')!;
      const result = await tool.execute({ downloadId: 2 });

      expect(rpc.request).toHaveBeenCalledWith('downloads.cancel', { downloadId: 2 });
      expect(result).toEqual({ success: true });
    });

    it('download_pause execute 调用 rpc.request("downloads.pause")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_pause')!;
      const result = await tool.execute({ downloadId: 3 });

      expect(rpc.request).toHaveBeenCalledWith('downloads.pause', { downloadId: 3 });
      expect(result).toEqual({ success: true });
    });

    it('download_resume execute 调用 rpc.request("downloads.resume")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createDownloadsTools(rpc);
      const tool = tools.find((t) => t.name === 'download_resume')!;
      const result = await tool.execute({ downloadId: 4 });

      expect(rpc.request).toHaveBeenCalledWith('downloads.resume', { downloadId: 4 });
      expect(result).toEqual({ success: true });
    });
  });
});
const SAMPLE_PARAMS: Record<string, Record<string, unknown>> = {"download_search": {}, "download_start": {"url": "https://e.com"}, "download_clear": {}, "download_open": {"downloadId": 1}, "download_cancel": {"downloadId": 1}, "download_pause": {"downloadId": 1}, "download_resume": {"downloadId": 1}};

describe('downloads 全工具异常归一化', () => {
  it('每个工具执行异常都返回失败结果（Error 与非 Error 两侧）', async () => {
    const rpc = createMockRpc();
    const tools = createDownloadsTools(rpc);
    for (const tool of tools) {
      for (const rejection of [new Error('E1'), 'E2-string']) {
        vi.mocked(rpc.request).mockRejectedValue(rejection);
        const result = await tool.execute(SAMPLE_PARAMS[tool.name] ?? {});
        expect(result.success).toBe(false);
      }
    }
  });
});
