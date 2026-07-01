import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

export function createDebuggerGetTargetsTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'debugger_getTargets',
    description: '列出所有可调试的目标（标签页），包含 ID、标题、URL 和调试器附加状态',
    category: 'debugger',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'sensitive',
    expertOnly: true,
    expertSwitch: 'debugger',
    schema: { type: 'object', properties: {} },
    requireBackground: true,
    execute: async () => {
      const data = await rpc.request('debugger.getTargets', {});
      return { success: true, data };
    },
  };
}

export function createDebuggerAttachTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'debugger_attach',
    description: '附加调试器到指定标签页。附加后可以拦截网络请求、执行 JavaScript、调试 DOM 等',
    category: 'debugger',
    riskLevel: 'critical',
    confirmationRequired: true,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'debugger',
    schema: {
      type: 'object',
      properties: {
        targetId: { type: 'string', description: '调试目标 ID（来自 debugger_getTargets）' },
      },
      required: ['targetId'],
    },
    requireBackground: true,
    preflight: async (params) => {
      const targetId = params.targetId as string;
      return {
        affectedObjects: [{ type: 'tab', id: targetId, reason: '调试器将附加到此目标' }],
        warnings: ['附加调试器后可以拦截该标签页的所有网络请求和 JavaScript 执行'],
      } satisfies PreflightResult;
    },
    execute: async (params) => {
      await rpc.request('debugger.attach', params);
      return { success: true };
    },
  };
}

export function createDebuggerDetachTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'debugger_detach',
    description: '从指定标签页分离调试器',
    category: 'debugger',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'debugger',
    schema: {
      type: 'object',
      properties: {
        targetId: { type: 'string', description: '调试目标 ID（来自 debugger_getTargets）' },
      },
      required: ['targetId'],
    },
    requireBackground: true,
    execute: async (params) => {
      await rpc.request('debugger.detach', params);
      return { success: true };
    },
  };
}
