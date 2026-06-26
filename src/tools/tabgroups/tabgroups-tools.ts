import type { IJsonRpcClient, ToolDefinition, ToolParameterSchema } from '@/shared/types';

const TAB_GROUP_COLORS = [
  'grey', 'blue', 'red', 'yellow',
  'green', 'pink', 'purple', 'cyan', 'orange',
] as const;

const QUERY_SCHEMA: ToolParameterSchema = {
  type: 'object',
  properties: {
    collapsed: { type: 'boolean', description: '按折叠状态过滤' },
    color: { type: 'string', description: '按颜色过滤', enum: [...TAB_GROUP_COLORS] },
    title: { type: 'string', description: '按标题过滤' },
    windowId: { type: 'number', description: '按窗口 ID 过滤' },
  },
};

const UPDATE_SCHEMA: ToolParameterSchema = {
  type: 'object',
  properties: {
    groupId: { type: 'number', description: '要更新的标签分组 ID' },
    updateProperties: {
      type: 'object',
      description: '要更新的属性',
      properties: {
        collapsed: { type: 'boolean', description: '是否折叠' },
        color: { type: 'string', description: '分组颜色', enum: [...TAB_GROUP_COLORS] },
        title: { type: 'string', description: '分组标题' },
      },
    },
  },
  required: ['groupId', 'updateProperties'],
} as unknown as ToolParameterSchema;

/**
 * 创建 tabGroups_query 工具：查询标签分组
 */
function createTabGroupsQueryTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'tabGroups_query',
    description: '查询浏览器标签分组，可按折叠状态、颜色、标题、窗口等条件过滤',
    schema: QUERY_SCHEMA,
    category: 'tabGroups',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    execute: async (params) => {
      const data = await rpc.request('tabGroups.query', { queryInfo: params } as Record<string, unknown>);
      return { success: true, data };
    },
  };
}

/**
 * 创建 tabGroups_update 工具：更新标签分组属性
 */
function createTabGroupsUpdateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'tabGroups_update',
    description: '更新标签分组的属性（折叠状态、颜色、标题）',
    schema: UPDATE_SCHEMA,
    category: 'tabGroups',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    execute: async (params) => {
      const data = await rpc.request('tabGroups.update', params as Record<string, unknown>);
      return { success: true, data };
    },
  };
}

export { createTabGroupsQueryTool, createTabGroupsUpdateTool };
