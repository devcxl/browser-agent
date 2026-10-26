import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types/jsonrpc';
import {
  createDnrListTool,
  createDnrAddTool,
  createDnrRemoveTool,
} from '../dnr-tools';

function createMockRpc(): IJsonRpcClient {
  return {
    request: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as IJsonRpcClient;
}

const blockRule = {
  id: 1,
  action: { type: 'block' },
  condition: { urlFilter: '*://ads.example.com/*' },
};
const redirectRule = {
  id: 2,
  action: { type: 'redirect', redirect: { url: 'https://example.com/' } },
  condition: { urlFilter: '*://old.example.com/*' },
};

describe('dnr tools', () => {
  describe('dnr_list', () => {
    it('should have correct metadata', () => {
      const tool = createDnrListTool(createMockRpc());

      expect(tool.name).toBe('dnr_list');
      expect(tool.category).toBe('declarativeNetRequest');
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.resultSensitivity).toBe('sensitive');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('declarativeNetRequest');
      expect(tool.requireBackground).toBe(true);
      expect(typeof tool.execute).toBe('function');
      expect(tool.preflight).toBeUndefined();
    });

    it('should call rpc.request("dnr.getDynamicRules", {}) and return data', async () => {
      const rpc = createMockRpc();
      const rules = [blockRule];
      vi.mocked(rpc.request).mockResolvedValue(rules);
      const tool = createDnrListTool(rpc);

      const result = await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('dnr.getDynamicRules', {});
      expect(result).toEqual({ success: true, data: rules });
    });
  });

  describe('dnr_add', () => {
    it('should have correct metadata', () => {
      const tool = createDnrAddTool(createMockRpc());

      expect(tool.name).toBe('dnr_add');
      expect(tool.category).toBe('declarativeNetRequest');
      expect(tool.riskLevel).toBe('critical');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.resultSensitivity).toBe('low');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('declarativeNetRequest');
      expect(tool.requireBackground).toBe(true);
      expect(typeof tool.preflight).toBe('function');
    });

    it('should require rules in schema', () => {
      const tool = createDnrAddTool(createMockRpc());
      expect(tool.schema.required).toContain('rules');
    });

    it('should call rpc.request("dnr.addDynamicRules", params)', async () => {
      const rpc = createMockRpc();
      const tool = createDnrAddTool(rpc);
      const params = { rules: [blockRule] };

      const result = await tool.execute(params);

      expect(rpc.request).toHaveBeenCalledWith('dnr.addDynamicRules', params);
      expect(result).toEqual({ success: true });
    });

    describe('preflight', () => {
      it('should warn for both block and redirect rules', async () => {
        const tool = createDnrAddTool(createMockRpc());

        const preflight = await tool.preflight!({ rules: [blockRule, redirectRule] });

        expect(preflight.affectedObjects).toEqual([
          { type: 'page', reason: '将添加 2 条动态网络请求规则' },
        ]);
        expect(preflight.warnings).toContain('将添加 1 条屏蔽规则');
        expect(preflight.warnings).toContain('将添加 1 条重定向规则');
      });

      it('should warn only for block rules', async () => {
        const tool = createDnrAddTool(createMockRpc());

        const preflight = await tool.preflight!({ rules: [blockRule, blockRule] });

        expect(preflight.warnings).toEqual(['将添加 2 条屏蔽规则']);
      });

      it('should warn only for redirect rules', async () => {
        const tool = createDnrAddTool(createMockRpc());

        const preflight = await tool.preflight!({ rules: [redirectRule] });

        expect(preflight.warnings).toEqual(['将添加 1 条重定向规则']);
      });

      it('should return empty warnings for non block/redirect rules', async () => {
        const tool = createDnrAddTool(createMockRpc());

        const preflight = await tool.preflight!({
          rules: [{ id: 9, action: { type: 'allow' }, condition: { urlFilter: '*' } }],
        });

        expect(preflight.affectedObjects).toEqual([
          { type: 'page', reason: '将添加 1 条动态网络请求规则' },
        ]);
        expect(preflight.warnings).toEqual([]);
      });

      it('should tolerate rules without action type', async () => {
        const tool = createDnrAddTool(createMockRpc());

        const preflight = await tool.preflight!({ rules: [{ id: 1 }] });

        expect(preflight.affectedObjects).toEqual([
          { type: 'page', reason: '将添加 1 条动态网络请求规则' },
        ]);
        expect(preflight.warnings).toEqual([]);
      });
    });
  });

  describe('dnr_remove', () => {
    it('should have correct metadata', () => {
      const tool = createDnrRemoveTool(createMockRpc());

      expect(tool.name).toBe('dnr_remove');
      expect(tool.category).toBe('declarativeNetRequest');
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.resultSensitivity).toBe('low');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('declarativeNetRequest');
      expect(tool.requireBackground).toBe(true);
      expect(tool.preflight).toBeUndefined();
    });

    it('should require ruleIds in schema', () => {
      const tool = createDnrRemoveTool(createMockRpc());
      expect(tool.schema.required).toContain('ruleIds');
    });

    it('should call rpc.request("dnr.removeDynamicRules", params)', async () => {
      const rpc = createMockRpc();
      const tool = createDnrRemoveTool(rpc);
      const params = { ruleIds: [1, 2, 3] };

      const result = await tool.execute(params);

      expect(rpc.request).toHaveBeenCalledWith('dnr.removeDynamicRules', params);
      expect(result).toEqual({ success: true });
    });
  });
});
