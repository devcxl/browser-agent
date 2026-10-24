import type { ToolDefinition, PreflightResult } from "../../shared/types";
import type { IJsonRpcClient } from "../../shared/types";

export function createTabsQueryTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_query",
    description:
      "查询标签页。提供 tabId 时返回该标签页的详细信息；提供 queryInfo 或都不提供时返回匹配条件的标签页列表。",
    category: "tabs",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "sensitive",
    schema: {
      type: "object",
      properties: {
        tabId: {
          type: "number",
          description: "要查询的单个标签页 ID，提供时直接获取该标签页详细信息",
        },
        queryInfo: {
          type: "object",
          description: "标签页过滤条件，不提供 tabId 时生效",
          properties: {
            active: { type: "boolean" },
            pinned: { type: "boolean" },
            audible: { type: "boolean" },
            muted: { type: "boolean" },
            highlighted: { type: "boolean" },
            currentWindow: { type: "boolean" },
            lastFocusedWindow: { type: "boolean" },
            status: { type: "string", enum: ["loading", "complete"] },
            title: { type: "string" },
            url: { type: "string" },
            windowId: { type: "number" },
            windowType: { type: "string", enum: ["normal", "popup", "panel", "devtools"] },
          },
        },
      },
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        if (typeof params.tabId === "number") {
          const tab = await rpc.request("tabs.get", { tabId: params.tabId });
          return { success: true, data: tab };
        }
        const tabs = await rpc.request("tabs.query", {
          queryInfo: params.queryInfo ?? {},
        });
        return { success: true, data: tabs };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
  };
}

export function createTabsManageTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_manage",
    description:
      "管理标签页（新建、更新属性/激活、移动顺序、添加分组、移出分组）。通过 action 参数指定操作类型。",
    category: "tabs",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "update", "move", "group", "ungroup"],
          description: "操作类型",
        },
        url: { type: "string", description: "新标签页 URL 或导航地址" },
        active: { type: "boolean", description: "是否立即激活标签页" },
        pinned: { type: "boolean", description: "是否固定标签页" },
        tabId: { type: "number", description: "目标标签页 ID（适用于 update、move）" },
        tabIds: {
          type: "array",
          items: { type: "number" },
          description: "批量标签页 ID（适用于 group、ungroup、move）",
        },
        index: { type: "number", description: "目标位置索引（适用于 move、create）" },
        windowId: { type: "number", description: "所属窗口 ID（适用于 create、move）" },
        groupId: { type: "number", description: "目标标签组 ID（适用于 group）" },
      },
      required: ["action"],
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        const action = params.action;

        if (action === "create") {
          const tab = await rpc.request("tabs.create", {
            createProperties: {
              url: params.url,
              active: params.active,
              pinned: params.pinned,
              windowId: params.windowId,
              index: params.index,
            },
          });
          return { success: true, data: tab };
        }

        if (action === "update") {
          if (typeof params.tabId !== "number") {
            return { success: false, error: 'tabs_manage action "update" 需要提供 tabId' };
          }
          const tab = await rpc.request("tabs.update", {
            tabId: params.tabId,
            updateProperties: {
              url: params.url,
              active: params.active,
              pinned: params.pinned,
            },
          });
          return { success: true, data: tab };
        }

        if (action === "move") {
          const tabIds = resolveTabIds(params);
          if (tabIds.length === 0) {
            return { success: false, error: 'tabs_manage action "move" 需要提供 tabIds 或 tabId' };
          }
          if (typeof params.index !== "number") {
            return { success: false, error: 'tabs_manage action "move" 需要提供 index' };
          }
          const res = await rpc.request("tabs.move", {
            tabIds,
            moveProperties: { index: params.index, windowId: params.windowId },
          });
          return { success: true, data: res };
        }

        if (action === "group") {
          const tabIds = resolveTabIds(params);
          if (tabIds.length === 0) {
            return { success: false, error: 'tabs_manage action "group" 需要提供 tabIds 或 tabId' };
          }
          const res = await rpc.request("tabs.group", { tabIds, groupId: params.groupId });
          return { success: true, data: res };
        }

        if (action === "ungroup") {
          const tabIds = resolveTabIds(params);
          if (tabIds.length === 0) {
            return { success: false, error: 'tabs_manage action "ungroup" 需要提供 tabIds 或 tabId' };
          }
          const res = await rpc.request("tabs.ungroup", { tabIds });
          return { success: true, data: res };
        }

        return { success: false, error: "未知的操作类型: " + String(action) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
  };
}

/** 接受 tabIds 数组，或在只给出 tabId 时将其包装为单元素数组。 */
function resolveTabIds(params: Record<string, unknown>): number[] {
  if (Array.isArray(params.tabIds)) {
    return params.tabIds as number[];
  }
  if (typeof params.tabId === "number") {
    return [params.tabId];
  }
  return [];
}

export function createTabsRemoveTool(rpc: IJsonRpcClient): ToolDefinition {
  const preflight = async (params: Record<string, unknown>): Promise<PreflightResult> => {
    const tabIds = (params.tabIds ?? []) as number[];
    const results = await Promise.allSettled(
      tabIds.map((id) =>
        rpc.request("tabs.get", { tabId: id }) as Promise<{ id?: number; title?: string; url?: string }>
      )
    );

    const affectedObjects = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => {
        const tab = (r as PromiseFulfilledResult<{ id?: number; title?: string; url?: string }>).value;
        return {
          type: "tab" as const,
          id: String(tab.id ?? ""),
          title: tab.title,
          url: tab.url,
          reason: "即将关闭此标签页",
        };
      });

    const warnings: string[] = [];
    if (tabIds.length > 5) {
      warnings.push(`正在批量关闭 ${tabIds.length} 个标签页，请确认操作。`);
    }

    return { affectedObjects, warnings };
  };

  return {
    name: "tabs_remove",
    description: "关闭一个或多个标签页。高风险操作，需用户确认。",
    category: "tabs",
    riskLevel: "high",
    confirmationRequired: true,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabIds: {
          type: "array",
          items: { type: "number" },
          description: "要关闭的标签页 ID 列表",
        },
      },
      required: ["tabIds"],
    },
    requireBackground: true,
    preflight,
    execute: async (params) => {
      await rpc.request("tabs.remove", params);
      return { success: true };
    },
  };
}
