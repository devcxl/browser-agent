import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

export function createDownloadsSearchTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'downloads_search',
    description: '搜索浏览器下载记录，可按关键字和状态过滤',
    category: 'downloads',
    riskLevel: 'medium',
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
      const data = await rpc.request('downloads.search', params);
      return { success: true, data };
    },
  };
}

export function createDownloadsDownloadTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'downloads_download',
    description: '下载文件到默认下载目录',
    category: 'downloads',
    riskLevel: 'medium',
    confirmationRequired: false,
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
    execute: async (params) => {
      const data = await rpc.request('downloads.download', params);
      return { success: true, data };
    },
  };
}

export function createDownloadsEraseTool(rpc: IJsonRpcClient): ToolDefinition {
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
    name: 'downloads_erase',
    description: '清除浏览器下载记录。高风险操作，需用户确认。',
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
      await rpc.request('downloads.erase', params);
      return { success: true };
    },
  };
}

export function createDownloadsOpenTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'downloads_open',
    description: '打开已下载的文件',
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
      await rpc.request('downloads.open', params);
      return { success: true };
    },
  };
}

export function createDownloadsCancelTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'downloads_cancel',
    description: '取消正在进行的下载',
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
      await rpc.request('downloads.cancel', params);
      return { success: true };
    },
  };
}

export function createDownloadsPauseTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'downloads_pause',
    description: '暂停正在进行的下载',
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
      await rpc.request('downloads.pause', params);
      return { success: true };
    },
  };
}

export function createDownloadsResumeTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'downloads_resume',
    description: '恢复已暂停的下载',
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
      await rpc.request('downloads.resume', params);
      return { success: true };
    },
  };
}
