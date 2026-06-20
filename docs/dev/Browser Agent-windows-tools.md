# 开发文档: T10 - Windows 工具集

**Project:** Browser Agent
**Task ID:** T10
**Slug:** windows-tools
**Issue:** #10
**类型:** backend
**Batch:** 4
**依赖:** T2 (Browser Adapter), T6 (Tool Registry), T7 (Capability Detector), T8 (Background Infra)

## 1. 目标

实现 4 个 Windows 工具定义并注册到 Tool Registry：`windows_getAll`、`windows_get`、`windows_create`、`windows_remove`。其中 `windows_remove` 为高风险工具，preflight 返回窗口内标签页列表。

## 2. 前置条件

- T2: `IBrowserAdapter` 接口就绪
- T6: `IToolRegistry` 接口及 `ToolRegistry` 实现完成
- T7: `CapabilityDetector` 完成（windows 能力始终为 true）
- T8: Background WindowsProxy 和 JSON-RPC Router 完成，`windows.*` RPC 方法可用

## 3. 实现步骤

### 3.1 工具定义汇总

- **文件:** `src/tools/windows/windows-tools.ts`

| 工具名 | 风险等级 | 需确认 | preflight | 说明 |
|--------|----------|--------|-----------|------|
| `windows_getAll` | low | 否 | 无 | 获取所有窗口列表 |
| `windows_get` | low | 否 | 无 | 获取单个窗口详情 |
| `windows_create` | medium | 否 | 无 | 创建新窗口 |
| `windows_remove` | high | 是 | 有 | 关闭窗口，preflight 返回窗口内所有 tab 列表 |

### 3.2 完整实现

```ts
// src/tools/windows/windows-tools.ts
import type { ToolDefinition, PreflightResult } from "../../registry/types";
import type { IJsonRpcClient } from "../../shared/jsonrpc/types";

export function createWindowsGetAllTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "windows_getAll",
    description: "获取当前浏览器所有窗口的列表。可选择是否包含标签页信息。",
    category: "windows",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        getInfo: {
          type: "object",
          description: "窗口查询选项",
          properties: {
            populate: { type: "boolean", description: "是否在窗口对象中填充 tabs 属性" },
            windowTypes: {
              type: "array",
              items: { type: "string", enum: ["normal", "popup", "panel", "devtools"] },
              description: "要返回的窗口类型列表",
            },
          },
        },
      },
    },
    requireBackground: true,
    execute: async (params) => {
      const windows = await rpc.request("windows.getAll", params as any);
      return { success: true, data: windows };
    },
  };
}

export function createWindowsGetTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "windows_get",
    description: "获取指定窗口的详细信息，包括尺寸、位置、状态和其中的标签页列表。",
    category: "windows",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        windowId: { type: "number", description: "窗口 ID" },
        getInfo: {
          type: "object",
          description: "窗口查询选项",
          properties: {
            populate: { type: "boolean", description: "是否填充 tabs 属性" },
            windowTypes: {
              type: "array",
              items: { type: "string", enum: ["normal", "popup", "panel", "devtools"] },
            },
          },
        },
      },
      required: ["windowId"],
    },
    requireBackground: true,
    execute: async (params) => {
      const window = await rpc.request("windows.get", params as any);
      return { success: true, data: window };
    },
  };
}

export function createWindowsCreateTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "windows_create",
    description: "创建一个新的浏览器窗口。可指定 URL、尺寸、位置、类型（普通/弹窗/面板）等。",
    category: "windows",
    riskLevel: "medium",
    confirmationRequired: false,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        createData: {
          type: "object",
          description: "窗口创建参数",
          properties: {
            url: {
              oneOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } },
              ],
              description: "要在新窗口中打开的 URL 或 URL 列表",
            },
            tabId: { type: "number", description: "要移动到新窗口的标签页 ID" },
            left: { type: "number", description: "窗口左边缘距屏幕左边的像素数" },
            top: { type: "number", description: "窗口上边缘距屏幕顶部的像素数" },
            width: { type: "number", description: "窗口宽度（像素）" },
            height: { type: "number", description: "窗口高度（像素）" },
            focused: { type: "boolean", description: "是否聚焦新窗口，默认 true" },
            incognito: { type: "boolean", description: "是否隐身模式" },
            type: { type: "string", enum: ["normal", "popup", "panel"], description: "窗口类型" },
            state: {
              type: "string",
              enum: ["normal", "minimized", "maximized", "fullscreen"],
              description: "窗口初始状态",
            },
          },
        },
      },
    },
    requireBackground: true,
    execute: async (params) => {
      const window = await rpc.request("windows.create", params as any);
      return { success: true, data: window };
    },
  };
}

export function createWindowsRemoveTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: "windows_remove",
    description: "关闭指定的浏览器窗口及其中的所有标签页。关闭前会展示窗口内的标签页列表供用户确认。",
    category: "windows",
    riskLevel: "high",
    confirmationRequired: true,
    resultSensitivity: "low",
    schema: {
      type: "object",
      properties: {
        windowId: { type: "number", description: "要关闭的窗口 ID" },
      },
      required: ["windowId"],
    },
    requireBackground: true,
    preflight: async (params) => {
      const { windowId } = params as { windowId: number };
      const affectedObjects: PreflightResult["affectedObjects"] = [];
      const warnings: string[] = [];

      try {
        // 查询窗口中的所有标签页
        const tabs = await rpc.request("tabs.query", {
          queryInfo: { windowId },
        }) as Array<{ id?: number; title?: string; url?: string }>;

        if (tabs.length === 0) {
          warnings.push("该窗口中没有标签页");
        } else {
          for (const tab of tabs) {
            affectedObjects.push({
              type: "tab",
              id: String(tab.id),
              title: tab.title,
              url: tab.url,
              reason: "此标签页将随窗口一起关闭",
            });
          }
          if (tabs.length > 5) {
            warnings.push(`窗口关闭将影响 ${tabs.length} 个标签页，请确认`);
          }
        }

        // 获取窗口信息
        try {
          const win = await rpc.request("windows.get", { windowId }) as any;
          affectedObjects.push({
            type: "window",
            id: String(win.id),
            title: win.title,
            reason: "此窗口将被关闭",
          });
        } catch {
          affectedObjects.push({
            type: "window",
            id: String(windowId),
            reason: "此窗口将被关闭（无法获取详情）",
          });
        }
      } catch (err) {
        warnings.push("无法获取窗口内标签页信息：" + (err instanceof Error ? err.message : "未知错误"));
        affectedObjects.push({
          type: "window",
          id: String(windowId),
          reason: "此窗口将被关闭",
        });
      }

      return { affectedObjects, warnings };
    },
    execute: async (params) => {
      await rpc.request("windows.remove", params as any);
      return { success: true };
    },
  };
}
```

