import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types';
import { createMiscTools } from '../index';

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

describe('Misc tools', () => {
  describe('createMiscTools', () => {
    it('返回 7 个工具', () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      expect(tools).toHaveLength(7);
    });

    it('工具名包含 clipboard/notifications/storage/time_get', () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const names = tools.map((t) => t.name);
      expect(names).toContain('clipboard_read');
      expect(names).toContain('clipboard_write');
      expect(names).toContain('notifications_create');
      expect(names).toContain('storage_local_get');
      expect(names).toContain('storage_local_set');
      expect(names).toContain('storage_local_remove');
      expect(names).toContain('time_get');
    });

    it('clipboard_read: riskLevel high, confirmationRequired true, resultSensitivity sensitive', () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'clipboard_read')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.resultSensitivity).toBe('sensitive');
    });

    it('clipboard_write: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'clipboard_write')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('notifications_create: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'notifications_create')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('storage_local_get: riskLevel medium, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'storage_local_get')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('storage_local_set: riskLevel medium, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'storage_local_set')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('storage_local_remove: riskLevel medium, confirmationRequired false, 有 preflight', () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'storage_local_remove')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.preflight).toBeDefined();
    });

    it('clipboard_read execute 调用 content.execute 转发 clipboard.read', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue({ text: 'clipboard content' });

      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'clipboard_read')!;
      const result = await tool.execute({ tabId: 123 });

      expect(rpc.request).toHaveBeenCalledWith('content.execute', {
        tabId: 123,
        method: 'clipboard.read',
        params: {},
      });
      expect(result).toEqual({ success: true, data: { text: 'clipboard content' } });
    });

    it('notifications_create execute 调用 rpc.request("notifications.create")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'notifications_create')!;
      const result = await tool.execute({ title: 'Test', message: 'Hello' });

      expect(rpc.request).toHaveBeenCalledWith('notifications.create', { title: 'Test', message: 'Hello' });
      expect(result).toEqual({ success: true });
    });

    it('storage_local_remove preflight 返回正确格式', async () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'storage_local_remove')!;
      const result = await tool.preflight!({ keys: ['key1', 'key2'] });

      expect(result.affectedObjects).toHaveLength(1);
      expect(result.affectedObjects[0]?.reason).toContain('key1');
    });

    it('time_get: category system, riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'time_get')!;
      expect(tool).toBeDefined();
      expect(tool.category).toBe('system');
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.resultSensitivity).toBe('low');
      expect(tool.requireBackground).toBeFalsy();
      expect(tool.requireContentScript).toBeFalsy();
    });

    it('time_get schema 无 required 字段', () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'time_get')!;
      expect(tool.schema.required ?? []).toEqual([]);
    });

    it('time_get execute 返回当前时间 iso 和 timestamp', async () => {
      const fixedDate = new Date('2026-06-21T08:30:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);

      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'time_get')!;
      const result = await tool.execute({});

      vi.useRealTimers();

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        iso: '2026-06-21T08:30:00.000Z',
        timestamp: 1782030600000,
      });
      // time_get 不应调用 rpc
      expect(rpc.request).not.toHaveBeenCalled();
    });

    it('time_get execute 时间单调前进（真实时间）', async () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const tool = tools.find((t) => t.name === 'time_get')!;
      const before = Date.now();
      const result = await tool.execute({});
      const after = Date.now();
      const ts = (result.data as { timestamp: number }).timestamp;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });
});
