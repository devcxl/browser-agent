# 开发文档: T9 - Tabs 工具集

**Project:** Browser Agent
**Task ID:** T9
**Slug:** tabs-tools
**Issue:** #9
**类型:** backend
**Batch:** 4
**依赖:** T2 (Browser Adapter), T6 (Tool Registry), T7 (Capability Detector), T8 (Background Infra)

## 1. 目标

实现 8 个 Tabs 工具定义并注册到 Tool Registry：`tabs_query`、`tabs_get`、`tabs_create`、`tabs_update`、`tabs_remove`、`tabs_move`、`tabs_group`、`tabs_ungroup`。高风险工具实现 preflight 函数。

## 2. 前置条件

- T2: `IBrowserAdapter` 接口就绪
- T6: `IToolRegistry` 接口及 `ToolRegistry` 实现完成
- T7: `CapabilityDetector` 完成（tabs 能力始终为 true，无特殊依赖）
- T8: Background Proxy 和 JSON-RPC Router 完成，`tabs.*` RPC 方法可用

## 3. 实现步骤

### 3.1 工具定义汇总

- **文件:** `src/tools/tabs/tabs-tools.ts`
- **关键逻辑:** 每个工具导出 `ToolDefinition` 对象，`execute` 通过 JSON-RPC Client 调用 Background 的对应方法

| 工具名 | 风险等级 | 需确认 | preflight | 说明 |
|--------|----------|--------|-----------|------|
| `tabs_query` | low | 否 | 无 | 查询标签页 |
| `tabs_get` | low | 否 | 无 | 获取单个标签页详情 |
| `tabs_create` | medium | 否 | 无 | 创建新标签页 |
| `tabs_update` | medium | 否 | 无 | 更新标签页属性 |
| `tabs_remove` | high | 是 | 有 | 关闭标签页 |
| `tabs_move` | medium | 否 | 无 | 移动标签页 |
| `tabs_group` | medium | 否 | 无 | 分组标签页 |
| `tabs_ungroup` | medium | 否 | 无 | 取消分组 |

### 3.2 工厂函数模式

每个工具通过工厂函数创建，接收 `IJsonRpcClient` 作为依赖：

