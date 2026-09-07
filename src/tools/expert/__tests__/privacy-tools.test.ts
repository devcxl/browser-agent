import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types/jsonrpc';
import {
  createPrivacyGetSettingsTool,
  createPrivacySetSettingTool,
} from '../privacy-tools';

function createMockRpc(): IJsonRpcClient {
  return {
    request: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as IJsonRpcClient;
}

describe('privacy tools', () => {
  describe('privacy_getSettings', () => {
    it('should have correct metadata', () => {
      const tool = createPrivacyGetSettingsTool(createMockRpc());

      expect(tool.name).toBe('privacy_getSettings');
      expect(tool.category).toBe('privacy');
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.resultSensitivity).toBe('low');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('privacy');
      expect(tool.requireBackground).toBe(true);
      expect(typeof tool.execute).toBe('function');
      expect(tool.preflight).toBeUndefined();
    });

    it('should call rpc.request("privacy.getNetworkSettings", {}) and return data', async () => {
      const rpc = createMockRpc();
      const settings = { webRTCIPHandlingPolicy: 'default_public_interface_only' };
      vi.mocked(rpc.request).mockResolvedValue(settings);
      const tool = createPrivacyGetSettingsTool(rpc);

      const result = await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('privacy.getNetworkSettings', {});
      expect(result).toEqual({ success: true, data: settings });
    });
  });

  describe('privacy_setSetting', () => {
    it('should have correct metadata', () => {
      const tool = createPrivacySetSettingTool(createMockRpc());

      expect(tool.name).toBe('privacy_setSetting');
      expect(tool.category).toBe('privacy');
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.resultSensitivity).toBe('low');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('privacy');
      expect(tool.requireBackground).toBe(true);
      expect(tool.preflight).toBeUndefined();
    });

    it('should require key and value in schema', () => {
      const tool = createPrivacySetSettingTool(createMockRpc());
      expect(tool.schema.required).toContain('key');
      expect(tool.schema.required).toContain('value');
    });

    it('should call rpc.request("privacy.setNetworkSetting", params)', async () => {
      const rpc = createMockRpc();
      const tool = createPrivacySetSettingTool(rpc);
      const params = {
        key: 'webRTCIPHandlingPolicy',
        value: 'disable_non_proxied_udp',
      };

      const result = await tool.execute(params);

      expect(rpc.request).toHaveBeenCalledWith('privacy.setNetworkSetting', params);
      expect(result).toEqual({ success: true });
    });
  });
});
