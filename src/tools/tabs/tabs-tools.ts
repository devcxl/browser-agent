import type { ToolDefinition, PreflightResult } from "../../shared/types";
import type { IJsonRpcClient } from "../../shared/types";

export function createTabsQueryTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_query",
    description: "查询当前浏览器中所有匹配条件的标签页。",
    category: "tabs",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        queryInfo: {
          type: "object",
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
      const tabs = await rpc.request("tabs.query", {
        queryInfo: params.queryInfo ?? {},
      });
      return { success: true, data: tabs };
    },
  };
}

export function createTabsGetTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_get",
    description: "获取单个标签页的详细信息。",
    category: "tabs",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "要查询的标签页 ID" },
      },
      required: ["tabId"],
    },
    requireBackground: true,
    execute: async (params) => {
      const tab = await rpc.request("tabs.get", params);
      return { success: true, data: tab };
    },
  };
}

export function createTabsCreateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_create",
    description: "创建新标签页并返回其详情。",
    category: "tabs",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        createProperties: {
          type: "object",
          properties: {
            url: { type: "string", description: "新标签页的 URL" },
            active: { type: "boolean", description: "是否立即激活" },
            pinned: { type: "boolean", description: "是否固定" },
            windowId: { type: "number", description: "所属窗口 ID" },
            index: { type: "number", description: "插入位置" },
            openerTabId: { type: "number", description: "开启者标签页 ID" },
          },
        },
      },
      required: ["createProperties"],
    },
    requireBackground: true,
    execute: async (params) => {
      const tab = await rpc.request("tabs.create", params);
      return { success: true, data: tab };
    },
  };
}

export function createTabsUpdateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_update",
    description: "更新标签页的属性（URL、激活状态、固定状态等）。",
    category: "tabs",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "要更新的标签页 ID" },
        updateProperties: {
          type: "object",
          properties: {
            url: { type: "string" },
            active: { type: "boolean" },
            pinned: { type: "boolean" },
            muted: { type: "boolean" },
            highlighted: { type: "boolean" },
          },
        },
      },
      required: ["tabId", "updateProperties"],
    },
    requireBackground: true,
    execute: async (params) => {
      const tab = await rpc.request("tabs.update", params);
      return { success: true, data: tab };
    },
  };
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

export function createTabsMoveTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_move",
    description: "移动一个或多个标签页到指定窗口和位置。",
    category: "tabs",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabIds: {
          type: "array",
          items: { type: "number" },
          description: "要移动的标签页 ID 列表",
        },
        moveProperties: {
          type: "object",
          properties: {
            windowId: { type: "number", description: "目标窗口 ID" },
            index: { type: "number", description: "目标位置索引" },
          },
        },
      },
      required: ["tabIds", "moveProperties"],
    },
    requireBackground: true,
    execute: async (params) => {
      const tabs = await rpc.request("tabs.move", params);
      return { success: true, data: tabs };
    },
  };
}

export function createTabsGroupTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_group",
    description: "将一个或多个标签页分组。可指定已有分组 ID 或创建新分组。",
    category: "tabs",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabIds: {
          type: "array",
          items: { type: "number" },
          description: "要分组的标签页 ID 列表",
        },
        groupId: {
          type: "number",
          description: "已有分组 ID（可选，不传则创建新分组）",
        },
        createProperties: {
          type: "object",
          properties: {
            windowId: { type: "number", description: "创建新分组的窗口 ID" },
          },
        },
      },
      required: ["tabIds"],
    },
    requireBackground: true,
    execute: async (params) => {
      const result = await rpc.request("tabs.group", params);
      return { success: true, data: result };
    },
  };
}

export function createTabsUngroupTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_ungroup",
    description: "将一个或多个标签页从分组中移除。",
    category: "tabs",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabIds: {
          type: "array",
          items: { type: "number" },
          description: "要取消分组的标签页 ID 列表",
        },
      },
      required: ["tabIds"],
    },
    requireBackground: true,
    execute: async (params) => {
      await rpc.request("tabs.ungroup", params);
      return { success: true };
    },
  };
}
