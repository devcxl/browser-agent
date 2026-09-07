import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types/jsonrpc';
import {
  createProxyGetSettingsTool,
  createProxySetSettingsTool,
  createProxyClearTool,
} from '../proxy-tools';

function createMockRpc(): IJsonRpcClient {
  return {
    request: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as IJsonRpcClient;
}

describe('proxy tools', () => {
  describe('proxy_getSettings', () => {
    it('should have correct metadata', () => {
      const tool = createProxyGetSettingsTool(createMockRpc());

      expect(tool.name).toBe('proxy_getSettings');
      expect(tool.category).toBe('proxy');
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.resultSensitivity).toBe('low');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('proxy');
      expect(tool.requireBackground).toBe(true);
      expect(typeof tool.execute).toBe('function');
      expect(tool.preflight).toBeUndefined();
    });

    it('should call rpc.request("proxy.getSettings", {}) and return data', async () => {
      const rpc = createMockRpc();
      const settings = { mode: 'system' };
      vi.mocked(rpc.request).mockResolvedValue(settings);
      const tool = createProxyGetSettingsTool(rpc);

      const result = await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('proxy.getSettings', {});
      expect(result).toEqual({ success: true, data: settings });
    });
  });

  describe('proxy_setSettings', () => {
    it('should have correct metadata', () => {
      const tool = createProxySetSettingsTool(createMockRpc());

      expect(tool.name).toBe('proxy_setSettings');
      expect(tool.category).toBe('proxy');
      expect(tool.riskLevel).toBe('critical');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.resultSensitivity).toBe('low');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('proxy');
      expect(tool.requireBackground).toBe(true);
      expect(typeof tool.preflight).toBe('function');
    });

    it('should require value in schema', () => {
      const tool = createProxySetSettingsTool(createMockRpc());
      expect(tool.schema.required).toContain('value');
    });

    it('should call rpc.request("proxy.setSettings", params)', async () => {
      const rpc = createMockRpc();
      const tool = createProxySetSettingsTool(rpc);
      const params = { value: { mode: 'fixed_servers', rules: { singleProxy: { scheme: 'http', host: '127.0.0.1', port: 8080 } } } };

      const result = await tool.execute(params);

      expect(rpc.request).toHaveBeenCalledWith('proxy.setSettings', params);
      expect(result).toEqual({ success: true });
    });

    describe('preflight', () => {
      it('should not warn when switching to a fixed proxy', async () => {
        const tool = createProxySetSettingsTool(createMockRpc());

        const preflight = await tool.preflight!({
          value: { mode: 'fixed_servers', rules: { singleProxy: { scheme: 'http', host: '127.0.0.1', port: 8080 } } },
        });

        expect(preflight.affectedObjects).toEqual([
          { type: 'page', reason: '代理模式将切换为: fixed_servers' },
        ]);
        expect(preflight.warnings).toEqual([]);
      });

      it('should warn when switching to none (disconnect)', async () => {
        const tool = createProxySetSettingsTool(createMockRpc());

        const preflight = await tool.preflight!({ value: { mode: 'none' } });

        expect(preflight.affectedObjects).toEqual([
          { type: 'page', reason: '代理模式将切换为: none' },
        ]);
        expect(preflight.warnings).toEqual(['你将完全断开代理连接']);
      });

      it('should not warn for system mode', async () => {
        const tool = createProxySetSettingsTool(createMockRpc());

        const preflight = await tool.preflight!({ value: { mode: 'system' } });

        expect(preflight.affectedObjects).toEqual([
          { type: 'page', reason: '代理模式将切换为: system' },
        ]);
        expect(preflight.warnings).toEqual([]);
      });
    });
  });

  describe('proxy_clear', () => {
    it('should have correct metadata', () => {
      const tool = createProxyClearTool(createMockRpc());

      expect(tool.name).toBe('proxy_clear');
      expect(tool.category).toBe('proxy');
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.resultSensitivity).toBe('low');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('proxy');
      expect(tool.requireBackground).toBe(true);
      expect(tool.preflight).toBeUndefined();
    });

    it('should call rpc.request("proxy.clear", {})', async () => {
      const rpc = createMockRpc();
      const tool = createProxyClearTool(rpc);

      const result = await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('proxy.clear', {});
      expect(result).toEqual({ success: true });
    });
  });
});
