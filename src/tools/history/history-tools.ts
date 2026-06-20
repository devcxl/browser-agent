import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

export function createHistorySearchTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'history_search',
    description: '搜索浏览器历史记录，可按关键字和时间范围过滤',
    category: 'history',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '搜索关键字' },
        startTime: { type: 'number', description: '起始时间（毫秒时间戳）' },
        endTime: { type: 'number', description: '结束时间（毫秒时间戳）' },
        maxResults: { type: 'number', description: '最大返回数量，默认 50' },
      },
      required: ['text'],
    },
    requireBackground: true,
    execute: async (params) => {
      const merged = { maxResults: 50, ...params };
      const data = await rpc.request('history.search', merged);
      return { success: true, data };
    },
  };
}

export function createHistoryDeleteTool(rpc: IJsonRpcClient): ToolDefinition {
  const preflight = async (params: Record<string, unknown>): Promise<PreflightResult> => {
    const affectedObjects: { type: 'history'; url?: string; reason: string }[] = [];

    if (typeof params.url === 'string') {
      affectedObjects.push({
        type: 'history',
        url: params.url,
        reason: '即将删除此 URL 的历史记录',
      });
    }

    if (params.startTime || params.endTime) {
      const range = [];
      if (params.startTime) range.push(`起始: ${new Date(params.startTime as number).toISOString()}`);
      if (params.endTime) range.push(`结束: ${new Date(params.endTime as number).toISOString()}`);
      affectedObjects.push({
        type: 'history',
        reason: `即将删除时间范围内的所有历史记录 (${range.join(', ')})`,
      });
    }

    return { affectedObjects, warnings: [] };
  };

  return {
    name: 'history_delete',
    description: '删除浏览历史记录。可按 URL 或时间范围删除。',
    category: 'history',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要删除的 URL 模式' },
        startTime: { type: 'number', description: '起始时间（毫秒时间戳）' },
        endTime: { type: 'number', description: '结束时间（毫秒时间戳）' },
      },
    },
    requireBackground: true,
    preflight,
    execute: async (params) => {
      await rpc.request('history.delete', params);
      return { success: true };
    },
  };
}

export function createHistoryDeleteAllTool(rpc: IJsonRpcClient): ToolDefinition {
  const preflight = async (): Promise<PreflightResult> => {
    return {
      affectedObjects: [
        {
          type: 'history',
          reason: '即将清空全部浏览历史记录，此操作不可恢复',
        },
      ],
      warnings: ['此操作将删除所有浏览历史记录，请谨慎确认。'],
    };
  };

  return {
    name: 'history_deleteAll',
    description: '清空全部浏览历史记录。极其危险，需用户确认。',
    category: 'history',
    riskLevel: 'critical',
    confirmationRequired: true,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {},
    },
    requireBackground: true,
    preflight,
    execute: async () => {
      await rpc.request('history.deleteAll', {});
      return { success: true };
    },
  };
}
