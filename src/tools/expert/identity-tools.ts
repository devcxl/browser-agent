import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';

export function createIdentityGetAuthTokenTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'identity_getAuthToken',
    description: '获取 OAuth2 认证令牌，可用于访问需要身份认证的 API。可指定交互式模式和账号',
    category: 'identity',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'critical',
    expertOnly: true,
    expertSwitch: 'identity',
    schema: {
      type: 'object',
      properties: {
        interactive: { type: 'boolean', description: '是否以交互方式获取令牌（需要用户交互）' },
        account: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Chrome 账号 ID' },
          },
          description: '指定获取令牌的账号',
        },
      },
    },
    requireBackground: true,
    execute: async (params) => {
      const data = await rpc.request('identity.getAuthToken', params);
      return { success: true, data };
    },
  };
}

export function createIdentityClearCachedTokenTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'identity_clearCachedToken',
    description: '清除缓存的 OAuth2 认证令牌',
    category: 'identity',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'identity',
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: '要清除的令牌值' },
      },
      required: ['token'],
    },
    requireBackground: true,
    execute: async (params) => {
      await rpc.request('identity.clearCachedToken', params);
      return { success: true };
    },
  };
}
