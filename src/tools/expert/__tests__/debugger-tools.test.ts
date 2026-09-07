import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types/jsonrpc';
import {
  createDebuggerGetTargetsTool,
  createDebuggerAttachTool,
  createDebuggerDetachTool,
} from '../debugger-tools';

function createMockRpc(): IJsonRpcClient {
  return {
    request: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as IJsonRpcClient;
}

describe('debugger tools', () => {
  describe('debugger_getTargets', () => {
    it('should have correct metadata', () => {
      const tool = createDebuggerGetTargetsTool(createMockRpc());

      expect(tool.name).toBe('debugger_getTargets');
      expect(tool.category).toBe('debugger');
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.resultSensitivity).toBe('sensitive');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('debugger');
      expect(tool.requireBackground).toBe(true);
      expect(typeof tool.execute).toBe('function');
      expect(tool.preflight).toBeUndefined();
    });

    it('should call rpc.request("debugger.getTargets", {}) and return data', async () => {
      const rpc = createMockRpc();
      const targets = [{ id: 'target-1', title: 'Tab 1' }];
      vi.mocked(rpc.request).mockResolvedValue(targets);
      const tool = createDebuggerGetTargetsTool(rpc);

      const result = await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('debugger.getTargets', {});
      expect(result).toEqual({ success: true, data: targets });
    });
  });

  describe('debugger_attach', () => {
    it('should have correct metadata', () => {
      const tool = createDebuggerAttachTool(createMockRpc());

      expect(tool.name).toBe('debugger_attach');
      expect(tool.category).toBe('debugger');
      expect(tool.riskLevel).toBe('critical');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.resultSensitivity).toBe('low');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('debugger');
      expect(tool.requireBackground).toBe(true);
      expect(typeof tool.preflight).toBe('function');
    });

    it('should require targetId in schema', () => {
      const tool = createDebuggerAttachTool(createMockRpc());
      expect(tool.schema.required).toContain('targetId');
    });

    it('should call rpc.request("debugger.attach", params)', async () => {
      const rpc = createMockRpc();
      const tool = createDebuggerAttachTool(rpc);
      const params = { targetId: 'target-9' };

      const result = await tool.execute(params);

      expect(rpc.request).toHaveBeenCalledWith('debugger.attach', params);
      expect(result).toEqual({ success: true });
    });

    describe('preflight', () => {
      it('should return affected object with target id and warning', async () => {
        const tool = createDebuggerAttachTool(createMockRpc());

        const preflight = await tool.preflight!({ targetId: 'target-42' });

        expect(preflight.affectedObjects).toEqual([
          {
            type: 'tab',
            id: 'target-42',
            reason: '调试器将附加到此目标',
          },
        ]);
        expect(preflight.warnings).toContain('附加调试器后可以拦截该标签页的所有网络请求和 JavaScript 执行');
      });
    });
  });

  describe('debugger_detach', () => {
    it('should have correct metadata', () => {
      const tool = createDebuggerDetachTool(createMockRpc());

      expect(tool.name).toBe('debugger_detach');
      expect(tool.category).toBe('debugger');
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.resultSensitivity).toBe('low');
      expect(tool.expertOnly).toBe(true);
      expect(tool.expertSwitch).toBe('debugger');
      expect(tool.requireBackground).toBe(true);
      expect(tool.preflight).toBeUndefined();
    });

    it('should require targetId in schema', () => {
      const tool = createDebuggerDetachTool(createMockRpc());
      expect(tool.schema.required).toContain('targetId');
    });

    it('should call rpc.request("debugger.detach", params)', async () => {
      const rpc = createMockRpc();
      const tool = createDebuggerDetachTool(rpc);
      const params = { targetId: 'target-7' };

      const result = await tool.execute(params);

      expect(rpc.request).toHaveBeenCalledWith('debugger.detach', params);
      expect(result).toEqual({ success: true });
    });
  });
});
