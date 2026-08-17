import type { IJsonRpcClient, ToolDefinition, PreflightResult } from '@/shared/types';

export function createClipboardReadTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'clipboard_read',
    description: '读取剪贴板内容。可读取敏感信息，需用户确认。需指定目标标签页 ID。',
    category: 'clipboard',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'sensitive',
    schema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: '目标标签页 ID（clipboard 操作需在 content script 上下文执行）' },
      },
      required: ['tabId'],
    },
    requireContentScript: true,
    execute: async (params) => {
      const data = await rpc.request('content.execute', {
        tabId: params.tabId,
        method: 'clipboard.read',
        params: {},
      });
      return { success: true, data };
    },
  };
}

export function createClipboardWriteTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'clipboard_write',
    description: '写入文本到剪贴板。需指定目标标签页 ID。',
    category: 'clipboard',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: '目标标签页 ID' },
        text: { type: 'string', description: '要写入剪贴板的文本' },
      },
      required: ['tabId', 'text'],
    },
    requireContentScript: true,
    execute: async (params) => {
      await rpc.request('content.execute', {
        tabId: params.tabId,
        method: 'clipboard.write',
        params: { text: params.text },
      });
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
  /** 敏感键黑名单 —— 禁止 LLM 直接读取 */
  const BLOCKED_KEYS = [
    'providers',           // 含 LLM API Key
    'agentSettings',       // Agent 配置
    'expertModeSettings',  // 安全开关
    'skills',              // 技能定义（含 prompt）
    'skillSubscriptions',  // 技能订阅
    'browser_agent_provider_catalog', // Provider 缓存
  ];
  /** 前缀黑名单 —— 匹配 markdown:* 等临时内容键 */
  const BLOCKED_PREFIXES = ['markdown:'];

  const isBlockedKey = (k: string) =>
    BLOCKED_KEYS.includes(k) || BLOCKED_PREFIXES.some((p) => k.startsWith(p));

  return {
    name: 'storage_local_get',
    description: '读取浏览器 local storage 中指定键的数据。出于安全考虑，无法读取 API Key、技能定义等敏感键。',
    category: 'storage',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'critical',
    schema: {
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: '要读取的键列表（必须指定，不支持读取全部存储）',
        },
      },
      required: ['keys'],
    },
    requireBackground: true,
    execute: async (params) => {
      const keys = params.keys as string[] | undefined;
      if (!keys || keys.length === 0) {
        return { success: false, error: '必须指定要读取的键列表，不支持读取全部存储' };
      }

      // 过滤敏感键
      const allowedKeys = keys.filter((k) => !isBlockedKey(k));
      const blockedKeys = keys.filter(isBlockedKey);

      if (allowedKeys.length === 0) {
        return { success: false, error: `无法读取以下敏感键: ${blockedKeys.join(', ')}` };
      }

      const data = await rpc.request('storage.local.get', { keys: allowedKeys });
      return {
        success: true,
        data,
        ...(blockedKeys.length > 0 ? { warnings: [`已忽略敏感键: ${blockedKeys.join(', ')}`] } : {}),
      };
    },
  };
}

export function createStorageLocalSetTool(rpc: IJsonRpcClient): ToolDefinition {
  /** 禁止通过工具写入的敏感键 */
  const BLOCKED_KEYS = [
    'providers',
    'agentSettings',
    'expertModeSettings',
    'skills',
    'skillSubscriptions',
    'browser_agent_provider_catalog',
  ];

  return {
    name: 'storage_local_set',
    description: '写入数据到浏览器 local storage。出于安全考虑，无法修改 API Key、技能定义等敏感配置。',
    category: 'storage',
    riskLevel: 'high',
    confirmationRequired: true,
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
      const items = params.items as Record<string, unknown>;
      const blockedKeys = Object.keys(items).filter((k) => BLOCKED_KEYS.includes(k));
      if (blockedKeys.length > 0) {
        return { success: false, error: `无法修改以下敏感键: ${blockedKeys.join(', ')}` };
      }
      await rpc.request('storage.local.set', { items });
      return { success: true };
    },
  };
}

export function createStorageLocalRemoveTool(rpc: IJsonRpcClient): ToolDefinition {
  /** 禁止通过工具删除的敏感键 */
  const BLOCKED_KEYS = [
    'providers',
    'agentSettings',
    'expertModeSettings',
    'skills',
    'skillSubscriptions',
    'browser_agent_provider_catalog',
  ];

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
    description: '删除浏览器 local storage 中的数据。出于安全考虑，无法删除敏感配置键。',
    category: 'storage',
    riskLevel: 'high',
    confirmationRequired: true,
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
      const keys = params.keys as string[] | undefined;
      if (!keys || keys.length === 0) {
        return { success: false, error: '必须指定要删除的键列表，不支持清空全部存储' };
      }
      const blockedKeys = keys.filter((k) => BLOCKED_KEYS.includes(k));
      if (blockedKeys.length > 0) {
        return { success: false, error: `无法删除以下敏感键: ${blockedKeys.join(', ')}` };
      }
      await rpc.request('storage.local.remove', { keys });
      return { success: true };
    },
  };
}

export function createTimeGetTool(): ToolDefinition {
  return {
    name: 'time_get',
    description: '获取当前时间，返回 ISO 8601 字符串和 Unix 毫秒时间戳。',
    category: 'system',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    schema: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      const now = new Date();
      return {
        success: true,
        data: {
          iso: now.toISOString(),
          timestamp: now.getTime(),
        },
      };
    },
  };
}
