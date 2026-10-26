import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

/**
 * download_search：按条件搜索下载记录。
 */
export function createDownloadSearchTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'download_search',
    description: '搜索浏览器下载记录，可按关键字、状态、时间、大小等条件过滤。需要下载项 ID 时先从这里查。',
    category: 'downloads',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键字' },
        limit: { type: 'number', description: '最大返回数量' },
        orderedBy: { type: 'string', description: '排序字段' },
        startedBefore: { type: 'number', description: '起始时间上限（毫秒时间戳）' },
        startedAfter: { type: 'number', description: '起始时间下限（毫秒时间戳）' },
        totalBytesGreater: { type: 'number', description: '文件大小下限（字节）' },
        totalBytesLess: { type: 'number', description: '文件大小上限（字节）' },
        filenameRegex: { type: 'string', description: '文件名正则表达式' },
        urlRegex: { type: 'string', description: 'URL 正则表达式' },
        danger: { type: 'boolean', description: '是否仅搜索危险下载' },
        state: {
          type: 'string',
          enum: ['in_progress', 'interrupted', 'complete'],
          description: '下载状态过滤',
        },
        exists: { type: 'boolean', description: '文件是否仍存在于磁盘' },
      },
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        const data = await rpc.request('downloads.search', params);
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * download_start：开始下载文件（高风险，preflight 展示来源 URL）。
 */
export function createDownloadStartTool(rpc: IJsonRpcClient): ToolDefinition {
  const preflight = async (params: Record<string, unknown>): Promise<PreflightResult> => ({
    affectedObjects: [
      {
        type: 'download',
        id: typeof params.url === 'string' ? params.url : undefined,
        reason: `即将下载文件${typeof params.filename === 'string' ? `并保存为 ${params.filename}` : ''}`,
      },
    ],
    warnings: ['将从外部 URL 下载文件到本地下载目录。'],
  });

  return {
    name: 'download_start',
    description: '下载文件到本地下载目录。从网络获取文件有风险，需用户确认。',
    category: 'downloads',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要下载的文件的 URL' },
        filename: { type: 'string', description: '保存文件名（可选）' },
        saveAs: { type: 'boolean', description: '是否弹出另存为对话框' },
        method: { type: 'string', enum: ['GET', 'POST'], description: '请求方法' },
        body: { type: 'string', description: 'POST 请求体' },
        conflictAction: {
          type: 'string',
          enum: ['uniquify', 'overwrite', 'prompt'],
          description: '文件冲突处理方式',
        },
      },
      required: ['url'],
    },
    requireBackground: true,
    preflight,
    execute: async (params) => {
      try {
        const data = await rpc.request('downloads.download', params);
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * download_clear：清除下载记录（不删文件，高风险，保留 preflight）。
 */
export function createDownloadClearTool(rpc: IJsonRpcClient): ToolDefinition {
  const preflight = async (params: Record<string, unknown>): Promise<PreflightResult> => {
    const affectedObjects: { type: 'download'; reason: string }[] = [];
    const parts: string[] = [];

    if (params.startedBefore) parts.push(`开始时间<${new Date(params.startedBefore as number).toISOString()}`);
    if (params.startedAfter) parts.push(`开始时间>${new Date(params.startedAfter as number).toISOString()}`);
    if (params.totalBytesGreater) parts.push(`大小>${params.totalBytesGreater}B`);
    if (params.totalBytesLess) parts.push(`大小<${params.totalBytesLess}B`);
    if (params.urlRegex) parts.push(`URL 匹配: ${params.urlRegex}`);

    affectedObjects.push({
      type: 'download',
      reason: parts.length > 0
        ? `即将清除匹配条件的下载记录: ${parts.join(', ')}`
        : '即将清除所有下载记录',
    });

    return { affectedObjects, warnings: ['此操作仅清除下载记录，不会删除已下载的文件。'] };
  };

  return {
    name: 'download_clear',
    description: '清除浏览器下载记录（不删除已下载的文件本身）。记录清除后不可恢复，需用户确认。',
    category: 'downloads',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        startedBefore: { type: 'number', description: '清除起始时间之前的记录（毫秒时间戳）' },
        startedAfter: { type: 'number', description: '清除起始时间之后的记录（毫秒时间戳）' },
        totalBytesGreater: { type: 'number', description: '清除大于指定字节的记录' },
        totalBytesLess: { type: 'number', description: '清除小于指定字节的记录' },
        urlRegex: { type: 'string', description: '清除 URL 匹配的记录' },
      },
    },
    requireBackground: true,
    preflight,
    execute: async (params) => {
      try {
        const data = await rpc.request('downloads.erase', params);
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * download_open：打开已下载的文件。
 */
export function createDownloadOpenTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'download_open',
    description: '用系统默认程序打开已下载完成的文件。',
    category: 'downloads',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        downloadId: { type: 'number', description: '下载项 ID' },
      },
      required: ['downloadId'],
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        await rpc.request('downloads.open', params);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * download_cancel：取消进行中的下载。
 */
export function createDownloadCancelTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'download_cancel',
    description: '取消正在进行的下载。',
    category: 'downloads',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        downloadId: { type: 'number', description: '下载项 ID' },
      },
      required: ['downloadId'],
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        await rpc.request('downloads.cancel', params);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * download_pause：暂停进行中的下载。
 */
export function createDownloadPauseTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'download_pause',
    description: '暂停正在进行的下载（可用 download_resume 恢复）。',
    category: 'downloads',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        downloadId: { type: 'number', description: '下载项 ID' },
      },
      required: ['downloadId'],
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        await rpc.request('downloads.pause', params);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * download_resume：恢复已暂停的下载。
 */
export function createDownloadResumeTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'download_resume',
    description: '恢复已暂停的下载。',
    category: 'downloads',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        downloadId: { type: 'number', description: '下载项 ID' },
      },
      required: ['downloadId'],
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        await rpc.request('downloads.resume', params);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}
