import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';

export function createPrivacyGetSettingsTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'privacy_getSettings',
    description: '读取浏览器隐私相关设置（WebRTC 等）',
    category: 'privacy',
    riskLevel: 'medium',
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

export function createPrivacySetSettingTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'privacy_setSetting',
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
