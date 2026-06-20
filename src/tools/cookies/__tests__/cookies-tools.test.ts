import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types';
import { createCookiesTools } from '../index';

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

describe('Cookies tools', () => {
  describe('createCookiesTools', () => {
    it('返回 5 个工具', () => {
      const rpc = createMockRpc();
      const tools = createCookiesTools(rpc);
      expect(tools).toHaveLength(5);
    });

    it('所有工具的 category 为 "cookies"', () => {
      const rpc = createMockRpc();
      const tools = createCookiesTools(rpc);
      for (const tool of tools) {
        expect(tool.category).toBe('cookies');
      }
    });

    it('所有工具的 riskLevel 为 "critical"', () => {
      const rpc = createMockRpc();
      const tools = createCookiesTools(rpc);
      for (const tool of tools) {
        expect(tool.riskLevel).toBe('critical');
      }
    });

    it('所有工具的 resultSensitivity 为 "critical"', () => {
      const rpc = createMockRpc();
      const tools = createCookiesTools(rpc);
      for (const tool of tools) {
        expect(tool.resultSensitivity).toBe('critical');
      }
    });

    it('所有工具的 confirmationRequired 为 true', () => {
      const rpc = createMockRpc();
      const tools = createCookiesTools(rpc);
      for (const tool of tools) {
        expect(tool.confirmationRequired).toBe(true);
      }
    });

    it('cookies_get: schema 需要 url 和 name', () => {
      const rpc = createMockRpc();
      const tools = createCookiesTools(rpc);
      const tool = tools.find((t) => t.name === 'cookies_get')!;
      expect(tool).toBeDefined();
      expect(tool.schema.required).toEqual(['url', 'name']);
    });

    it('cookies_set: schema 需要 url, name, value', () => {
      const rpc = createMockRpc();
      const tools = createCookiesTools(rpc);
      const tool = tools.find((t) => t.name === 'cookies_set')!;
      expect(tool).toBeDefined();
      expect(tool.schema.required).toEqual(['url', 'name', 'value']);
    });

    it('cookies_remove: 有 preflight', () => {
      const rpc = createMockRpc();
      const tools = createCookiesTools(rpc);
      const tool = tools.find((t) => t.name === 'cookies_remove')!;
      expect(tool.preflight).toBeDefined();
    });

    it('cookies_get execute 调用 rpc.request("cookies.get")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue({ name: 'session', value: 'abc123', domain: 'example.com' });

      const tools = createCookiesTools(rpc);
      const tool = tools.find((t) => t.name === 'cookies_get')!;
      const result = await tool.execute({ url: 'https://example.com', name: 'session' });

      expect(rpc.request).toHaveBeenCalledWith('cookies.get', { url: 'https://example.com', name: 'session' });
      expect(result).toEqual({ success: true, data: { name: 'session', value: 'abc123', domain: 'example.com' } });
    });

    it('cookies_set execute 调用 rpc.request("cookies.set")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue({ name: 'session', value: 'newvalue', domain: 'example.com' });

      const tools = createCookiesTools(rpc);
      const tool = tools.find((t) => t.name === 'cookies_set')!;
      const result = await tool.execute({ url: 'https://example.com', name: 'session', value: 'newvalue' });

      expect(rpc.request).toHaveBeenCalledWith('cookies.set', { url: 'https://example.com', name: 'session', value: 'newvalue' });
      expect(result).toEqual({ success: true, data: { name: 'session', value: 'newvalue', domain: 'example.com' } });
    });

    it('cookies_remove preflight 返回正确格式', async () => {
      const rpc = createMockRpc();
      const tools = createCookiesTools(rpc);
      const tool = tools.find((t) => t.name === 'cookies_remove')!;
      const result = await tool.preflight!({ url: 'https://example.com', name: 'session' });

      expect(result.affectedObjects).toHaveLength(1);
      expect(result.affectedObjects[0]?.type).toBe('cookie');
      expect(result.affectedObjects[0]?.id).toBe('session');
      expect(result.affectedObjects[0]?.url).toBe('https://example.com');
    });

    it('cookies_getAllCookieStores execute 调用 rpc.request("cookies.getAllCookieStores")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue([{ id: '0', tabIds: [1, 2] }]);

      const tools = createCookiesTools(rpc);
      const tool = tools.find((t) => t.name === 'cookies_getAllCookieStores')!;
      const result = await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('cookies.getAllCookieStores', {});
      expect(result).toEqual({ success: true, data: [{ id: '0', tabIds: [1, 2] }] });
    });
  });
});
