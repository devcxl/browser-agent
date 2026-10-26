import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

export function createDebuggerListTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'debugger_list',
    description: '列出所有可调试的目标（标签页），包含 ID、标题、URL 和调试器附加状态',
    category: 'debugger',
    riskLevel: 'low',
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
    description: '附加调试器到指定标签页，建立调试会话（浏览器会显示“正在调试”提示条）。当前工具集仅提供附加/分离管理，无基于调试器的进一步操作。',
    category: 'debugger',
    riskLevel: 'critical',
    confirmationRequired: true,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'debugger',
    schema: {
      type: 'object',
      properties: {
        targetId: { type: 'string', description: '调试目标 ID（来自 debugger_list）' },
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
    description: '从指定标签页分离调试器，结束调试会话（不产生数据破坏，可随时重新附加）。',
    category: 'debugger',
    riskLevel: 'medium',
    confirmationRequired: true,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'debugger',
    schema: {
      type: 'object',
      properties: {
        targetId: { type: 'string', description: '调试目标 ID（来自 debugger_list）' },
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
