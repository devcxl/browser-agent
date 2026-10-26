import type { ToolDefinition, PreflightResult } from "../../shared/types";
import type { IJsonRpcClient } from "../../shared/types";
import { sanitizeTab, sanitizeTabs } from "../tab-sanitize";

/** RPC 返回的原始标签页结构（字段可选，取决于来源） */
interface RpcTab {
  id?: number;
  title?: string;
  url?: string;
  [key: string]: unknown;
}

/**
 * 按关键词过滤标签页：对 title 与 url 做大小写不敏感的子串匹配。
 * 浏览器原生 query 只支持匹配模式，子串过滤在工具层完成对模型更直观。
 */
function matchesKeyword(tab: RpcTab, keyword: string): boolean {
  const needle = keyword.toLowerCase();
  return (
    (tab.title ?? "").toLowerCase().includes(needle)
    || (tab.url ?? "").toLowerCase().includes(needle)
  );
}

/** 查询当前窗口的活跃标签页；失败返回 undefined */
async function getActiveTab(rpc: IJsonRpcClient): Promise<RpcTab | undefined> {
  const tabs = (await rpc.request("tabs.query", {
    queryInfo: { active: true, currentWindow: true },
  })) as RpcTab[];
  return tabs[0];
}

/**
 * tab_search：查找标签页。
 * 支持按 tabId 精确查、按关键词/URL/状态筛选；无任何条件时返回当前窗口全部标签页。
 * 结果不含图标等 UI 字段。
 */
export function createTabSearchTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tab_search",
    description:
      "查找标签页。三种用法：① 提供 tabId 精确获取该标签页；② 提供 keyword（匹配标题或 URL）或 active/pinned/windowId 等条件筛选；③ 都不提供时返回当前窗口的全部标签页。需要针对用户当前正在看的页面操作时，用 active: true 定位当前标签页。",
    category: "tabs",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "sensitive",
    schema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "按 ID 精确获取单个标签页" },
        keyword: { type: "string", description: "关键词，对标题和 URL 做包含匹配" },
        url: { type: "string", description: "按 URL 子串筛选" },
        active: { type: "boolean", description: "true 时定位当前窗口正在显示的标签页" },
        pinned: { type: "boolean", description: "按固定状态筛选" },
        windowId: { type: "number", description: "按窗口 ID 筛选" },
        currentWindow: { type: "boolean", description: "限定当前窗口（默认按此行为兜底）" },
      },
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        if (typeof params.tabId === "number") {
          const tab = await rpc.request("tabs.get", { tabId: params.tabId });
          return { success: true, data: sanitizeTab(tab as Record<string, unknown>) };
        }

        const queryInfo: Record<string, unknown> = {};
        if (typeof params.active === "boolean") queryInfo.active = params.active;
        if (typeof params.pinned === "boolean") queryInfo.pinned = params.pinned;
        if (typeof params.windowId === "number") queryInfo.windowId = params.windowId;
        if (params.currentWindow === true) queryInfo.currentWindow = true;
        if (Object.keys(queryInfo).length === 0) queryInfo.currentWindow = true;

        let tabs = (await rpc.request("tabs.query", { queryInfo })) as RpcTab[];
        if (typeof params.keyword === "string" && params.keyword.length > 0) {
          tabs = tabs.filter((tab) => matchesKeyword(tab, params.keyword as string));
        }
        if (typeof params.url === "string" && params.url.length > 0) {
          const urlNeedle = params.url;
          tabs = tabs.filter((tab) => (tab.url ?? "").toLowerCase().includes(urlNeedle.toLowerCase()));
        }
        return { success: true, data: sanitizeTabs(tabs as Array<Record<string, unknown>>) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
  };
}

/**
 * tab_open：在新标签页打开 URL。
 */
export function createTabOpenTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tab_open",
    description:
      "在新标签页打开 URL。默认在当前窗口并立即激活；传 active: false 可在后台打开，pinned 可固定，windowId/index 控制位置。",
    category: "tabs",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "要打开的 URL" },
        active: { type: "boolean", description: "是否立即激活（默认 true）" },
        pinned: { type: "boolean", description: "是否固定标签页" },
        windowId: { type: "number", description: "目标窗口 ID，默认当前窗口" },
        index: { type: "number", description: "插入位置索引" },
      },
      required: ["url"],
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        const tab = await rpc.request("tabs.create", {
          createProperties: {
            url: params.url,
            active: params.active,
            pinned: params.pinned,
            windowId: params.windowId,
            index: params.index,
          },
        });
        return { success: true, data: sanitizeTab(tab as Record<string, unknown>) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
  };
}

