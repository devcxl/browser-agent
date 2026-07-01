import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

export function createProxyGetSettingsTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'proxy_getSettings',
    description: '读取当前代理设置',
    category: 'proxy',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'proxy',
    schema: { type: 'object', properties: {} },
    requireBackground: true,
    execute: async () => {
      const data = await rpc.request('proxy.getSettings', {});
      return { success: true, data };
    },
  };
}

export function createProxySetSettingsTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'proxy_setSettings',
    description: '设置浏览器代理。代理模式可选：system（系统代理）、none（直连）、fixed_servers（固定代理）、pac_script（PAC 脚本）',
    category: 'proxy',
    riskLevel: 'critical',
    confirmationRequired: true,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'proxy',
    schema: {
      type: 'object',
      properties: {
        value: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['system', 'none', 'fixed_servers', 'pac_script'],
              description: '代理模式',
            },
            pacScript: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                data: { type: 'string' },
                mandatory: { type: 'boolean' },
              },
              description: 'PAC 脚本配置（mode=pac_script 时必填）',
            },
            rules: {
              type: 'object',
              properties: {
                singleProxy: {
                  type: 'object',
                  properties: {
                    scheme: { type: 'string', enum: ['http', 'https', 'socks5', 'socks4'] },
                    host: { type: 'string' },
                    port: { type: 'number' },
                  },
                },
                proxyForHttp: { type: 'object', properties: { scheme: { type: 'string' }, host: { type: 'string' }, port: { type: 'number' } } },
                proxyForHttps: { type: 'object', properties: { scheme: { type: 'string' }, host: { type: 'string' }, port: { type: 'number' } } },
                proxyForFtp: { type: 'object', properties: { scheme: { type: 'string' }, host: { type: 'string' }, port: { type: 'number' } } },
                fallbackProxy: { type: 'object', properties: { scheme: { type: 'string' }, host: { type: 'string' }, port: { type: 'number' } } },
                bypassList: { type: 'array', items: { type: 'string' } },
              },
              description: '固定代理规则（mode=fixed_servers 时必填）',
            },
          },
          required: ['mode'],
        },
      },
      required: ['value'],
    },
    requireBackground: true,
    preflight: async (params) => {
      const mode = (params.value as any)?.mode;
      return {
        affectedObjects: [{ type: 'page', reason: `代理模式将切换为: ${mode}` }],
        warnings: mode === 'none' ? ['你将完全断开代理连接'] : [],
      };
    },
    execute: async (params) => {
      await rpc.request('proxy.setSettings', params);
      return { success: true };
    },
  };
}

export function createProxyClearTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'proxy_clear',
    description: '清除代理设置，恢复为系统代理',
    category: 'proxy',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'proxy',
    schema: { type: 'object', properties: {} },
    requireBackground: true,
    execute: async () => {
      await rpc.request('proxy.clear', {});
      return { success: true };
    },
  };
}