### 3.3 工具集注册入口

- **文件:** `src/tools/windows/index.ts`

```ts
import type { IJsonRpcClient } from "../../shared/jsonrpc/types";
import type { ToolDefinition } from "../../registry/types";
import {
  createWindowsGetAllTool,
  createWindowsGetTool,
  createWindowsCreateTool,
  createWindowsRemoveTool,
} from "./windows-tools";

export function createWindowsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createWindowsGetAllTool(rpc),
    createWindowsGetTool(rpc),
    createWindowsCreateTool(rpc),
    createWindowsRemoveTool(rpc),
  ];
}
```

### 3.4 工具注册到 Registry

在 `src/tools/index.ts` 中添加：

```ts
import { createWindowsTools } from "./windows";

export function registerAllTools(
  registry: IToolRegistry,
  rpc: IJsonRpcClient,
): void {
  registry.registerAll(createTabsTools(rpc));
  registry.registerAll(createWindowsTools(rpc));  // ← 新增
}
```

## 4. 接口/契约

### 4.1 工具 Schema 关键字段

| 工具 | 必需参数 | 可选参数 |
|------|----------|----------|
| `windows_getAll` | 无 | `getInfo.populate`, `getInfo.windowTypes` |
| `windows_get` | `windowId` | `getInfo.populate`, `getInfo.windowTypes` |
| `windows_create` | 无 | `createData.url`, `createData.tabId`, `createData.left`, `createData.top`, `createData.width`, `createData.height`, `createData.focused`, `createData.incognito`, `createData.type`, `createData.state` |
| `windows_remove` | `windowId` | 无 |

### 4.2 Preflight 契约

`windows_remove` 的 preflight 返回：

```ts
interface PreflightResult {
  affectedObjects: Array<
    | { type: "tab"; id: string; title?: string; url?: string; reason: string }
    | { type: "window"; id: string; title?: string; reason: string }
  >;
  warnings: string[];
}
```

**典型响应示例：**
```json
{
  "affectedObjects": [
    { "type": "tab", "id": "42", "title": "GitHub", "url": "https://github.com", "reason": "此标签页将随窗口一起关闭" },
    { "type": "tab", "id": "43", "title": "Google", "url": "https://google.com", "reason": "此标签页将随窗口一起关闭" },
    { "type": "window", "id": "5", "title": "Window 5", "reason": "此窗口将被关闭" }
  ],
  "warnings": []
}
```

