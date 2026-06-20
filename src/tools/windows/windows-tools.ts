import type { IJsonRpcClient, ToolDefinition, ToolResult, PreflightResult } from '@/shared/types';

function createWindowsGetAllTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'windows_getAll',
    description: '获取所有浏览器窗口列表',
    schema: {
      type: 'object',
      properties: {
        getInfo: {
          type: 'object',
          description: '可选，控制返回窗口的信息量',
          properties: {
            populate: { type: 'boolean', description: '是否包含窗口内的标签页' },
            windowTypes: {
              type: 'array',
              description: '过滤窗口类型',
              items: { type: 'string' },
            },
          },
        },
      },
    },
    category: 'windows',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    execute: async (params): Promise<ToolResult> => {
      try {
        const data = await rpc.request('windows.getAll', params as Record<string, unknown>);
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

function createWindowsGetTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'windows_get',
    description: '获取单个浏览器窗口的详细信息',
    schema: {
      type: 'object',
      properties: {
        windowId: { type: 'number', description: '窗口 ID' },
        getInfo: {
          type: 'object',
          description: '可选，控制返回窗口的信息量',
          properties: {
            populate: { type: 'boolean', description: '是否包含窗口内的标签页' },
            windowTypes: {
              type: 'array',
              description: '过滤窗口类型',
              items: { type: 'string' },
            },
          },
        },
      },
      required: ['windowId'],
    },
    category: 'windows',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    execute: async (params): Promise<ToolResult> => {
      try {
        const data = await rpc.request('windows.get', params as Record<string, unknown>);
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

function createWindowsCreateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'windows_create',
    description: '创建新浏览器窗口',
    schema: {
      type: 'object',
      properties: {
        createData: {
          type: 'object',
          description: '窗口创建参数',
          properties: {
            url: { type: 'string', description: '打开的 URL' },
            tabId: { type: 'number', description: '将指定标签页移入新窗口' },
            left: { type: 'number', description: '窗口左侧位置' },
            top: { type: 'number', description: '窗口顶部位置' },
            width: { type: 'number', description: '窗口宽度' },
            height: { type: 'number', description: '窗口高度' },
            focused: { type: 'boolean', description: '是否聚焦' },
            incognito: { type: 'boolean', description: '是否隐身窗口' },
            type: { type: 'string', description: '窗口类型' },
            state: { type: 'string', description: '窗口状态' },
          },
        },
      },
    },
    category: 'windows',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'low',
    execute: async (params): Promise<ToolResult> => {
      try {
        const data = await rpc.request('windows.create', params as Record<string, unknown>);
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

function createWindowsRemoveTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'windows_remove',
    description: '关闭指定浏览器窗口及其所有标签页',
    schema: {
      type: 'object',
      properties: {
        windowId: { type: 'number', description: '要关闭的窗口 ID' },
      },
      required: ['windowId'],
    },
    category: 'windows',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'low',
    preflight: async (params): Promise<PreflightResult> => {
      const windowId = params.windowId as number;
      const affectedObjects: PreflightResult['affectedObjects'] = [];
      const warnings: string[] = [];

      // Try to get tabs in the window
      try {
        const tabs = (await rpc.request('tabs.query', {
          queryInfo: { windowId },
        })) as Array<{ id?: number; title?: string; url?: string }>;

        for (const tab of tabs) {
          affectedObjects.push({
            type: 'tab',
            id: tab.id?.toString(),
            title: tab.title,
            url: tab.url,
            reason: 'will be closed',
          });
        }

        if (tabs.length === 0) {
          warnings.push('Window has no tabs');
        }
      } catch (err) {
        warnings.push(
          `Unable to list tabs: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
      }

      // Try to get window info
      let windowTitle: string | undefined;
      try {
        const win = (await rpc.request('windows.get', {
          windowId,
        })) as { id?: number; title?: string };
        windowTitle = win.title;
      } catch (err) {
        warnings.push(
          `Unable to get window info: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
      }

      affectedObjects.push({
        type: 'window',
        id: String(windowId),
        title: windowTitle ?? `Window ${windowId}`,
        reason: 'will be removed',
      });

      return { affectedObjects, warnings };
    },
    execute: async (params): Promise<ToolResult> => {
      try {
        await rpc.request('windows.remove', params as Record<string, unknown>);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

export {
  createWindowsGetAllTool,
  createWindowsGetTool,
  createWindowsCreateTool,
  createWindowsRemoveTool,
};
