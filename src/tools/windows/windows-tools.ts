import type { IJsonRpcClient, ToolDefinition, ToolResult, PreflightResult } from '@/shared/types';
import { sanitizeWindow, sanitizeWindows } from '../tab-sanitize';

/**
 * window_list：列出窗口；提供 windowId 时返回单个窗口详情。
 * populate 时窗口内嵌的标签页已剔除图标等 UI 字段。
 */
export function createWindowListTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'window_list',
    description:
      '列出浏览器窗口。提供 windowId 时返回该窗口详情；提供 getInfo.populate: true 时附带窗口内的标签页列表；都不提供时返回所有窗口（不含标签页）。',
    schema: {
      type: 'object',
      properties: {
        windowId: { type: 'number', description: '按窗口 ID 获取单个窗口' },
        getInfo: {
          type: 'object',
          description: '可选，控制返回窗口的信息量（仅在未提供 windowId 时生效）',
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
    requireBackground: true,
    execute: async (params): Promise<ToolResult> => {
      try {
        if (typeof params.windowId === 'number') {
          const win = await rpc.request('windows.get', { windowId: params.windowId, getInfo: params.getInfo });
          return { success: true, data: sanitizeWindow(win as Record<string, unknown>) };
        }
        const data = await rpc.request('windows.getAll', { getInfo: params.getInfo });
        return { success: true, data: sanitizeWindows(data as Array<Record<string, unknown>>) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * window_new：创建新窗口。
 */
export function createWindowNewTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'window_new',
    description:
      '创建新浏览器窗口，可指定初始 URL、是否聚焦、位置与大小、隐身模式等。',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '初始 URL' },
        focused: { type: 'boolean', description: '是否聚焦新窗口' },
        incognito: { type: 'boolean', description: '是否隐身窗口' },
        state: { type: 'string', description: '窗口状态（normal / minimized / maximized / fullscreen）' },
        left: { type: 'number', description: '窗口左侧位置' },
        top: { type: 'number', description: '窗口顶部位置' },
        width: { type: 'number', description: '窗口宽度' },
        height: { type: 'number', description: '窗口高度' },
      },
    },
    category: 'windows',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'low',
    requireBackground: true,
    execute: async (params): Promise<ToolResult> => {
      try {
        const { url, focused, incognito, state, left, top, width, height } = params;
        const data = await rpc.request('windows.create', {
          createData: { url, focused, incognito, state, left, top, width, height },
        });
        return { success: true, data: sanitizeWindow(data as Record<string, unknown>) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * window_focus：聚焦（切换到）指定窗口。
 */
export function createWindowFocusTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'window_focus',
    description: '聚焦指定窗口，使其成为当前活动窗口。可用 window_list 先查到窗口 ID。',
    schema: {
      type: 'object',
      properties: {
        windowId: { type: 'number', description: '目标窗口 ID' },
        drawAttention: { type: 'boolean', description: '是否以闪烁图标等方式引起注意而非切换焦点' },
      },
      required: ['windowId'],
    },
    category: 'windows',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    requireBackground: true,
    execute: async (params): Promise<ToolResult> => {
      try {
        const win = await rpc.request('windows.update', {
          windowId: params.windowId,
          updateInfo: { focused: true, drawAttention: params.drawAttention },
        });
        return { success: true, data: sanitizeWindow(win as Record<string, unknown>) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  };
}

/**
 * window_close：关闭窗口及其所有标签页（高风险，保留 preflight）。
 */
export function createWindowCloseTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'window_close',
    description: '关闭指定浏览器窗口及其所有标签页。高风险操作，需用户确认。',
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
    requireBackground: true,
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
