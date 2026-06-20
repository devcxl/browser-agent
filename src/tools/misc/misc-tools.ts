import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

export function createClipboardReadTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'clipboard_read',
    description: '读取剪贴板内容。可读取敏感信息，需用户确认。',
    category: 'clipboard',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'sensitive',
    schema: {
      type: 'object',
      properties: {},
    },
    requireContentScript: true,
    execute: async () => {
      const data = await rpc.request('clipboard.read', {});
      return { success: true, data };
    },
  };
}

export function createClipboardWriteTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'clipboard_write',
    description: '写入文本到剪贴板',
    category: 'clipboard',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要写入剪贴板的文本' },
      },
      required: ['text'],
    },
    requireContentScript: true,
    execute: async (params) => {
      await rpc.request('clipboard.write', params);
      return { success: true };
    },
  };
}

export function createNotificationsCreateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'notifications_create',
    description: '创建浏览器桌面通知',
    category: 'notifications',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '通知标题' },
        message: { type: 'string', description: '通知正文' },
        iconUrl: { type: 'string', description: '图标 URL（可选）' },
        type: {
          type: 'string',
          enum: ['basic', 'image', 'list', 'progress'],
          description: '通知类型',
        },
        priority: { type: 'number', description: '优先级（-2 到 2）' },
      },
      required: ['title', 'message'],
    },
    requireBackground: true,
    execute: async (params) => {
      await rpc.request('notifications.create', params);
      return { success: true };
    },
  };
}

export function createStorageLocalGetTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'storage_local_get',
    description: '读取浏览器 local storage 中的数据',
    category: 'storage',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: '要读取的键列表（不传则读取全部）',
        },
      },
    },
    requireBackground: true,
    execute: async (params) => {
      const data = await rpc.request('storage.local.get', params);
      return { success: true, data };
    },
  };
}

export function createStorageLocalSetTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'storage_local_set',
    description: '写入数据到浏览器 local storage',
    category: 'storage',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'object',
          description: '要写入的键值对',
        },
      },
      required: ['items'],
    },
    requireBackground: true,
    execute: async (params) => {
      await rpc.request('storage.local.set', params);
      return { success: true };
    },
  };
}

export function createStorageLocalRemoveTool(rpc: IJsonRpcClient): ToolDefinition {
  const preflight = async (params: Record<string, unknown>): Promise<PreflightResult> => {
    const keys = params.keys as string[] | undefined;
    return {
      affectedObjects: [
        {
          type: 'page',
          reason: keys && keys.length > 0
            ? `即将删除 storage 键: ${keys.join(', ')}`
            : '即将清空所有 storage 数据',
        },
      ],
      warnings: keys && keys.length > 0 ? [] : ['即将清空所有 local storage 数据，请谨慎确认。'],
    };
  };

  return {
    name: 'storage_local_remove',
    description: '删除浏览器 local storage 中的数据',
    category: 'storage',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: '要删除的键列表（不传则清空全部）',
        },
      },
    },
    requireBackground: true,
    preflight,
    execute: async (params) => {
      await rpc.request('storage.local.remove', params);
      return { success: true };
    },
  };
}
