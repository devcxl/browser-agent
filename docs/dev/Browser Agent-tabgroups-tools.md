# 开发文档: T11 - TabGroups 工具集

**Project:** Browser Agent
**Task ID:** T11
**Slug:** tabgroups-tools
**Issue:** #11
**类型:** backend
**Batch:** 4
**依赖:** T2 (Browser Adapter), T6 (Tool Registry), T7 (Capability Detector), T8 (Background Infra)

## 1. 目标

实现 2 个 TabGroups 工具定义：`tabGroups_query`、`tabGroups_update`。由于 Firefox 不支持 TabGroups API，工具注册必须经过 Capability-based 条件判断——仅在 Chrome 环境下注册。

## 2. 前置条件

- T2: `IBrowserAdapter` 接口就绪
- T6: `IToolRegistry` 接口及 `ToolRegistry` 实现完成
- T7: `CapabilityDetector` 完成（用于判断 `tabGroups` 能力）
- T8: Background GroupsProxy 和 JSON-RPC Router 完成，`tabGroups.*` RPC 方法可用

## 3. 实现步骤

### 3.1 工具定义汇总

- **文件:** `src/tools/tabgroups/tabgroups-tools.ts`

| 工具名 | 风险等级 | 需确认 | preflight | 说明 |
|--------|----------|--------|-----------|------|
| `tabGroups_query` | low | 否 | 无 | 查询所有或指定条件的标签分组 |
| `tabGroups_update` | medium | 否 | 无 | 更新标签分组的属性（名称、颜色、折叠状态） |

### 3.2 完整实现

```ts
// src/tools/tabgroups/tabgroups-tools.ts
import type { ToolDefinition } from "../../registry/types";
import type { IJsonRpcClient } from "../../shared/jsonrpc/types";

export function createTabGroupsQueryTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabGroups_query",
    description:
      "查询浏览器中所有标签分组（Tab Groups）。可按标题、颜色、窗口等条件过滤。返回分组列表，包含分组 ID、标题、颜色、折叠状态和所属窗口。",
    category: "tabGroups",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        queryInfo: {
          type: "object",
          description: "标签分组查询条件",
          properties: {
            collapsed: {
              type: "boolean",
              description: "是否已折叠的分组",
            },
            color: {
              type: "string",
              enum: [
                "grey", "blue", "red", "yellow", "green",
                "pink", "purple", "cyan", "orange",
              ],
              description: "分组颜色",
            },
            title: {
              type: "string",
              description: "分组标题（精确匹配）",
            },
            windowId: {
              type: "number",
              description: "所属窗口 ID",
            },
          },
        },
      },
    },
    requireBackground: true,
    execute: async (params) => {
      const groups = await rpc.request("tabGroups.query", params as any);
      return { success: true, data: groups };
    },
  };
}

export function createTabGroupsUpdateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "tabGroups_update",
    description:
      "更新指定标签分组的属性，包括标题、颜色和折叠/展开状态。注意：颜色仅支持 Chrome 内置的 9 种颜色。",
    category: "tabGroups",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        groupId: {
          type: "number",
          description: "要更新的分组 ID",
        },
        updateProperties: {
          type: "object",
          description: "更新属性（至少提供一个）",
          properties: {
            collapsed: {
              type: "boolean",
              description: "是否折叠分组（true=折叠，false=展开）",
            },
            color: {
              type: "string",
              enum: [
                "grey", "blue", "red", "yellow", "green",
                "pink", "purple", "cyan", "orange",
              ],
              description: "分组颜色",
            },
            title: {
              type: "string",
              description: "分组新标题（设为空字符串可清除标题）",
            },
          },
        },
      },
      required: ["groupId", "updateProperties"],
    },
    requireBackground: true,
    execute: async (params) => {
      const group = await rpc.request("tabGroups.update", params as any);
      return { success: true, data: group };
    },
  };
}
```

### 3.3 工具集注册入口（含 Capability 判断）

- **文件:** `src/tools/tabgroups/index.ts`

```ts
import type { IJsonRpcClient } from "../../shared/jsonrpc/types";
import type { ToolDefinition } from "../../registry/types";
import {
  createTabGroupsQueryTool,
  createTabGroupsUpdateTool,
} from "./tabgroups-tools";

export function createTabGroupsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createTabGroupsQueryTool(rpc),
    createTabGroupsUpdateTool(rpc),
  ];
}
```

### 3.4 工具注册到 Registry（条件注册）

- **文件:** `src/tools/index.ts`

```ts
import type { IToolRegistry } from "../registry/types";
import type { IJsonRpcClient } from "../shared/jsonrpc/types";
import { createTabsTools } from "./tabs";
import { createWindowsTools } from "./windows";
import { createTabGroupsTools } from "./tabgroups";

export async function registerAllTools(
  registry: IToolRegistry,
  rpc: IJsonRpcClient,
): Promise<void> {
  // Tabs 和 Windows 工具：双浏览器通用，直接注册
  registry.registerAll(createTabsTools(rpc));
  registry.registerAll(createWindowsTools(rpc));

  // TabGroups 工具：仅 Chrome 支持，Firefox 不注册
  const capabilities = await rpc.request("capability.detect") as { tabGroups: boolean };
  if (capabilities.tabGroups) {
    registry.registerAll(createTabGroupsTools(rpc));
  }
}
```

## 4. 接口/契约

### 4.1 工具 Schema 关键字段

| 工具 | 必需参数 | 可选参数 |
|------|----------|----------|
| `tabGroups_query` | 无 | `queryInfo.collapsed`, `queryInfo.color`, `queryInfo.title`, `queryInfo.windowId` |
| `tabGroups_update` | `groupId`, `updateProperties` | `updateProperties.collapsed`, `updateProperties.color`, `updateProperties.title` |

