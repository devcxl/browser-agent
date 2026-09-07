import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types/jsonrpc';
import {
  createManagementListTool,
  createManagementToggleTool,
} from '../management-tools';

function createMockRpc(): IJsonRpcClient {
  return {
    request: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as IJsonRpcClient;
}

describe('management tools', () => {
  describe('management_list', () => {
    it('should have correct metadata', () => {
      const tool = createManagementListTool(createMockRpc());

      expect(tool.name).toBe('management_list');
      expect(tool.category).toBe('management');
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.resultSensitivity).toBe('sensitive');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('management');
      expect(tool.requireBackground).toBe(true);
      expect(typeof tool.execute).toBe('function');
      expect(tool.preflight).toBeUndefined();
    });

    it('should call rpc.request("management.getAll", {}) and return data', async () => {
      const rpc = createMockRpc();
      const extensions = [{ id: 'ext-1', name: 'AdBlock', enabled: true }];
      vi.mocked(rpc.request).mockResolvedValue(extensions);
      const tool = createManagementListTool(rpc);

      const result = await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('management.getAll', {});
      expect(result).toEqual({ success: true, data: extensions });
    });
  });

  describe('management_toggle', () => {
    it('should have correct metadata', () => {
      const tool = createManagementToggleTool(createMockRpc());

      expect(tool.name).toBe('management_toggle');
      expect(tool.category).toBe('management');
      expect(tool.riskLevel).toBe('critical');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.resultSensitivity).toBe('low');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('management');
      expect(tool.requireBackground).toBe(true);
      expect(tool.preflight).toBeUndefined();
    });

    it('should require id and enabled in schema', () => {
      const tool = createManagementToggleTool(createMockRpc());
      expect(tool.schema.required).toContain('id');
      expect(tool.schema.required).toContain('enabled');
    });

    it('should call rpc.request("management.setEnabled", params)', async () => {
      const rpc = createMockRpc();
      const tool = createManagementToggleTool(rpc);
      const params = { id: 'ext-2', enabled: false };

      const result = await tool.execute(params);

      expect(rpc.request).toHaveBeenCalledWith('management.setEnabled', params);
      expect(result).toEqual({ success: true });
    });
  });
});
