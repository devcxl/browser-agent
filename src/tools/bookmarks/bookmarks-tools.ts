import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

export function createBookmarksSearchTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'bookmarks_search',
    description: '搜索浏览器书签，可按关键字、标题或 URL 匹配',
    category: 'bookmarks',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键字' },
      },
      required: ['query'],
    },
    requireBackground: true,
    execute: async (params) => {
      const data = await rpc.request('bookmarks.search', params);
      return { success: true, data };
    },
  };
}

export function createBookmarksCreateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'bookmarks_create',
    description: '创建新的书签或文件夹',
    category: 'bookmarks',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        parentId: { type: 'string', description: '父文件夹 ID（可选，不传则创建到其他书签）' },
        index: { type: 'number', description: '插入位置索引' },
        title: { type: 'string', description: '书签标题' },
        url: { type: 'string', description: '书签 URL（不传则创建文件夹）' },
      },
    },
    requireBackground: true,
    execute: async (params) => {
      const data = await rpc.request('bookmarks.create', params);
      return { success: true, data };
    },
  };
}

export function createBookmarksUpdateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'bookmarks_update',
    description: '更新书签或文件夹的标题和 URL',
    category: 'bookmarks',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '要更新的书签 ID' },
        title: { type: 'string', description: '新标题' },
        url: { type: 'string', description: '新 URL' },
      },
      required: ['id'],
    },
    requireBackground: true,
    execute: async (params) => {
      const data = await rpc.request('bookmarks.update', params);
      return { success: true, data };
    },
  };
}

export function createBookmarksDeleteTool(rpc: IJsonRpcClient): ToolDefinition {
  const preflight = async (params: Record<string, unknown>): Promise<PreflightResult> => {
    const ids: string[] = [];
    if (typeof params.id === 'string') {
      ids.push(params.id);
    }
    if (Array.isArray(params.idList)) {
      ids.push(...(params.idList as string[]));
    }

    const results = await Promise.allSettled(
      ids.map((id) => rpc.request('bookmarks.search', { id }) as Promise<{ title?: string; url?: string }>)
    );

    const affectedObjects = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => {
        const bm = (r as PromiseFulfilledResult<{ title?: string; url?: string }>).value;
        return {
          type: 'bookmark' as const,
          title: bm.title,
          url: bm.url,
          reason: '即将删除此书签',
        };
      });

    const warnings: string[] = [];
    if (ids.length > 5) {
      warnings.push(`正在批量删除 ${ids.length} 个书签，请确认操作。`);
    }

    return { affectedObjects, warnings };
  };

  return {
    name: 'bookmarks_delete',
    description: '删除书签或文件夹。高风险操作，删除不可恢复。',
    category: 'bookmarks',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '要删除的书签 ID（与 idList 二选一）' },
        idList: {
          type: 'array',
          items: { type: 'string' },
          description: '要删除的书签 ID 列表（与 id 二选一）',
        },
      },
    },
    requireBackground: true,
    preflight,
    execute: async (params) => {
      await rpc.request('bookmarks.delete', params);
      return { success: true };
    },
  };
}

export function createBookmarksGetTreeTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'bookmarks_getTree',
    description: '获取完整的书签树结构',
    category: 'bookmarks',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {},
    },
    requireBackground: true,
    execute: async () => {
      const data = await rpc.request('bookmarks.getTree', {});
      return { success: true, data };
    },
  };
}