## 5. 测试指引

### 5.1 单元测试

- **文件:** `src/tools/windows/__tests__/windows-tools.test.ts`
- **测试框架:** Vitest + mock `IJsonRpcClient`

**测试场景：**

1. **4 个工具全部成功创建**
   - 调用 `createWindowsTools(rpc)`
   - 预期：返回数组长度为 4

2. **windows_getAll 正常执行**
   - Mock `rpc.request("windows.getAll", ...)` 返回预设窗口数组
   - 调用 `execute`
   - 预期：`result.success === true`，`result.data` 为窗口数组

3. **windows_get 正常执行**
   - Mock `rpc.request("windows.get", { windowId: 1 })` 返回预设窗口
   - 调用 `execute({ windowId: 1 })`
   - 预期：返回正确窗口对象

4. **windows_create 正常执行**
   - Mock `rpc.request("windows.create", ...)` 返回新窗口对象
   - 调用 `execute({ createData: { url: "https://example.com" } })`
   - 预期：返回新窗口对象

5. **windows_remove preflight 返回窗口内 tab 列表**
   - Mock `rpc.request("tabs.query", { queryInfo: { windowId: 1 } })` 返回 3 个 tab
   - Mock `rpc.request("windows.get", { windowId: 1 })` 返回窗口信息
   - 调用 `preflight!({ windowId: 1 })`
   - 预期：`affectedObjects` 包含 3 个 tab + 1 个 window，共 4 个对象

6. **windows_remove preflight 空窗口**
   - Mock `rpc.request("tabs.query", ...)` 返回空数组
   - 预期：`warnings` 包含 "该窗口中没有标签页"

7. **windows_remove preflight 容错**
   - Mock `rpc.request("tabs.query", ...)` 抛异常
   - 预期：preflight 不崩溃，返回 `affectedObjects` 至少包含 window 对象，`warnings` 包含错误信息

8. **windows_remove 正常执行**
   - Mock `rpc.request("windows.remove", ...)` 返回 void
   - 调用 `execute({ windowId: 1 })`
   - 预期：`result.success === true`

9. **高风险工具属性验证**
   - 检查 `windows_remove.confirmationRequired === true`
   - 检查 `windows_remove.riskLevel === "high"`
   - 检查 `windows_remove.preflight` 不为 undefined

10. **所有工具的 category 正确**
    - 遍历所有工具
    - 预期：所有工具的 `category === "windows"`

## 6. 验收标准

- [ ] 4 个工具全部成功注册到 Tool Registry
- [ ] `windows_getAll` / `windows_get` / `windows_create` 执行正常
- [ ] `windows_remove` 为高风险工具，`confirmationRequired: true`
- [ ] `windows_remove` preflight 正确返回窗口内所有标签页列表
- [ ] preflight 容错：窗口/tab 查询失败时不崩溃
- [ ] 单元测试覆盖所有 4 个工具

## 7. 注意事项

1. **windows_remove preflight 依赖 tabs.query**：preflight 中调用 `rpc.request("tabs.query", { queryInfo: { windowId } })` 获取窗口内标签页。这要求 Background 的 `tabs.query` RPC 方法正常工作。

2. **preflight 中的 affectedObjects 混合类型**：`windows_remove` 的 preflight 同时返回 `type: "tab"` 和 `type: "window"` 两种 affectedObject，确认 UI 需要能渲染这两种类型的对象。

3. **windows_create 的 url 参数**：支持单个 URL 字符串或 URL 数组。`oneOf` 在 OpenAI Function Calling 中可能不完全支持，如果 LLM 解析出问题，可改为只接受字符串（多 URL 场景由 Agent 拆分为多次 `tabs_create`）。

4. **Firefox 兼容性**：`windows` API 在 Chrome 和 Firefox 中都完整支持，无需 Capability-based 条件注册。但 `windows_create` 中 `type: "panel"` 在 Firefox 中可能表现不同。

5. **关闭当前窗口**：如果用户尝试关闭包含 Chat Page 的窗口，可能导致扩展页面关闭。当前阶段不做特殊处理，后续可增加保护逻辑（检测 windowId 是否为当前窗口，给出额外警告）。

6. **preflight 性能**：`windows_remove` 的 preflight 需要 2 次 RPC 调用（tabs.query + windows.get），如果窗口内有大量标签页（>100），tabs.query 返回的数据量可能较大。当前阶段不做分页处理。
