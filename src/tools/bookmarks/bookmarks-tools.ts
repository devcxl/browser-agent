import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

/**
 * bookmark_search：按关键字/标题/URL 搜索书签。
 */
export function createBookmarkSearchTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'bookmark_search',
    description: '搜索浏览器书签，可按关键字、标题或 URL 匹配。需要书签 ID 时先从这里查。',
    category: 'bookmarks',
    riskLevel: 'low',
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
      try {
        const data = await rpc.request('bookmarks.search', params);
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * bookmark_add：添加书签或文件夹。
 */
export function createBookmarkAddTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'bookmark_add',
    description:
      '添加书签或书签文件夹：提供 url 时创建书签，不提供 url 时创建文件夹。可用 bookmark_search 查 parentId 把书签放进指定文件夹。',
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
      try {
        const data = await rpc.request('bookmarks.create', params);
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * bookmark_edit：修改书签标题/URL（不含移动位置）。
 */
export function createBookmarkEditTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'bookmark_edit',
    description:
      '修改书签或文件夹的标题和 URL。注意：本工具不能移动书签位置，移动请用 bookmark_move。',
    category: 'bookmarks',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '要修改的书签 ID' },
        title: { type: 'string', description: '新标题' },
        url: { type: 'string', description: '新 URL' },
      },
      required: ['id'],
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        const { id, title, url } = params;
        const data = await rpc.request('bookmarks.update', { id, changes: { title, url } });
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * bookmark_move：把书签移动到其他文件夹/位置。
 */
export function createBookmarkMoveTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'bookmark_move',
    description:
      '把书签移动到其他文件夹或位置。目标文件夹 ID 可用 bookmark_search 查到。整理书签分类时使用。',
    category: 'bookmarks',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '要移动的书签 ID' },
        parentId: { type: 'string', description: '目标父文件夹 ID' },
        index: { type: 'number', description: '目标文件夹中的位置索引' },
      },
      required: ['id'],
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        const { id, parentId, index } = params;
        const data = await rpc.request('bookmarks.move', {
          id,
          destination: { parentId, index },
        });
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * bookmark_remove：删除书签（高风险，保留 preflight）。
 */
export function createBookmarkRemoveTool(rpc: IJsonRpcClient): ToolDefinition {
  const preflight = async (params: Record<string, unknown>): Promise<PreflightResult> => {
    const ids: string[] = [];
    if (typeof params.id === 'string') {
      ids.push(params.id);
    }
    if (Array.isArray(params.idList)) {
      ids.push(...(params.idList as string[]));
    }

    const results = await Promise.allSettled(
      ids.map((id) => rpc.request('bookmarks.get', { id }) as Promise<{ title?: string; url?: string }>)
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
    name: 'bookmark_remove',
    description: '删除书签或文件夹。删除不可恢复，需用户确认。',
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
      try {
        await rpc.request('bookmarks.delete', params);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * bookmark_tree：获取完整书签树。
 */
export function createBookmarkTreeTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'bookmark_tree',
    description: '获取完整的书签树结构（含文件夹层级）。需要了解书签整体组织时使用。',
    category: 'bookmarks',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'sensitive',
    schema: {
      type: 'object',
      properties: {},
    },
    requireBackground: true,
    execute: async () => {
      try {
        const data = await rpc.request('bookmarks.getTree', {});
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}