/**
 * tab_navigate：让已有标签页跳转到 URL；tabId 缺省时操作当前标签页。
 */
export function createTabNavigateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tab_navigate",
    description:
      "让标签页跳转到指定 URL。不提供 tabId 时操作当前正在显示的标签页；需要在后台标签页跳转时提供 tabId（可用 tab_search 查到）。",
    category: "tabs",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "目标 URL" },
        tabId: { type: "number", description: "目标标签页 ID，缺省为当前标签页" },
      },
      required: ["url"],
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        let tabId = params.tabId;
        if (typeof tabId !== "number") {
          const active = await getActiveTab(rpc);
          if (typeof active?.id !== "number") {
            return { success: false, error: "无法确定当前活动标签页" };
          }
          tabId = active.id;
        }
        const tab = await rpc.request("tabs.update", {
          tabId,
          updateProperties: { url: params.url },
        });
        return { success: true, data: sanitizeTab(tab as Record<string, unknown>) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
  };
}

/**
 * tab_focus：切换到指定标签页。
 */
export function createTabFocusTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tab_focus",
    description: "切换（激活）指定标签页，使其成为所在窗口的当前显示页。",
    category: "tabs",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "要切换到的标签页 ID" },
      },
      required: ["tabId"],
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        const tab = await rpc.request("tabs.update", {
          tabId: params.tabId,
          updateProperties: { active: true },
        });
        return { success: true, data: sanitizeTab(tab as Record<string, unknown>) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
  };
}

/**
 * tab_set：修改标签页属性（固定 / 静音 / 位置）。
 */
export function createTabSetTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tab_set",
    description:
      "修改标签页的属性：固定/取消固定（pinned）、静音/取消静音（muted）、移动位置（index）。至少提供一个要修改的字段。",
    category: "tabs",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "目标标签页 ID" },
        pinned: { type: "boolean", description: "是否固定" },
        muted: { type: "boolean", description: "是否静音" },
        index: { type: "number", description: "移动到目标窗口中的位置索引" },
        windowId: { type: "number", description: "移动到其他窗口时的目标窗口 ID" },
      },
      required: ["tabId"],
    },
    requireBackground: true,
    execute: async (params) => {
      try {
        const { tabId, pinned, muted, index, windowId } = params;
        const updateProperties: Record<string, unknown> = {};
        if (typeof pinned === "boolean") updateProperties.pinned = pinned;
        if (typeof muted === "boolean") updateProperties.muted = muted;

        let tab: RpcTab | undefined;
        if (Object.keys(updateProperties).length > 0) {
          tab = (await rpc.request("tabs.update", { tabId, updateProperties })) as RpcTab;
        }
        if (typeof index === "number") {
          const moved = await rpc.request("tabs.move", {
            tabIds: [tabId],
            moveProperties: { index, windowId },
          });
          tab = (Array.isArray(moved) ? moved[0] : moved) as RpcTab;
        }
        if (!tab) {
          return { success: false, error: "tab_set 需要至少提供 pinned / muted / index 之一" };
        }
        return { success: true, data: sanitizeTab(tab as Record<string, unknown>) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
  };
}

/**
 * tab_close：关闭标签页（高风险，保留 preflight 供确认弹窗展示受影响对象）。
 */
export function createTabCloseTool(rpc: IJsonRpcClient): ToolDefinition {
  const preflight = async (params: Record<string, unknown>): Promise<PreflightResult> => {
    const tabIds = (params.tabIds ?? []) as number[];
    const results = await Promise.allSettled(
      tabIds.map((id) =>
        rpc.request("tabs.get", { tabId: id }) as Promise<RpcTab>
      )
    );

    const affectedObjects = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => {
        const tab = (r as PromiseFulfilledResult<RpcTab>).value;
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
    name: "tab_close",
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