### 4.2 颜色枚举

两个工具的 color 字段均使用 Chrome TabGroups API 定义的 9 种颜色：

```ts
type TabGroupColor =
  | "grey" | "blue" | "red" | "yellow" | "green"
  | "pink" | "purple" | "cyan" | "orange";
```

### 4.3 工具注册条件

```
if (capabilities.tabGroups === true) → 注册 tabGroups_query, tabGroups_update
if (capabilities.tabGroups === false) → 不注册任何 tabGroups 工具
```

## 5. 测试指引

### 5.1 单元测试

- **文件:** `src/tools/tabgroups/__tests__/tabgroups-tools.test.ts`
- **测试框架:** Vitest + mock `IJsonRpcClient`

**测试场景：**

1. **2 个工具全部成功创建**
   - 调用 `createTabGroupsTools(rpc)`
   - 预期：返回数组长度为 2

2. **tabGroups_query 正常执行**
   - Mock `rpc.request("tabGroups.query", ...)` 返回预设分组数组
   - 调用 `execute({ queryInfo: { collapsed: false } })`
   - 预期：`result.success === true`，`result.data` 为分组数组

3. **tabGroups_update 正常执行**
   - Mock `rpc.request("tabGroups.update", ...)` 返回更新后的分组对象
   - 调用 `execute({ groupId: 1, updateProperties: { title: "Work", color: "blue" } })`
   - 预期：`result.success === true`，`result.data` 包含更新后的分组

4. **Chrome 环境下注册正常**
   - Mock `rpc.request("capability.detect")` 返回 `{ tabGroups: true }`
   - 调用 `registerAllTools(registry, rpc)`
   - 预期：`registry.getToolsByCategory("tabGroups").length === 2`

5. **Firefox 环境下不注册**
   - Mock `rpc.request("capability.detect")` 返回 `{ tabGroups: false }`
   - 调用 `registerAllTools(registry, rpc)`
   - 预期：`registry.getToolsByCategory("tabGroups").length === 0`

6. **所有工具的 category 正确**
   - 遍历所有工具
   - 预期：所有工具的 `category === "tabGroups"`

7. **颜色枚举正确**
   - 检查 `tabGroups_query` 和 `tabGroups_update` 的 schema 中 color 的 enum
   - 预期：包含全部 9 种颜色

8. **tabGroups_update 的 required 参数**
   - 检查 schema.required
   - 预期：包含 `"groupId"` 和 `"updateProperties"`

9. **风险等级验证**
   - `tabGroups_query`: `riskLevel === "low"`, `confirmationRequired === false`
   - `tabGroups_update`: `riskLevel === "medium"`, `confirmationRequired === false`

10. **工具在注册表中可正确卸载**
    - 注册后调用 `registry.unregisterCategory("tabGroups")`
    - 预期：`registry.getToolsByCategory("tabGroups").length === 0`

## 6. 验收标准

- [ ] Chrome 环境下 2 个工具正常注册到 Tool Registry
- [ ] Firefox 环境下 tabGroups 工具不注册（`getToolsByCategory("tabGroups")` 返回空数组）
- [ ] `tabGroups_query` 执行正常，返回分组列表
- [ ] `tabGroups_update` 执行正常，支持更新标题、颜色、折叠状态
- [ ] 单元测试覆盖 Chrome 和 Firefox 两种环境的注册逻辑

## 7. 注意事项

1. **Capability 判断时机**：`registerAllTools` 改为 `async` 函数，因为需要先通过 RPC 获取 Capabilities。这意味着工具注册变为异步操作，Chat Page 初始化时需要 `await registerAllTools(registry, rpc)`。

2. **Firefox 完全不可用**：Firefox 不提供 `tabGroups` API。工具不注册意味着 LLM 根本看不到这些工具，不会产生无效的 tool_call。这是最干净的降级策略。

3. **tabs.group vs tabGroups**：`tabs_group`（T9 中的工具）调用 `tabs.group()` API 创建/加入分组，`tabGroups_query` / `tabGroups_update` 操作分组本身的属性。两者功能互补：
   - `tabs_group`: 把 tab 放入分组（需要 tabIds）
   - `tabGroups_query`: 查询分组列表
   - `tabGroups_update`: 修改分组名称/颜色/折叠

4. **tabs_group 在 Firefox 中的行为**：虽然 `tabs_group` 工具在 T9 中被注册（因为 category 为 "tabs" 而非 "tabGroups"），但在 Firefox 中 `tabs.group()` API 不存在，会导致执行失败。建议后续在 T9 中也增加 Capability 判断，或由 Guardrail 拦截。

5. **颜色枚举与 Chrome 版本**：`TabGroupColor` 的 9 种颜色是 Chrome 当前版本支持的全部颜色。未来 Chrome 可能增加新颜色，需要同步更新 schema 的 enum。

6. **tabGroups_update 不支持移动**：Chrome 的 `tabGroups.update()` 不支持修改 `windowId`（移动分组到其他窗口）。如需移动分组，需要使用 `tabGroups.move()` API，当前阶段未实现，后续可添加 `tabGroups_move` 工具。

7. **工具数量少但独立成模块**：TabGroups 工具只有 2 个，但仍独立成模块（`src/tools/tabgroups/`），原因是：
   - 与其他工具集保持一致的目录结构
   - 后续可能添加 `tabGroups_move`、`tabGroups_create` 等工具
   - 条件注册逻辑集中管理更清晰