```ts
// src/tools/tabs/tabs-tools.ts
import type { ToolDefinition, PreflightResult } from "../../registry/types";
import type { IJsonRpcClient } from "../../shared/jsonrpc/types";

export function createTabsQueryTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_query",
    description: "查询当前浏览器中所有匹配条件的标签页。可按 URL、标题、窗口、激活状态等条件过滤。",
    category: "tabs",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        queryInfo: {
          type: "object",
          description: "标签页查询条件",
          properties: {
            active: { type: "boolean", description: "是否活跃标签页" },
            pinned: { type: "boolean", description: "是否固定标签页" },
            audible: { type: "boolean", description: "是否正在播放音频" },
            muted: { type: "boolean", description: "是否已静音" },
            highlighted: { type: "boolean", description: "是否高亮选中" },
            currentWindow: { type: "boolean", description: "是否在当前窗口" },
            lastFocusedWindow: { type: "boolean", description: "是否在最后聚焦的窗口" },
            status: { type: "string", enum: ["loading", "complete"], description: "加载状态" },
            title: { type: "string", description: "按标题匹配（支持通配符 *）" },
            url: { type: "string", description: "按 URL 匹配（支持通配符 * 和 <all_urls> 模式）" },
            windowId: { type: "number", description: "指定窗口 ID" },
            windowType: { type: "string", enum: ["normal", "popup", "panel", "devtools"], description: "窗口类型" },
          },
        },
      },
    },
    requireBackground: true,
    execute: async (params) => {
      const tabs = await rpc.request("tabs.query", params as any);
      return { success: true, data: tabs };
    },
  };
}

export function createTabsGetTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_get",
    description: "获取指定标签页的详细信息，包括标题、URL、图标、加载状态等。",
    category: "tabs",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "标签页 ID" },
      },
      required: ["tabId"],
    },
    requireBackground: true,
    execute: async (params) => {
      const tab = await rpc.request("tabs.get", params as any);
      return { success: true, data: tab };
    },
  };
}

export function createTabsCreateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_create",
    description: "创建一个新的浏览器标签页。可指定 URL、窗口、位置、是否激活等。",
    category: "tabs",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        createProperties: {
          type: "object",
          description: "创建属性",
          properties: {
            url: { type: "string", description: "标签页初始 URL" },
            active: { type: "boolean", description: "是否激活新标签页，默认 true" },
            pinned: { type: "boolean", description: "是否固定标签页" },
            windowId: { type: "number", description: "目标窗口 ID" },
            index: { type: "number", description: "插入位置索引" },
            openerTabId: { type: "number", description: "关联的打开者标签页 ID" },
          },
        },
      },
    },
    requireBackground: true,
    execute: async (params) => {
      const tab = await rpc.request("tabs.create", params as any);
      return { success: true, data: tab };
    },
  };
}

export function createTabsUpdateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_update",
    description: "更新指定标签页的属性，如 URL、激活状态、静音状态、固定状态等。",
    category: "tabs",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "标签页 ID" },
        updateProperties: {
          type: "object",
          description: "更新属性",
          properties: {
            url: { type: "string", description: "新的 URL" },
            active: { type: "boolean", description: "是否激活" },
            pinned: { type: "boolean", description: "是否固定" },
            muted: { type: "boolean", description: "是否静音" },
            highlighted: { type: "boolean", description: "是否高亮" },
            openerTabId: { type: "number", description: "关联的打开者标签页 ID" },
          },
        },
      },
      required: ["tabId"],
    },
    requireBackground: true,
    execute: async (params) => {
      const tab = await rpc.request("tabs.update", params as any);
      return { success: true, data: tab };
    },
  };
}

export function createTabsRemoveTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_remove",
    description: "关闭一个或多个标签页。关闭前会展示受影响的标签页列表供用户确认。",
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
    preflight: async (params) => {
      const { tabIds } = params as { tabIds: number[] };
      const affectedObjects: PreflightResult["affectedObjects"] = [];

      for (const tabId of tabIds) {
        try {
          const tab = await rpc.request("tabs.get", { tabId }) as any;
          affectedObjects.push({
            type: "tab",
            id: String(tab.id),
            title: tab.title,
            url: tab.url,
            reason: "此标签页将被关闭",
          });
        } catch {
          affectedObjects.push({
            type: "tab",
            id: String(tabId),
            reason: "此标签页将被关闭（无法获取详情）",
          });
        }
      }

      return {
        affectedObjects,
        warnings: tabIds.length > 5 ? [`将关闭 ${tabIds.length} 个标签页，请确认`] : [],
      };
    },
    execute: async (params) => {
      const result = await rpc.request("tabs.remove", params as any) as any;
      return { success: true, data: result };
    },
  };
}

export function createTabsMoveTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_move",
    description: "将一个或多个标签页移动到指定窗口的指定位置。",
    category: "tabs",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabIds: { type: "array", items: { type: "number" }, description: "要移动的标签页 ID 列表" },
        moveProperties: {
          type: "object",
          description: "移动目标",
          properties: {
            windowId: { type: "number", description: "目标窗口 ID，省略则移动到新窗口" },
            index: { type: "number", description: "目标位置索引，-1 表示末尾" },
          },
          required: ["index"],
        },
      },
      required: ["tabIds", "moveProperties"],
    },
    requireBackground: true,
    execute: async (params) => {
      const tabs = await rpc.request("tabs.move", params as any);
      return { success: true, data: tabs };
    },
  };
}

export function createTabsGroupTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_group",
    description: "将多个标签页添加到同一分组。可指定已有分组 ID 或创建新分组。",
    category: "tabs",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabIds: { type: "array", items: { type: "number" }, description: "要分组的标签页 ID 列表" },
        groupId: { type: "number", description: "已有分组 ID，省略则创建新分组" },
        createProperties: {
          type: "object",
          description: "创建新分组时的属性",
          properties: {
            windowId: { type: "number", description: "目标窗口 ID" },
          },
        },
      },
      required: ["tabIds"],
    },
    requireBackground: true,
    execute: async (params) => {
      const result = await rpc.request("tabs.group", params as any);
      return { success: true, data: result };
    },
  };
}

export function createTabsUngroupTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabs_ungroup",
    description: "将指定标签页从其所在分组中移出。",
    category: "tabs",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        tabIds: { type: "array", items: { type: "number" }, description: "要取消分组的标签页 ID 列表" },
      },
      required: ["tabIds"],
    },
    requireBackground: true,
    execute: async (params) => {
      await rpc.request("tabs.ungroup", params as any);
      return { success: true };
    },
  };
}
```

### 3.3 工具集注册入口

- **文件:** `src/tools/tabs/index.ts`
- **关键逻辑:** 统一创建并导出所有 tabs 工具

```ts
import type { IJsonRpcClient } from "../../shared/jsonrpc/types";
import type { ToolDefinition } from "../../registry/types";
import {
  createTabsQueryTool,
  createTabsGetTool,
  createTabsCreateTool,
  createTabsUpdateTool,
  createTabsRemoveTool,
  createTabsMoveTool,
  createTabsGroupTool,
  createTabsUngroupTool,
} from "./tabs-tools";

export function createTabsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createTabsQueryTool(rpc),
    createTabsGetTool(rpc),
    createTabsCreateTool(rpc),
    createTabsUpdateTool(rpc),
    createTabsRemoveTool(rpc),
    createTabsMoveTool(rpc),
    createTabsGroupTool(rpc),
    createTabsUngroupTool(rpc),
  ];
}
```

### 3.4 工具注册到 Registry

- **文件:** `src/tools/index.ts`（工具总注册入口）
- **关键逻辑:** 聚合所有工具集，统一注册到 ToolRegistry

