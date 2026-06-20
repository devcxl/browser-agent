# 开发文档: T6 - Tool Registry 核心实现

**Project:** Browser Agent
**Task ID:** T6
**Slug:** tool-registry
**Issue:** #6
**类型:** backend
**Batch:** 3
**依赖:** T2 (Browser Adapter), T5 (JSON-RPC 通信层)

## 1. 目标

实现 `IToolRegistry` 接口，作为工具定义的唯一事实来源，支持工具注册、查询、按类别过滤、导出 OpenAI Tool Schema、Capability-based 条件注册。

## 2. 前置条件

- T2: `src/adapters/` 模块完成 — `IBrowserAdapter` 接口及 `ChromeAdapter`/`FirefoxAdapter` 实现就绪
- T5: `src/shared/jsonrpc/` 模块完成 — `IJsonRpcClient` 接口及 Port 实现就绪
- T1: WXT 项目骨架初始化完成，`src/` 目录结构就绪

## 3. 实现步骤

### 3.1 类型定义

- **文件:** `src/registry/types.ts`
- **关键逻辑:** 定义 `RiskLevel`、`ToolCategory`、`SensitivityLevel`、`ToolDefinition`、`ToolResult`、`PreflightResult`、`PreflightAffectedObject`、`IToolRegistry` 等类型

```ts
// 核心类型（参考 docs/design/Browser Agent.md 4.2.1 节）

type RiskLevel = "low" | "medium" | "high" | "critical";

type ToolCategory =
  | "tabs" | "windows" | "tabGroups" | "bookmarks" | "history"
  | "downloads" | "sessions" | "page" | "cookies" | "storage"
  | "clipboard" | "notifications" | "contextMenus" | "sidePanel"
  | "alarms" | "expert";

type SensitivityLevel = "low" | "sensitive" | "critical";

interface ToolDefinition {
  name: string;
  description: string;
  schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  category: ToolCategory;
  riskLevel: RiskLevel;
  confirmationRequired: boolean;
  resultSensitivity: SensitivityLevel;
  expertOnly?: boolean;
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
  preflight?: (params: Record<string, unknown>) => Promise<PreflightResult>;
  requireBackground?: boolean;
  requireContentScript?: boolean;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  sensitivityMap?: Record<string, SensitivityLevel>;
}

interface PreflightResult {
  affectedObjects: PreflightAffectedObject[];
  warnings: string[];
}

interface PreflightAffectedObject {
  type: "tab" | "window" | "bookmark" | "history" | "download" | "cookie" | "page";
  id?: string;
  title?: string;
  url?: string;
  reason?: string;
}

interface IToolRegistry {
  register(tool: ToolDefinition): void;
  registerAll(tools: ToolDefinition[]): void;
  getAllTools(): ToolDefinition[];
  getTool(name: string): ToolDefinition | undefined;
  getToolsByCategory(category: ToolCategory): ToolDefinition[];
  toOpenAISchema(): OpenAIToolSchema[];
  unregisterCategory(category: ToolCategory): void;
}
```

### 3.2 主实现

- **文件:** `src/registry/tool-registry.ts`
- **关键逻辑:**
  1. 内部使用 `Map<string, ToolDefinition>` 存储工具，key 为 `name`
  2. `register()`: 插入 Map，如 name 已存在则覆盖（幂等注册）
  3. `registerAll()`: 遍历数组调用 `register()`
  4. `getAllTools()`: 返回 Map 的 values 数组（展开为独立引用，防止外部修改）
  5. `getTool(name)`: Map.get() 查找
  6. `getToolsByCategory(category)`: 遍历 Map 过滤 category 匹配的条目
  7. `toOpenAISchema()`: 遍历 Map，将每个 ToolDefinition 转换为 OpenAI Function Schema 格式
  8. `unregisterCategory(category)`: 删除 Map 中所有 category 匹配的条目

```ts
class ToolRegistry implements IToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    tools.forEach(t => this.register(t));
  }

  getAllTools(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getToolsByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAllTools().filter(t => t.category === category);
  }

  toOpenAISchema(): OpenAIToolSchema[] {
    return this.getAllTools().map(t => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.schema,
      },
    }));
  }

  unregisterCategory(category: ToolCategory): void {
    for (const [name, tool] of this.tools) {
      if (tool.category === category) this.tools.delete(name);
    }
  }
}
```

### 3.3 模块导出

- **文件:** `src/registry/index.ts`
- **关键逻辑:** 统一导出类型和实现

