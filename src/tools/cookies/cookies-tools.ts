import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

export function createCookiesGetTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'cookies_get',
    description: '获取指定 URL 的 Cookie（不返回 value 字段）',
    category: 'cookies',
    riskLevel: 'critical',
    confirmationRequired: true,
    resultSensitivity: 'critical',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要获取 Cookie 的 URL' },
        name: { type: 'string', description: 'Cookie 名称' },
        storeId: { type: 'string', description: 'Cookie Store ID（可选）' },
      },
      required: ['url', 'name'],
    },
    requireBackground: true,
    execute: async (params) => {
      const data = await rpc.request('cookies.get', params);
      return { success: true, data };
    },
  };
}

export function createCookiesGetAllTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'cookies_getAll',
    description: '获取所有匹配条件的 Cookie',
    category: 'cookies',
    riskLevel: 'critical',
    confirmationRequired: true,
    resultSensitivity: 'critical',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL 过滤' },
        name: { type: 'string', description: 'Cookie 名称过滤' },
        domain: { type: 'string', description: '域名过滤' },
        path: { type: 'string', description: '路径过滤' },
        secure: { type: 'boolean', description: '安全标志过滤' },
        session: { type: 'boolean', description: '会话 Cookie 过滤' },
        storeId: { type: 'string', description: 'Cookie Store ID（可选）' },
      },
    },
    requireBackground: true,
    execute: async (params) => {
      const data = await rpc.request('cookies.getAll', params);
      return { success: true, data };
    },
  };
}

export function createCookiesSetTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'cookies_set',
    description: '设置 Cookie。可写入敏感信息，需用户确认。',
    category: 'cookies',
    riskLevel: 'critical',
    confirmationRequired: true,
    resultSensitivity: 'critical',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Cookie 所属 URL' },
        name: { type: 'string', description: 'Cookie 名称' },
        value: { type: 'string', description: 'Cookie 值' },
        domain: { type: 'string', description: '域名' },
        path: { type: 'string', description: '路径' },
        secure: { type: 'boolean', description: '安全标志' },
        httpOnly: { type: 'boolean', description: 'HTTP Only 标志' },
        sameSite: {
          type: 'string',
          enum: ['no_restriction', 'lax', 'strict'],
          description: 'SameSite 策略',
        },
        expirationDate: { type: 'number', description: '过期时间（秒时间戳）' },
        storeId: { type: 'string', description: 'Cookie Store ID（可选）' },
      },
      required: ['url', 'name', 'value'],
    },
    requireBackground: true,
    execute: async (params) => {
      const data = await rpc.request('cookies.set', params);
      return { success: true, data };
    },
  };
}

export function createCookiesRemoveTool(rpc: IJsonRpcClient): ToolDefinition {
  const preflight = async (params: Record<string, unknown>): Promise<PreflightResult> => {
    return {
      affectedObjects: [
        {
          type: 'cookie',
          id: params.name as string,
          url: params.url as string,
          reason: `即将删除 Cookie: ${params.name}`,
        },
      ],
      warnings: [],
    };
  };

  return {
    name: 'cookies_remove',
    description: '删除指定 Cookie。高风险操作，需用户确认。',
    category: 'cookies',
    riskLevel: 'critical',
    confirmationRequired: true,
    resultSensitivity: 'critical',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Cookie 所属 URL' },
        name: { type: 'string', description: '要删除的 Cookie 名称' },
        storeId: { type: 'string', description: 'Cookie Store ID（可选）' },
      },
      required: ['url', 'name'],
    },
    requireBackground: true,
    preflight,
    execute: async (params) => {
      const data = await rpc.request('cookies.remove', params);
      return { success: true, data };
    },
  };
}

export function createCookiesGetAllCookieStoresTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'cookies_getAllCookieStores',
    description: '获取所有可用的 Cookie Store',
    category: 'cookies',
    riskLevel: 'critical',
    confirmationRequired: true,
    resultSensitivity: 'critical',
    schema: {
      type: 'object',
      properties: {},
    },
    requireBackground: true,
    execute: async () => {
      const data = await rpc.request('cookies.getAllCookieStores', {});
      return { success: true, data };
    },
  };
}
