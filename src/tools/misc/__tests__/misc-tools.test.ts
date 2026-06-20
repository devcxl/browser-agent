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
    it('返回 6 个工具', () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      expect(tools).toHaveLength(6);
    });

    it('工具名包含 clipboard/notifications/storage', () => {
      const rpc = createMockRpc();
      const tools = createMiscTools(rpc);
      const names = tools.map((t) => t.name);
      expect(names).toContain('clipboard_read');
      expect(names).toContain('clipboard_write');
      expect(names).toContain('notifications_create');
      expect(names).toContain('storage_local_get');
      expect(names).toContain('storage_local_set');
      expect(names).toContain('storage_local_remove');
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
  });
});