```ts
export { ToolRegistry } from "./tool-registry";
export type {
  RiskLevel, ToolCategory, SensitivityLevel,
  ToolDefinition, ToolResult, PreflightResult,
  PreflightAffectedObject, IToolRegistry, OpenAIToolSchema,
} from "./types";
```

### 3.4 OpenAI Tool Schema 格式

- **文件:** `src/registry/types.ts`（追加）
- **关键逻辑:** 定义 `OpenAIToolSchema` 接口

```ts
interface OpenAIToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
        items?: { type: string };
      }>;
      required?: string[];
    };
  };
}
```

## 4. 接口/契约

### 4.1 新增接口

| 接口 | 位置 | 说明 |
|------|------|------|
| `IToolRegistry` | `src/registry/types.ts` | Tool Registry 抽象接口 |
| `ToolDefinition` | `src/registry/types.ts` | 工具定义数据结构 |
| `OpenAIToolSchema` | `src/registry/types.ts` | OpenAI Function Calling Schema 格式 |
| `ToolRegistry` | `src/registry/tool-registry.ts` | 接口实现 |

### 4.2 依赖关系

```
registry/ → shared/（仅依赖基础类型，无其他模块依赖）
```

## 5. 测试指引

### 5.1 单元测试

- **文件:** `src/registry/__tests__/tool-registry.test.ts`
- **测试框架:** Vitest

**测试场景：**

1. **register 基本注册**
   - 注册一个 mock 工具，通过 `getTool` 验证可查到
   - 预期：`getTool(name)` 返回注册的工具定义

2. **registerAll 批量注册**
   - 注册 3 个工具，通过 `getAllTools` 验证数量
   - 预期：`getAllTools().length === 3`

3. **同名覆盖**
   - 注册 name 相同的工具两次，验证第二次覆盖第一次
   - 预期：`getTool(name).description` 等于第二次的 description

4. **getToolsByCategory 按类别过滤**
   - 注册 tabs/windows/tabGroups 各类工具，按类别过滤
   - 预期：`getToolsByCategory("tabs")` 只返回 tabs 类工具

5. **toOpenAISchema 导出**
   - 注册多个工具，调用 `toOpenAISchema()`
   - 预期：返回数组长度与注册工具数一致，每个元素符合 `OpenAIToolSchema` 格式
   - 验证 `type === "function"`，`function.name`、`function.description`、`function.parameters` 均非空

6. **unregisterCategory 卸载**
   - 注册 tabs 和 windows 工具，卸载 tabs 类别
   - 预期：`getAllTools()` 只剩 windows 工具，tabs 工具被全部移除

7. **getTool 查无此工具**
   - 查询不存在的工具名
   - 预期：返回 `undefined`

8. **getAllTools 返回副本**
   - 调用 `getAllTools()`，修改返回数组，再次调用
   - 预期：两次调用返回的数组内容一致（内部数据未被外部修改影响）

9. **空注册表**
   - 新建注册表实例，调用 `getAllTools()`、`toOpenAISchema()`
   - 预期：返回空数组 `[]`

10. **幂等 unregisterCategory**
    - 对不存在的类别调用 `unregisterCategory`
    - 预期：不抛异常，注册表不变

**目标覆盖率：>80%**

## 6. 验收标准

- [ ] `register()` / `registerAll()` 正常注册工具
- [ ] `getAllTools()` 返回全部已注册工具
- [ ] `getTool(name)` 按名称正确查找
- [ ] `getToolsByCategory(category)` 按类别正确过滤
- [ ] `toOpenAISchema()` 输出符合 OpenAI Function Schema 格式
- [ ] `unregisterCategory(category)` 正确卸载指定类别
- [ ] 单元测试覆盖率 >80%

## 7. 注意事项

1. **线程安全**：Tool Registry 运行在 Chat Page 上下文（渲染进程），单线程执行，无需加锁。
2. **不可变导出**：`getAllTools()` 返回的数组应为浅拷贝，防止外部修改内部状态。
3. **Schema 缓存**：`toOpenAISchema()` 在工具注册/卸载后 Schema 自动变化，当前阶段无需缓存，后续 T3 阶段的 Context Builder 会缓存 Schema。
4. **Capability-based 注册**：Tool Registry 本身不负责判断浏览器能力，由调用方（工具注册入口）在 `registerAll` 前根据 `CapabilityDetector` 结果过滤。例如 TabGroups 工具在 Firefox 环境下根本不会调用 `register()`。
5. **错误处理**：`execute` 和 `preflight` 函数可能抛异常，调用方需要用 try/catch 包裹并转换为 `ToolResult { success: false, error: "..." }`。Registry 本身不处理执行错误。
