import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';

const TAB_GROUP_COLORS = [
  'grey', 'blue', 'red', 'yellow',
  'green', 'pink', 'purple', 'cyan', 'orange',
] as const;

/**
 * group_list：查询标签分组。
 */
export function createGroupListTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'group_list',
    description: '列出浏览器标签分组，可按折叠状态、颜色、标题、窗口等条件过滤。',
    schema: {
      type: 'object',
      properties: {
        collapsed: { type: 'boolean', description: '按折叠状态过滤' },
        color: { type: 'string', description: '按颜色过滤', enum: [...TAB_GROUP_COLORS] },
        title: { type: 'string', description: '按标题过滤' },
        windowId: { type: 'number', description: '按窗口 ID 过滤' },
      },
    },
    category: 'tabGroups',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    requireBackground: true,
    execute: async (params) => {
      try {
        const data = await rpc.request('tabGroups.query', { queryInfo: params } as Record<string, unknown>);
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * group_create：把一批标签页组成新标签组并命名/着色。
 * chrome.tabs.group 必须带标签页创建分组，因此 tabIds 必填。
 */
export function createGroupCreateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'group_create',
    description:
      '把一批标签页组成新的标签组，并可设置标题与颜色。标签页 ID 可先用 tab_search 查到。',
    schema: {
      type: 'object',
      properties: {
        tabIds: {
          type: 'array',
          items: { type: 'number' },
          description: '要加入新分组的标签页 ID 列表',
        },
        title: { type: 'string', description: '分组标题' },
        color: { type: 'string', description: '分组颜色', enum: [...TAB_GROUP_COLORS] },
        windowId: { type: 'number', description: '新分组所在窗口 ID，默认取标签页所在窗口' },
      },
      required: ['tabIds'],
    },
    category: 'tabGroups',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    requireBackground: true,
    execute: async (params) => {
      try {
        const tabIds = params.tabIds as number[];
        const groupId = (await rpc.request('tabs.group', {
          tabIds,
          createProperties: { windowId: params.windowId },
        })) as number;

        // 标题/颜色需要二次更新（tabs.group 只负责建组）
        if (typeof params.title === 'string' || typeof params.color === 'string') {
          await rpc.request('tabGroups.update', {
            groupId,
            updateProperties: { title: params.title, color: params.color },
          });
        }
        return { success: true, data: { groupId, tabIds } };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * group_update：修改分组标题 / 颜色 / 折叠状态。
 */
export function createGroupUpdateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'group_update',
    description: '修改标签分组的属性：标题、颜色、折叠/展开。分组 ID 可用 group_list 查到。',
    schema: {
      type: 'object',
      properties: {
        groupId: { type: 'number', description: '目标标签分组 ID' },
        title: { type: 'string', description: '分组标题' },
        color: { type: 'string', description: '分组颜色', enum: [...TAB_GROUP_COLORS] },
        collapsed: { type: 'boolean', description: '是否折叠' },
      },
      required: ['groupId'],
    },
    category: 'tabGroups',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    requireBackground: true,
    execute: async (params) => {
      try {
        const { groupId, title, color, collapsed } = params;
        const updateProperties: Record<string, unknown> = { title, color, collapsed };
        const data = await rpc.request('tabGroups.update', { groupId, updateProperties });
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * group_assign：把标签页加入分组 / 移出分组。
 */
export function createGroupAssignTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'group_assign',
    description:
      '把一批标签页加入指定标签分组；不提供 groupId 时则把这批标签页移出其所在分组（取消分组）。',
    schema: {
      type: 'object',
      properties: {
        tabIds: {
          type: 'array',
          items: { type: 'number' },
          description: '目标标签页 ID 列表',
        },
        groupId: { type: 'number', description: '目标分组 ID；缺省表示移出分组' },
      },
      required: ['tabIds'],
    },
    category: 'tabGroups',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    requireBackground: true,
    execute: async (params) => {
      try {
        const tabIds = params.tabIds as number[];
        if (typeof params.groupId === 'number') {
          await rpc.request('tabs.group', { tabIds, groupId: params.groupId });
          return { success: true, data: { groupId: params.groupId, tabIds } };
        }
        await rpc.request('tabs.ungroup', { tabIds });
        return { success: true, data: { ungrouped: tabIds } };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}
