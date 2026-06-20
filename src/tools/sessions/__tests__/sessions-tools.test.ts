import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types';
import { createSessionsTools } from '../index';

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

describe('Sessions tools', () => {
  describe('createSessionsTools', () => {
    it('返回 4 个工具', () => {
      const rpc = createMockRpc();
      const tools = createSessionsTools(rpc);
      expect(tools).toHaveLength(4);
    });

    it('所有工具的 category 为 "sessions"', () => {
      const rpc = createMockRpc();
      const tools = createSessionsTools(rpc);
      for (const tool of tools) {
        expect(tool.category).toBe('sessions');
      }
    });

    it('sessions_save: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createSessionsTools(rpc);
      const tool = tools.find((t) => t.name === 'sessions_save')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('sessions_restore: riskLevel medium, confirmationRequired true', () => {
      const rpc = createMockRpc();
      const tools = createSessionsTools(rpc);
      const tool = tools.find((t) => t.name === 'sessions_restore')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(true);
    });

    it('sessions_list: riskLevel low, confirmationRequired false', () => {
      const rpc = createMockRpc();
      const tools = createSessionsTools(rpc);
      const tool = tools.find((t) => t.name === 'sessions_list')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
    });

    it('sessions_delete: riskLevel medium, confirmationRequired false, 有 preflight', () => {
      const rpc = createMockRpc();
      const tools = createSessionsTools(rpc);
      const tool = tools.find((t) => t.name === 'sessions_delete')!;
      expect(tool).toBeDefined();
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.preflight).toBeDefined();
    });

    it('sessions_save execute 调用 rpc.request("sessions.save")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue({ id: 'snap-1', tabs: [] });

      const tools = createSessionsTools(rpc);
      const tool = tools.find((t) => t.name === 'sessions_save')!;
      const result = await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('sessions.save', {});
      expect(result).toEqual({ success: true, data: { id: 'snap-1', tabs: [] } });
    });

    it('sessions_restore execute 调用 rpc.request("sessions.restore")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue({ id: 'snap-1', restored: true });

      const tools = createSessionsTools(rpc);
      const tool = tools.find((t) => t.name === 'sessions_restore')!;
      const result = await tool.execute({ sessionId: 'snap-1' });

      expect(rpc.request).toHaveBeenCalledWith('sessions.restore', { sessionId: 'snap-1' });
      expect(result).toEqual({ success: true, data: { id: 'snap-1', restored: true } });
    });

    it('sessions_delete preflight 返回正确格式', async () => {
      const rpc = createMockRpc();
      const tools = createSessionsTools(rpc);
      const tool = tools.find((t) => t.name === 'sessions_delete')!;
      const result = await tool.preflight!({ sessionId: 'snap-1' });

      expect(result.affectedObjects).toHaveLength(1);
      expect(result.affectedObjects[0]?.id).toBe('snap-1');
      expect(result.affectedObjects[0]?.reason).toContain('删除会话快照');
    });
  });
});
