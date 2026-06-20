import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

export function createSessionsSaveTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'sessions_save',
    description: '保存当前浏览器会话快照，包含打开的标签页和窗口信息',
    category: 'sessions',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {},
    },
    requireBackground: true,
    execute: async () => {
      const data = await rpc.request('sessions.save', {});
      return { success: true, data };
    },
  };
}

export function createSessionsRestoreTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'sessions_restore',
    description: '恢复指定的会话快照',
    category: 'sessions',
    riskLevel: 'medium',
    confirmationRequired: true,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '要恢复的会话快照 ID' },
      },
      required: ['sessionId'],
    },
    requireBackground: true,
    execute: async (params) => {
      const data = await rpc.request('sessions.restore', params);
      return { success: true, data };
    },
  };
}

export function createSessionsListTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'sessions_list',
    description: '列出所有保存的会话快照',
    category: 'sessions',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {},
    },
    requireBackground: true,
    execute: async () => {
      const data = await rpc.request('sessions.list', {});
      return { success: true, data };
    },
  };
}

export function createSessionsDeleteTool(rpc: IJsonRpcClient): ToolDefinition {
  const preflight = async (params: Record<string, unknown>): Promise<PreflightResult> => {
    return {
      affectedObjects: [
        {
          type: 'tab',
          id: params.sessionId as string,
          reason: `即将删除会话快照: ${params.sessionId}`,
        },
      ],
      warnings: [],
    };
  };

  return {
    name: 'sessions_delete',
    description: '删除指定的会话快照',
    category: 'sessions',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '要删除的会话快照 ID' },
      },
      required: ['sessionId'],
    },
    requireBackground: true,
    preflight,
    execute: async (params) => {
      await rpc.request('sessions.delete', params);
      return { success: true };
    },
  };
}
