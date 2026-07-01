import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

export function createDnrGetDynamicRulesTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'dnr_getDynamicRules',
    description: '获取当前所有动态规则的列表，包含规则 ID、优先级、操作类型和条件',
    category: 'declarativeNetRequest',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'sensitive',
    expertOnly: true,
    expertSwitch: 'declarativeNetRequest',
    schema: { type: 'object', properties: {} },
    requireBackground: true,
    execute: async () => {
      const data = await rpc.request('dnr.getDynamicRules', {});
      return { success: true, data };
    },
  };
}

export function createDnrAddDynamicRulesTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'dnr_addDynamicRules',
    description: '添加动态规则用于屏蔽或重定向网络请求。每条规则包含唯一的 ID、优先级、条件和操作',
    category: 'declarativeNetRequest',
    riskLevel: 'critical',
    confirmationRequired: true,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'declarativeNetRequest',
    schema: {
      type: 'object',
      properties: {
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', description: '规则唯一 ID' },
              priority: { type: 'number', description: '优先级，数字越大优先级越高' },
              action: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['block', 'redirect', 'allow', 'upgradeScheme', 'modifyHeaders', 'allowAllRequests'], description: '操作类型' },
                },
                required: ['type'],
                description: '规则触发的操作',
              },
              condition: {
                type: 'object',
                properties: {
                  urlFilter: { type: 'string', description: 'URL 匹配模式' },
                  resourceTypes: { type: 'array', items: { type: 'string' }, description: '资源类型列表' },
                },
                required: ['urlFilter'],
                description: '规则触发的条件',
              },
            },
            required: ['id', 'action', 'condition'],
          },
          description: '要添加的规则列表',
        },
      },
      required: ['rules'],
    },
    requireBackground: true,
    preflight: async (params) => {
      const rules = params.rules as any[];
      const blockCount = rules.filter(r => r.action?.type === 'block').length;
      const redirectCount = rules.filter(r => r.action?.type === 'redirect').length;
      const warnings: string[] = [];
      if (blockCount > 0) warnings.push(`将添加 ${blockCount} 条屏蔽规则`);
      if (redirectCount > 0) warnings.push(`将添加 ${redirectCount} 条重定向规则`);
      return {
        affectedObjects: [{ type: 'page', reason: `将添加 ${rules.length} 条动态网络请求规则` }],
        warnings,
      } satisfies PreflightResult;
    },
    execute: async (params) => {
      await rpc.request('dnr.addDynamicRules', params);
      return { success: true };
    },
  };
}

export function createDnrRemoveDynamicRulesTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'dnr_removeDynamicRules',
    description: '移除指定的动态规则，传入规则 ID 列表',
    category: 'declarativeNetRequest',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'low',
    expertOnly: true,
    expertSwitch: 'declarativeNetRequest',
    schema: {
      type: 'object',
      properties: {
        ruleIds: {
          type: 'array',
          items: { type: 'number' },
          description: '要移除的规则 ID 列表',
        },
      },
      required: ['ruleIds'],
    },
    requireBackground: true,
    execute: async (params) => {
      await rpc.request('dnr.removeDynamicRules', params);
      return { success: true };
    },
  };
}
