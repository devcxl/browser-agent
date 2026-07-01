import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';

export function createManagementListTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'management_list',
    description: '列出所有已安装的扩展程序，包含启用状态、版本、权限等信息',
    category: 'management',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'sensitive',
    expertOnly: true,
    expertSwitch: 'management',
    schema: {
      type: 'object',
      properties: {},
    },
    requireBackground: true,
    execute: async () => {
      const data = await rpc.request('management.getAll', {});
      return { success: true, data };
    },
  };
}

export function createManagementToggleTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'management_toggle',
    description: '启用或禁用指定的扩展程序',
    category: 'management',
    riskLevel: 'critical',
    confirmationRequired: true,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'management',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '扩展程序 ID' },
        enabled: { type: 'boolean', description: 'true=启用, false=禁用' },
      },
      required: ['id', 'enabled'],
    },
    requireBackground: true,
    execute: async (params) => {
      await rpc.request('management.setEnabled', params);
      return { success: true };
    },
  };
}