```ts
import type { IToolRegistry } from "../registry/types";
import type { IJsonRpcClient } from "../shared/jsonrpc/types";
import { createTabsTools } from "./tabs";

export function registerAllTools(
  registry: IToolRegistry,
  rpc: IJsonRpcClient,
): void {
  // Tabs 工具：tabs 能力始终可用，直接注册
  registry.registerAll(createTabsTools(rpc));

  // 后续阶段在此添加其他工具集：
  // registry.registerAll(createWindowsTools(rpc));
  // if (capabilities.tabGroups) registry.registerAll(createTabGroupsTools(rpc));
}
```

## 4. 接口/契约

### 4.1 工具 Schema（关键）

每个工具的 `schema` 字段定义了 OpenAI Function Calling 的 `parameters` 格式。调用方（LLM）根据 schema 生成 tool_call 参数。

### 4.2 Preflight 契约

`tabs_remove` 的 preflight 返回：

```ts
interface PreflightResult {
  affectedObjects: Array<{
    type: "tab";
    id: string;      // tabId 转 string
    title?: string;
    url?: string;
    reason: string;  // "此标签页将被关闭"
  }>;
  warnings: string[];
}
```

## 5. 测试指引

### 5.1 单元测试

- **文件:** `src/tools/tabs/__tests__/tabs-tools.test.ts`
- **测试框架:** Vitest + mock `IJsonRpcClient`

**测试场景：**

1. **8 个工具全部成功创建**
   - 调用 `createTabsTools(rpc)`
   - 预期：返回数组长度为 8

2. **tabs_query 正常执行**
   - Mock `rpc.request("tabs.query", ...)` 返回假数据
   - 调用 `tabs_query.execute({ queryInfo: { active: true } })`
   - 预期：`result.success === true`，`result.data` 等于 mock 数据

3. **tabs_remove preflight 返回影响列表**
   - Mock `rpc.request("tabs.get", ...)` 返回预设 tab 信息
   - 调用 `tabs_remove.preflight!({ tabIds: [1, 2, 3] })`
   - 预期：`affectedObjects.length === 3`，每个对象包含 `type: "tab"`、`id`、`title`、`url`、`reason`

4. **tabs_remove preflight 批量警告**
   - 传入 10 个 tabIds
   - 预期：`warnings` 包含 "将关闭 10 个标签页" 的提示

5. **tabs_remove preflight 容错**
   - Mock 某个 `tabs.get` 抛异常
   - 预期：preflight 不崩溃，affectedObjects 中该 tab 只有 id 和 reason，无 title/url

6. **所有工具的 category 正确**
   - 遍历所有工具
   - 预期：所有工具的 `category === "tabs"`

7. **高风险工具 confirmationRequired 为 true**
   - 检查 `tabs_remove`
   - 预期：`confirmationRequired === true`

8. **低风险工具 confirmationRequired 为 false**
   - 检查 `tabs_query`、`tabs_get`
   - 预期：`confirmationRequired === false`

9. **schema.required 正确**
   - 检查 `tabs_remove` 的 schema.required 包含 `"tabIds"`
   - 检查 `tabs_get` 的 schema.required 包含 `"tabId"`

## 6. 验收标准

- [ ] 8 个工具全部成功注册到 Tool Registry
- [ ] `tabs_query` / `tabs_get` / `tabs_create` / `tabs_update` / `tabs_move` / `tabs_group` / `tabs_ungroup` 执行正常
- [ ] `tabs_remove` 为高风险工具，`confirmationRequired: true`
- [ ] `tabs_remove` 的 preflight 正确返回受影响标签页列表（含 title、url、reason）
- [ ] preflight 在获取 tab 详情失败时不会崩溃（容错）
- [ ] 单元测试覆盖所有 8 个工具的基本执行路径

## 7. 注意事项

1. **RPC 调用统一**：所有 `execute` 和 `preflight` 函数通过 `IJsonRpcClient.request()` 调用 Background，不直接调用 `browser.tabs.*` API。这是因为 Tool 定义在 Chat Page 上下文，没有直接访问浏览器 API 的权限。

2. **错误处理**：当前实现中 `execute` 和 `preflight` 不包裹 try/catch，异常会由 Tool Registry 的调用方（Agent Runtime）捕获并转换为 `ToolResult { success: false, error }`。

3. **preflight 性能**：`tabs_remove` 的 preflight 逐个查询 tab 详情，如果 tabIds 数量很大（>50），可能较慢。当前阶段不做批量优化，后续可考虑并行查询。

4. **tabs_group vs tabs_ungroup**：这两个工具仅 Chrome 支持。虽然 Tabs 工具集不依赖 CapabilityDetector（因为 tabs 基础 API 双浏览器都支持），但 `tabs.group` 和 `tabs.ungroup` 在 Firefox 中会失败。工具仍然注册（category 为 "tabs"），由 Guardrail 或调用方根据 Capabilities 决定是否展示给 LLM。

5. **tabs_create 风险等级**：设为 medium 而非 low，因为创建标签页可能触发导航到恶意 URL。后续 Guardrail 可增加 URL 安全检查。

6. **工厂函数模式**：使用工厂函数而非直接导出对象，是为了注入 `IJsonRpcClient` 依赖。这使单元测试更容易 mock。
