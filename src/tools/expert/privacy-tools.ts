import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';

export function createPrivacyReadTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'privacy_read',
    description: '读取浏览器隐私相关设置（WebRTC 等）',
    category: 'privacy',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'privacy',
    schema: { type: 'object', properties: {} },
    requireBackground: true,
    execute: async () => {
      const data = await rpc.request('privacy.getNetworkSettings', {});
      return { success: true, data };
    },
  };
}

export function createPrivacySetTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'privacy_set',
    description: '修改浏览器隐私设置',
    category: 'privacy',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'privacy',
    schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          enum: ['webRTCIPHandlingPolicy', 'webRTCNonProxiedUdpEnabled'],
          description: '设置项名称',
        },
        value: { type: 'string', description: '设置值' },
      },
      required: ['key', 'value'],
    },
    requireBackground: true,
    execute: async (params) => {
      await rpc.request('privacy.setNetworkSetting', params);
      return { success: true };
    },
  };
}
