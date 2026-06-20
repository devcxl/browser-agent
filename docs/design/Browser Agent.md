# 技术方案: Browser Agent Extension

**日期:** 2026-06-20
**状态:** Draft
**对应 PRD:** docs/prd/Browser Agent.md

---

## 1. 需求概述

### 1.1 问题描述

构建一个运行在浏览器扩展内部的 AI Agent，用户通过自然语言与独立聊天页面交互，Agent 自动调用浏览器扩展 API 完成标签页管理、窗口操作、书签、历史记录、下载、Cookie 等浏览器数据管理任务。

### 1.2 目标用户

Power-user / Developer — 需要高效管理大量标签页和浏览器数据的用户，对隐私和安全有意识。

### 1.3 成功标准

| 指标 | 标准 |
|------|------|
| 双浏览器支持 | Chrome 121+ / Firefox 128+ 均可安装运行 |
| 工具调用延迟 | 低风险工具 <500ms 端到端（不含 LLM 推理） |
| 聊天体验 | 多会话支持，消息持久化，刷新不丢数据 |
| 安全控制 | 高风险操作 100% 经过 preflight + 用户确认 |
| 构建产物 | 单代码库 → `npm run build` 产出 Chrome/Firefox 两个 zip |

---

## 2. 技术栈

| 层级 | 技术选型 | 理由 |
|------|---------|------|
| 扩展框架 | **WXT** | 原生支持 Chrome/Firefox 双构建，TypeScript 开箱即用，MV3-first，HMR 开发体验 |
| 前端 UI | **React 18** + **TailwindCSS 4** | React 生态成熟，TailwindCSS 原子化样式减少 CSS 体积，适合扩展场景 |
| 构建工具 | WXT 内置 (Vite) | WXT 自带 Vite 构建，无需额外配置 |
| Agent Runtime | **自研轻量 Agent Loop** | 不引入 LangChain/Vercel AI SDK，避免 Node.js 依赖和包体积膨胀 |
| LLM Client | **fetch** + OpenAI-compatible API | 零依赖，支持 OpenAI / Ollama / llama-server / 任意兼容端点 |
| 内部通信 | **JSON-RPC 2.0** over `browser.runtime.connect()` | 统一协议，支持双向请求/通知，跨 chat/background/content 一致 |
| 存储-配置 | `chrome.storage.local` | 浏览器原生，同步读取，适合配置数据 |
| 存储-持久化 | **IndexedDB** (via `idb` 库) | 大容量异步存储，适合聊天记录/日志 |
| 浏览器适配 | **自定义 Adapter 接口** | Chrome/Firefox API 差异通过接口抽象，运行时按 `navigator.userAgent` 选择实现 |
| 类型系统 | TypeScript 5.x strict | 全链路类型安全 |
| 代码规范 | ESLint + Prettier | 统一代码风格 |
| 测试 | Vitest + Playwright | 单元测试 + E2E 浏览器测试 |

### 2.1 技术选型理由详述

**为什么用 WXT 而非手写构建：**
- 自动生成 Chrome/Firefox 双 manifest，处理 `manifest.json` 差异
- 内置 HMR，开发时修改代码即时生效
- 内置 zip 打包，CI 友好
- 社区活跃，维护积极

**为什么自研 Agent Loop 而非 LangChain/Vercel AI SDK：**
- LangChain.js 体积大（~500KB+），且依赖 Node.js 模块（如 `crypto`、`fs`），不适合浏览器扩展
- Vercel AI SDK 虽支持 edge runtime，但核心抽象过重，引入不必要的复杂度
- Agent 逻辑本身简单：构造上下文 → 调用 LLM → 解析 tool_call → 执行 → 循环，~200 行即可

**为什么 React 而非 Preact/Solid：**
- React 生态丰富，UI 组件库（如 shadcn/ui 的 tailwind 变体）可直接复用
- 聊天页面作为独立扩展页面加载，非 content script，包体积敏感度较低
- 团队熟悉 React

---

## 3. 架构设计

### 3.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser Agent Extension                      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Chat Page (extension page: chat.html)                     │  │
│  │                                                             │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │  Chat UI    │  │ Agent Runtime │  │  LLM Provider    │  │  │
│  │  │  (React)    │  │  (Agent Loop) │  │  Client          │  │  │
│  │  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘  │  │
│  │         │                │                     │            │  │
│  │         │    ┌───────────┴───────────┐         │            │  │
│  │         │    │    Tool Registry      │         │            │  │
│  │         │    │  (唯一事实来源)         │         │            │  │
│  │         │    └───────────┬───────────┘         │            │  │
│  │         │                │                     │            │  │
│  │         │    ┌───────────┴───────────┐         │            │  │
│  │         │    │      Guardrail        │         │            │  │
│  │         │    │  (风险检查 + Preflight) │         │            │  │
│  │         │    └───────────┬───────────┘         │            │  │
│  │         │                │                     │            │  │
│  │  ┌──────┴──────┐  ┌──────┴───────┐            │            │  │
│  │  │ Confirmation│  │ Conversation │            │            │  │
│  │  │ UI          │  │ Manager      │            │            │  │
│  │  └─────────────┘  └──────────────┘            │            │  │
│  │                                                             │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │              JSON-RPC Client (Port)                  │   │  │
│  │  └──────────────────────┬───────────────────────────────┘   │  │
│  └─────────────────────────┼──────────────────────────────────┘  │
│                            │                                     │
│  ┌─────────────────────────┼──────────────────────────────────┐  │
│  │  Background (service_worker / background script)            │  │
│  │                         │                                    │  │
│  │  ┌──────────────────────┴───────────────────────────────┐   │  │
│  │  │              JSON-RPC Router                         │   │  │
│  │  └──┬──────────┬──────────┬──────────┬─────────────────┘   │  │
│  │     │          │          │          │                      │  │
│  │  ┌──┴──┐  ┌───┴───┐  ┌──┴───┐  ┌───┴────────┐             │  │
│  │  │ Tabs│  │Windows│  │Groups│  │Capability   │             │  │
│  │  │ API │  │ API   │  │ API  │  │Detector     │             │  │
│  │  │Proxy│  │Proxy  │  │Proxy │  │             │             │  │
│  │  └─────┘  └───────┘  └──────┘  └─────────────┘             │  │
│  │                                                             │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │  Event Listeners (tabs/windows/tabGroups)             │   │  │
│  │  │  防抖 → 推送状态变更到 Chat Page                       │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  │                                                             │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │  Content Script Bridge (消息转发)                     │   │  │
│  │  └──────────────────────┬───────────────────────────────┘   │  │
│  └─────────────────────────┼──────────────────────────────────┘  │
│                            │                                     │
│  ┌─────────────────────────┼──────────────────────────────────┐  │
│  │  Content Script (注入到每个页面)                             │  │
│  │                         │                                    │  │
│  │  ┌──────────────────────┴───────────────────────────────┐   │  │
│  │  │              JSON-RPC Handler                        │   │  │
│  │  └──┬──────────────┬──────────────┬─────────────────────┘   │  │
│  │     │              │              │                          │  │
│  │  ┌──┴──────┐  ┌───┴────┐  ┌──────┴──────┐                   │  │
│  │  │Readability│ │Selection│  │Page Actions │                   │  │
│  │  │(正文提取)  │ │Reader  │  │(click/fill) │                   │  │
│  │  └──────────┘  └────────┘  └─────────────┘                   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Storage                                                   │  │
│  │  ┌─────────────────────────┐  ┌────────────────────────┐  │  │
│  │  │ chrome.storage.local    │  │  IndexedDB             │  │  │
│  │  │ - Provider 配置          │  │  - 聊天消息             │  │  │
│  │  │ - Agent 设置             │  │  - Tool call 日志       │  │  │
│  │  │ - Expert Mode 设置       │  │  - 操作摘要             │  │  │
│  │  │ - 权限开关               │  │  - Tab/Window 快照      │  │  │
│  │  └─────────────────────────┘  └────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 模块划分与职责

| 模块 | 所在环境 | 职责 | 关键类型/接口 |
|------|---------|------|-------------|
| **Chat UI** | Chat Page | React 聊天界面、消息渲染、确认弹窗、设置面板 | `ChatPage`, `MessageBubble`, `ConfirmDialog` |
| **Agent Runtime** | Chat Page | Agent 主循环：构造上下文 → 调 LLM → 解析 → 执行 Tool → 循环 | `AgentLoop`, `ContextBuilder` |
| **LLM Provider Client** | Chat Page | 封装 fetch 调用 OpenAI-compatible API，流式/非流式 | `LlmClient`, `StreamChunk` |
| **Tool Registry** | Chat Page | 工具定义存储、查询、Capability-based 注册 | `ToolRegistry`, `ToolDefinition` |
| **Guardrail** | Chat Page | 风险检查、Preflight 编排、确认流程 | `Guardrail`, `PreflightRunner` |
| **Conversation Manager** | Chat Page | 多会话 CRUD、消息管理、摘要触发 | `ConversationManager`, `Conversation` |
| **JSON-RPC Client** | Chat Page | 与 Background 通信的 Port 客户端 | `JsonRpcClient` |
| **JSON-RPC Router** | Background | 路由 JSON-RPC 请求到对应 handler | `JsonRpcRouter` |
| **Browser API Proxy** | Background | 封装 `browser.tabs/windows/tabGroups` API | `TabsProxy`, `WindowsProxy`, `GroupsProxy` |
| **Event Listener** | Background | 监听浏览器事件，防抖后推送状态变更 | `BrowserEventHub` |
| **Content Script Bridge** | Background | 转发 Chat Page 请求到 Content Script | `ContentBridge` |
| **Capability Detector** | Background | 检测浏览器能力（API 可用性） | `CapabilityDetector` |
| **Content Script** | Content Script | 页面正文提取、选中文本、DOM 操作 | `ReadabilityExtractor`, `SelectionReader` |
| **Browser Adapter** | 全环境 | 抽象 Chrome/Firefox API 差异 | `BrowserAdapter`, `ChromeAdapter`, `FirefoxAdapter` |
| **Storage** | Chat Page / Background | 配置存储（storage.local）+ 持久化存储（IndexedDB） | `ConfigStore`, `Database` |

### 3.3 数据流向

#### 3.3.1 工具调用完整链路

```
用户输入 "关闭所有 YouTube 标签页"
    │
    ▼
Chat UI → Agent Runtime.run()
    │
    ├─ 1. ContextBuilder 构建上下文
    │     - system prompt
    │     - ToolRegistry.getAllTools() → OpenAI tool schema 列表
    │     - ConversationManager.getRecentMessages(20)
    │     - SummaryManager.getSummary()
    │     - BrowserContextProvider.getLowSensitivityContext()
    │       → 通过 JSON-RPC 请求 Background 获取当前 tabs/windows 信息
    │
    ├─ 2. LlmClient.chat(messages, tools)
    │     → fetch POST https://api.openai.com/v1/chat/completions
    │     ← { role: "assistant", tool_calls: [{ name: "tabs_query", args: { url: "*youtube.com*" } }] }
    │
    ├─ 3. Agent Runtime 解析 tool_calls
    │     → Guardrail.check("tabs_query", args)
    │     → riskLevel = "low" → 直接执行
    │
    ├─ 4. ToolRegistry.execute("tabs_query", { url: "*youtube.com*" })
    │     → JSON-RPC Client 发送 request 到 Background
    │     → Background 调用 browser.tabs.query({ url: "*youtube.com*" })
    │     ← 返回 tab 列表 [{ id: 1, title: "YouTube - ...", url: "https://..." }]
    │
    ├─ 5. 结果注入 LLM 上下文，继续循环
    │     → LlmClient.chat(messages + tool_result, tools)
    │     ← { tool_calls: [{ name: "tabs_remove", args: { tabIds: [1, 2, 3] } }] }
    │
    ├─ 6. Guardrail.check("tabs_remove", { tabIds: [1,2,3] })
    │     → riskLevel = "high" → 必须 preflight
    │     → PreflightRunner.run("tabs_remove", args)
    │       → Background 查询每个 tab 的 title/url
    │       ← { affectedObjects: [{ type: "tab", id: "1", title: "...", url: "..." }, ...], warnings: [] }
    │     → Confirmation UI 展示影响清单
    │     → 用户点击"确认"
    │
    ├─ 7. ToolRegistry.execute("tabs_remove", { tabIds: [1,2,3] })
    │     → 执行关闭
    │     ← { success: true, removedCount: 3 }
    │
    └─ 8. Agent Runtime 继续循环 → LLM 生成最终文本回复
          → "已关闭 3 个 YouTube 标签页"
          → ConversationManager.saveMessage()
          → Chat UI 渲染
```

#### 3.3.2 浏览器事件 → UI 更新

```
浏览器事件 (tabs.onRemoved)
    │
    ▼
Background: Event Listener 捕获
    │
    ├─ 防抖 500ms（批量合并事件）
    │
    ├─ 全量查询当前状态: browser.tabs.query({}), browser.windows.getAll()
    │
    ├─ 构造 BrowserState 快照
    │
    └─ JSON-RPC 通知 → Chat Page
        │
        ▼
Chat Page: Event Handler 更新内存 currentWorkspaceState
    │
    ▼
Chat UI: 订阅 currentWorkspaceState 的组件 re-render
```

---

## 4. 模块拆分

### 4.1 模块列表及依赖关系

```
chat/                 依赖 → agent/, guardrail/, registry/, provider/, conversation/, shared/
agent/                依赖 → provider/, registry/, guardrail/, shared/
guardrail/            依赖 → registry/, shared/
registry/             依赖 → shared/
provider/             依赖 → shared/
conversation/         依赖 → shared/
background/           依赖 → adapters/, shared/
content/              依赖 → shared/
adapters/             依赖 → shared/
shared/               无依赖
```

### 4.2 核心模块接口定义

#### 4.2.1 Tool Registry（`src/registry/`）

```ts
// src/registry/types.ts

/** 风险等级 */
type RiskLevel = "low" | "medium" | "high" | "critical";

/** 工具类别 */
type ToolCategory =
  | "tabs"
  | "windows"
  | "tabGroups"
  | "bookmarks"
  | "history"
  | "downloads"
  | "sessions"
  | "page"
  | "cookies"
  | "storage"
  | "clipboard"
  | "notifications"
  | "contextMenus"
  | "sidePanel"
  | "alarms"
  | "expert"; // Expert Mode 专用

/** 数据敏感级别 */
type SensitivityLevel = "low" | "sensitive" | "critical";

/** Preflight 影响对象 */
interface PreflightAffectedObject {
  type: "tab" | "window" | "bookmark" | "history" | "download" | "cookie" | "page";
  id?: string;
  title?: string;
  url?: string;
  reason?: string;
}

/** Preflight 结果 */
interface PreflightResult {
  affectedObjects: PreflightAffectedObject[];
  warnings: string[];
}

/** 工具执行结果 */
interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** 返回数据中每个字段的敏感级别，用于过滤外发给 LLM 的内容 */
  sensitivityMap?: Record<string, SensitivityLevel>;
}

/** 工具定义 */
interface ToolDefinition {
  /** 唯一名称，如 "tabs_query", "tabs_remove" */
  name: string;
  /** 人类可读描述，注入 LLM system prompt */
  description: string;
  /** OpenAI Function Calling Schema */
  schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** 所属能力域 */
  category: ToolCategory;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 是否需要用户确认（high/critical 必须为 true） */
  confirmationRequired: boolean;
  /** 返回数据的默认敏感级别 */
  resultSensitivity: SensitivityLevel;
  /** Expert Mode 专用标记 */
  expertOnly?: boolean;
  /** 执行函数 */
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
  /** Preflight 函数（高风险工具必须实现） */
  preflight?: (params: Record<string, unknown>) => Promise<PreflightResult>;
  /** 是否需要 Background 代理执行 */
  requireBackground?: boolean;
  /** 是否需要 Content Script 代理执行 */
  requireContentScript?: boolean;
}

/** Tool Registry 接口 */
interface IToolRegistry {
  /** 注册工具 */
  register(tool: ToolDefinition): void;
  /** 批量注册 */
  registerAll(tools: ToolDefinition[]): void;
  /** 获取所有工具（用于生成 LLM context） */
  getAllTools(): ToolDefinition[];
  /** 按名称查找 */
  getTool(name: string): ToolDefinition | undefined;
  /** 按类别过滤 */
  getToolsByCategory(category: ToolCategory): ToolDefinition[];
  /** 导出为 OpenAI Tool Schema 格式 */
  toOpenAISchema(): OpenAIToolSchema[];
  /** 卸载某类别的所有工具 */
  unregisterCategory(category: ToolCategory): void;
}
```

#### 4.2.2 Guardrail（`src/guardrail/`）

```ts
// src/guardrail/types.ts

interface GuardrailCheck {
  /** 是否允许执行 */
  allowed: boolean;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 是否需要 preflight */
  requiresPreflight: boolean;
  /** 是否需要用户确认 */
  requiresConfirmation: boolean;
  /** 原因描述（用于 UI 展示） */
  reason: string;
  /** 数据敏感级别 */
  dataSensitivity: SensitivityLevel;
}

interface IGuardrail {
  /**
   * 检查工具调用是否允许执行
   * @param toolName 工具名称
   * @param params 调用参数
   * @param context 当前上下文（Provider 信任状态、Expert Mode 状态等）
   */
  check(
    toolName: string,
    params: Record<string, unknown>,
    context: GuardrailContext,
  ): Promise<GuardrailCheck>;
}

interface GuardrailContext {
  /** 当前 Provider 是否被标记为 local-trusted */
  isLocalTrusted: boolean;
  /** Expert Mode 是否开启 */
  expertModeEnabled: boolean;
  /** Expert Mode 子开关状态 */
  expertSwitches: Record<string, boolean>;
  /** 当前会话是否已授权敏感数据发送 */
  sessionGrants: {
    sensitiveDataAllowed: boolean;
    grantedAt?: number;
  };
}
```

#### 4.2.3 Agent Runtime（`src/agent/`）

```ts
// src/agent/types.ts

interface AgentConfig {
  /** 最大工具调用轮次，防止无限循环 */
  maxToolRounds: number;
  /** 系统提示词 */
  systemPrompt: string;
  /** 上下文窗口最大消息数 */
  maxContextMessages: number;
  /** 摘要触发阈值 */
  summaryThreshold: {
    messageCount: number;   // 默认 30
    estimatedTokens: number; // 默认 12000
    toolCallCount: number;   // 默认 50
  };
}

interface AgentRunInput {
  /** 会话 ID */
  conversationId: string;
  /** 用户消息 */
  userMessage: string;
  /** LLM Provider 配置 */
  providerConfig: ProviderConfig;
  /** 当前浏览器上下文（低敏信息） */
  browserContext: LowSensitivityContext;
  /** 中止信号 */
  abortSignal?: AbortSignal;
}

interface AgentRunOutput {
  /** 助手最终文本回复 */
  finalMessage: string;
  /** 本次运行中所有工具调用记录 */
  toolCalls: ToolCallRecord[];
  /** 消耗的 token 数（如有） */
  tokenUsage?: { prompt: number; completion: number };
}

interface ToolCallRecord {
  toolName: string;
  params: Record<string, unknown>;
  result: ToolResult;
  riskLevel: RiskLevel;
  confirmed: boolean;
  timestamp: number;
}

interface IAgentRuntime {
  /** 执行一次 Agent 运行 */
  run(input: AgentRunInput): Promise<AgentRunOutput>;
  /** 中止当前运行 */
  abort(): void;
}
```

#### 4.2.4 LLM Provider Client（`src/provider/`）

```ts
// src/provider/types.ts

interface ProviderConfig {
  id: string;
  name: string;
  /** API 端点 */
  endpoint: string;
  /** API Key */
  apiKey: string;
  /** 模型名称 */
  model: string;
  /** 是否标记为本地可信 */
  isLocalTrusted: boolean;
  /** 额外 HTTP headers */
  extraHeaders?: Record<string, string>;
  /** 请求超时 ms */
  timeoutMs?: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCallDelta[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCallDelta {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: OpenAIToolSchema[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCallDelta[];
    };
    finish_reason: "stop" | "tool_calls" | "length";
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface ILlmClient {
  /** 非流式聊天 */
  chat(request: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResponse>;
  /** 流式聊天 */
  chatStream(
    request: ChatCompletionRequest,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  /** 健康检查 */
  checkHealth(config: ProviderConfig): Promise<boolean>;
}
```

#### 4.2.5 Conversation Manager（`src/conversation/`）

```ts
// src/conversation/types.ts

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  /** 摘要（如有） */
  summary?: string;
  /** 摘要生成时的消息截止索引 */
  summaryUpToIndex?: number;
  /** 当前会话是否已授权发送敏感数据给远程 Provider */
  sensitiveDataGranted: boolean;
}

interface StoredMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  /** 工具调用信息（仅 assistant 消息可能包含） */
  toolCalls?: Array<{
    name: string;
    params: Record<string, unknown>;
    result?: string; // 只存摘要，不存原文
  }>;
  timestamp: number;
}

interface IConversationManager {
  create(title?: string): Promise<Conversation>;
  get(id: string): Promise<Conversation | undefined>;
  list(): Promise<Conversation[]>;
  update(id: string, patch: Partial<Conversation>): Promise<void>;
  delete(id: string): Promise<void>;
  addMessage(conversationId: string, message: StoredMessage): Promise<void>;
  getRecentMessages(conversationId: string, count: number): Promise<StoredMessage[]>;
  /** 生成摘要 */
  generateSummary(conversationId: string, llmClient: ILlmClient): Promise<string>;
  /** 检查是否需要生成摘要 */
  needsSummary(conversationId: string): Promise<boolean>;
}
```

#### 4.2.6 JSON-RPC 通信层（`src/shared/jsonrpc/`）

```ts
// src/shared/jsonrpc/types.ts

/** JSON-RPC 2.0 请求 */
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 响应 */
interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** JSON-RPC 2.0 通知（无 id，不期待响应） */
interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 方法处理器 */
type RpcMethodHandler = (params?: Record<string, unknown>) => Promise<unknown>;

/** JSON-RPC Client 接口 */
interface IJsonRpcClient {
  /** 发送请求并等待响应 */
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  /** 发送通知（不等待响应） */
  notify(method: string, params?: Record<string, unknown>): void;
  /** 注册方法处理器（接收对端请求） */
  onRequest(method: string, handler: RpcMethodHandler): void;
  /** 注册通知处理器 */
  onNotification(method: string, handler: (params?: Record<string, unknown>) => void): void;
  /** 断开连接 */
  disconnect(): void;
}
```

#### 4.2.7 Browser Adapter（`src/adapters/`）

```ts
// src/adapters/types.ts

interface IBrowserAdapter {
  /** 浏览器标识 */
  readonly browserType: "chrome" | "firefox";

  // Tabs
  tabs: {
    query(queryInfo: TabQueryInfo): Promise<Tab[]>;
    get(tabId: number): Promise<Tab>;
    create(createProperties: TabCreateProperties): Promise<Tab>;
    update(tabId: number, updateProperties: TabUpdateProperties): Promise<Tab>;
    remove(tabIds: number | number[]): Promise<void>;
    move(tabIds: number | number[], moveProperties: { windowId?: number; index: number }): Promise<Tab | Tab[]>;
    group(options: { tabIds: number | number[]; groupId?: number; createProperties?: { windowId?: number } }): Promise<number>;
    ungroup(tabIds: number | number[]): Promise<void>;
  };

  // Windows
  windows: {
    getAll(getInfo?: WindowGetInfo): Promise<Window[]>;
    get(windowId: number, getInfo?: WindowGetInfo): Promise<Window>;
    create(createData?: WindowCreateData): Promise<Window>;
    update(windowId: number, updateInfo: WindowUpdateInfo): Promise<Window>;
    remove(windowId: number): Promise<void>;
    getCurrent(getInfo?: WindowGetInfo): Promise<Window>;
    getLastFocused(getInfo?: WindowGetInfo): Promise<Window>;
  };

  // TabGroups (Chrome only, Firefox returns no-op)
  tabGroups: {
    query(queryInfo: TabGroupQueryInfo): Promise<TabGroup[]>;
    get(groupId: number): Promise<TabGroup>;
    update(groupId: number, updateProperties: TabGroupUpdateProperties): Promise<TabGroup>;
    move(groupId: number, moveProperties: { windowId?: number; index: number }): Promise<TabGroup>;
  };

  // ... 其他 API 域
}
```

### 4.3 数据库表结构（IndexedDB）

```ts
// src/shared/db/schema.ts

/**
 * IndexedDB 数据库: browser-agent-db
 * 版本: 1
 */

interface DbSchema {
  /** 聊天会话 */
  conversations: {
    key: string; // UUID
    value: {
      id: string;
      title: string;
      createdAt: number;    // timestamp ms
      updatedAt: number;    // timestamp ms
      summary: string | null;
      summaryUpToIndex: number; // 摘要覆盖的消息索引
      sensitiveDataGranted: boolean;
    };
    indexes: {
      byUpdatedAt: "updatedAt";
    };
  };

  /** 聊天消息 */
  messages: {
    key: string; // UUID
    value: {
      id: string;
      conversationId: string;
      role: "user" | "assistant" | "tool";
      content: string;       // 用户消息存原文，assistant/tool 存摘要
      toolCallName?: string; // tool 消息专用
      toolCallParams?: string; // JSON string
      toolCallResult?: string; // 摘要，不存敏感原文
      timestamp: number;
    };
    indexes: {
      byConversation: "conversationId";
      byConversationAndTime: ["conversationId", "timestamp"];
    };
  };

  /** Tool Call 日志（轻量，仅记录元数据） */
  toolCallLogs: {
    key: string; // UUID
    value: {
      id: string;
      conversationId: string;
      toolName: string;
      riskLevel: string;
      paramsSummary: string;  // 参数摘要，不存敏感值
      resultSummary: string;  // 结果摘要
      success: boolean;
      confirmedByUser: boolean;
      timestamp: number;
    };
    indexes: {
      byConversation: "conversationId";
    };
  };

  /** Tab/Window 快照（低敏） */
  snapshots: {
    key: string; // UUID
    value: {
      id: string;
      type: "tab" | "window" | "tabGroup";
      data: string; // JSON: { id, title, url?, windowId?, groupId? }
      capturedAt: number;
    };
    indexes: {
      byCapturedAt: "capturedAt";
    };
  };
}
```

---

## 5. 接口设计

### 5.1 JSON-RPC 方法列表

#### 5.1.1 Chat Page → Background（请求）

| 方法 | 描述 | 参数 | 返回 |
|------|------|------|------|
| `tabs.query` | 查询标签页 | `{ queryInfo: TabQueryInfo }` | `Tab[]` |
| `tabs.get` | 获取单个标签页 | `{ tabId: number }` | `Tab` |
| `tabs.create` | 创建标签页 | `{ createProperties: TabCreateProperties }` | `Tab` |
| `tabs.update` | 更新标签页 | `{ tabId: number, updateProperties: TabUpdateProperties }` | `Tab` |
| `tabs.remove` | 关闭标签页 | `{ tabIds: number[] }` | `{ removedCount: number }` |
| `tabs.move` | 移动标签页 | `{ tabIds: number[], moveProperties }` | `Tab[]` |
| `tabs.group` | 分组标签页 | `{ tabIds: number[], groupId?, createProperties? }` | `{ groupId: number }` |
| `tabs.ungroup` | 取消分组 | `{ tabIds: number[] }` | `void` |
| `windows.getAll` | 获取所有窗口 | `{ getInfo?: WindowGetInfo }` | `Window[]` |
| `windows.get` | 获取单个窗口 | `{ windowId: number }` | `Window` |
| `windows.create` | 创建窗口 | `{ createData?: WindowCreateData }` | `Window` |
| `windows.remove` | 关闭窗口 | `{ windowId: number }` | `void` |
| `tabGroups.query` | 查询分组 | `{ queryInfo: TabGroupQueryInfo }` | `TabGroup[]` |
| `tabGroups.update` | 更新分组 | `{ groupId: number, updateProperties }` | `TabGroup` |
| `browser.getState` | 获取完整浏览器状态（低敏） | `{}` | `BrowserState` |
| `capability.detect` | 检测浏览器能力 | `{}` | `Capabilities` |
| `session.save` | 保存当前会话快照 | `{ name: string }` | `{ sessionId: string }` |
| `session.restore` | 恢复会话快照 | `{ sessionId: string }` | `{ restoredCount: number }` |
| `content.execute` | 转发请求到 Content Script | `{ tabId: number, method: string, params }` | `unknown` |

#### 5.1.2 Background → Chat Page（通知/事件）

| 方法 | 描述 | 参数 |
|------|------|------|
| `browser.stateChanged` | 浏览器状态变更 | `{ state: BrowserState, changes: StateChanges }` |
| `browser.tabUpdated` | 标签页更新（UI 提示用） | `{ tab: Tab, changeInfo }` |

#### 5.1.3 Chat Page → Content Script（通过 Background 转发）

| 方法 | 描述 | 参数 | 返回 |
|------|------|------|------|
| `page.getContent` | 获取页面正文 | `{ tabId: number }` | `{ title, textContent, excerpt, byline, siteName }` |
| `page.getSelection` | 获取选中文本 | `{ tabId: number }` | `{ text: string, html?: string }` |
| `page.getMetadata` | 获取页面元数据 | `{ tabId: number }` | `{ title, url, description, ogImage }` |
| `page.click` | 点击元素 | `{ tabId: number, selector: string }` | `{ success: boolean }` |
| `page.fill` | 填充表单 | `{ tabId: number, selector: string, value: string }` | `{ success: boolean }` |

### 5.2 关键数据模型

```ts
// src/shared/types/browser.ts

interface Tab {
  id?: number;
  index: number;
  windowId: number;
  groupId: number;       // -1 表示未分组
  openerTabId?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  active: boolean;
  pinned: boolean;
  audible?: boolean;
  mutedInfo?: { muted: boolean };
  discarded: boolean;
  status?: "loading" | "complete";
  incognito: boolean;
  width?: number;
  height?: number;
}

interface Window {
  id?: number;
  focused: boolean;
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  incognito: boolean;
  type?: "normal" | "popup" | "panel" | "devtools";
  state?: "normal" | "minimized" | "maximized" | "fullscreen";
  alwaysOnTop: boolean;
  title?: string;
}

interface TabGroup {
  id: number;
  collapsed: boolean;
  color: TabGroupColor;
  title?: string;
  windowId: number;
}

type TabGroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";

/** 低敏浏览器上下文，注入 LLM */
interface LowSensitivityContext {
  currentWindow: {
    id?: number;
    tabs: Array<{
      id?: number;
      title: string;
      url: string;
      active: boolean;
      pinned: boolean;
      groupId: number;
    }>;
  };
  allWindows: Array<{
    id?: number;
    focused: boolean;
    tabCount: number;
    title?: string;
  }>;
  tabGroups: Array<{
    id: number;
    title?: string;
    color: TabGroupColor;
    tabCount: number;
  }>;
  /** 当前活跃标签页 */
  activeTab?: {
    id?: number;
    title: string;
    url: string;
    windowId: number;
  };
}

/** 完整浏览器状态（背景同步用） */
interface BrowserState {
  windows: Window[];
  tabs: Tab[];
  tabGroups: TabGroup[];
  capturedAt: number;
}

interface Capabilities {
  tabs: boolean;
  windows: boolean;
  tabGroups: boolean;
  bookmarks: boolean;
  history: boolean;
  downloads: boolean;
  cookies: boolean;
  sessions: boolean;
  scripting: boolean;
  clipboard: boolean;
  notifications: boolean;
  contextMenus: boolean;
  sidePanel: boolean;
  alarms: boolean;
  // Expert
  proxy: boolean;
  privacy: boolean;
  management: boolean;
  debugger: boolean;
  webRequest: boolean;
  declarativeNetRequest: boolean;
  nativeMessaging: boolean;
  identity: boolean;
}
```

### 5.3 OpenAI Tool Schema 格式（Tool Registry 导出）

```ts
// 单个工具的 OpenAI Schema
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
  // 扩展字段（非 OpenAI 标准，内部使用）
  "x-capability"?: ToolCategory;
  "x-risk-level"?: RiskLevel;
  "x-confirmation-required"?: boolean;
}
```

---

## 6. 实施计划

### 6.1 阶段一：基础设施（第 1-3 天）

| # | 子任务 | 产出 | 验收标准 | 依赖 |
|---|--------|------|----------|------|
| 1.1 | 初始化 WXT 项目，配置双 manifest | 项目骨架、构建脚本 | `npm run build` 产出 chrome/firefox 两个 zip | - |
| 1.2 | Browser Adapter 接口 + Chrome/Firefox 实现 | `adapters/` 模块 | Chrome/Firefox 分别调用 `browser.tabs.query({})` 返回相同结构 | - |
| 1.3 | JSON-RPC 通信层 | `shared/jsonrpc/` | Chat Page ↔ Background 成功收发 RPC 请求/响应 | 1.1 |
| 1.4 | IndexedDB 封装 | `shared/db/` | 读写 conversations/messages 表通过 CRUD 测试 | 1.1 |
| 1.5 | chrome.storage.local 封装（ConfigStore） | `shared/storage/` | 读写 Provider 配置、Agent 设置通过测试 | 1.1 |

**风险点：** WXT 对 Firefox MV3 的支持程度。**对策：** 先用 Chrome 验证，Firefox 遇到兼容性问题可降级为 MV2 background script。

### 6.2 阶段二：Tool 系统 + Guardrail（第 4-6 天）

| # | 子任务 | 产出 | 验收标准 | 依赖 |
|---|--------|------|----------|------|
| 2.1 | Tool Registry 实现 | `registry/` 模块 | 注册 10+ 工具，导出 OpenAI Schema 正确 | 1.2, 1.3 |
| 2.2 | Tabs Tools（query/create/update/remove/move/group/ungroup） | `tools/tabs/` | 每个 Tool 单独测试通过，Preflight 正确返回影响对象 | 2.1 |
| 2.3 | Windows Tools（getAll/get/create/remove） | `tools/windows/` | 同上 | 2.1 |
| 2.4 | TabGroups Tools（query/update） | `tools/tabGroups/` | Chrome 正常，Firefox 优雅降级（工具不注册） | 2.1 |
| 2.5 | Guardrail 实现 | `guardrail/` 模块 | 低/中/高/临界风险工具正确分流 | 2.1 |
| 2.6 | Capability Detector | `background/` | Chrome/Firefox 分别检测，结果正确 | 1.2 |
| 2.7 | Background JSON-RPC Router + API Proxy | `background/` | Chat Page 可通过 RPC 调用浏览器 API | 1.3, 2.2 |

**风险点：** Firefox 不支持 `tabGroups` API。**对策：** Capability Detector 标记为 false，对应 Tool 不注册。

### 6.3 阶段三：LLM Provider + Agent Runtime（第 7-9 天）

| # | 子任务 | 产出 | 验收标准 | 依赖 |
|---|--------|------|----------|------|
| 3.1 | LLM Provider Client | `provider/` 模块 | 支持 OpenAI / Ollama 端点，流式/非流式均正常 | 1.5 |
| 3.2 | Provider 配置 UI（设置面板） | `chat/` 组件 | 增删改 Provider Profile，设置默认，标记 local-trusted | 3.1 |
| 3.3 | Agent Runtime（Agent Loop） | `agent/` 模块 | 单轮工具调用正常（用户消息 → tool_call → 执行 → 回复） | 2.5, 3.1 |
| 3.4 | Context Builder | `agent/` | 注入 system prompt + tools + history + summary + 低敏上下文 | 3.3 |
| 3.5 | 摘要管理器 | `agent/` | 超过阈值自动触发摘要，摘要正确注入后续请求 | 3.4 |

**风险点：** LLM 可能产生无效 tool_call（名称不存在、参数格式错误）。**对策：** Agent Loop 捕获解析错误，反馈错误信息给 LLM 重试（最多 3 次）。

### 6.4 阶段四：聊天 UI（第 10-12 天）

| # | 子任务 | 产出 | 验收标准 | 依赖 |
|---|--------|------|----------|------|
| 4.1 | Chat Page 骨架 + 消息列表 | `chat/` React 组件 | 聊天界面渲染，消息滚动 | 1.1 |
| 4.2 | Conversation Manager | `conversation/` | 新建/切换/删除/重命名会话 | 1.4 |
| 4.3 | 消息输入 + 发送 + 流式渲染 | `chat/` | 用户输入 → Agent 运行 → 流式显示 LLM 输出 | 3.3 |
| 4.4 | 确认弹窗（Preflight 结果展示） | `chat/` | 高风险工具展示影响清单，用户确认/取消 | 2.5 |
| 4.5 | 浏览器状态实时 UI（侧边栏/面板） | `chat/` | 实时显示当前 tabs/windows，支持点击切换 | 2.7 |
| 4.6 | 设置页面（Provider/Agent/Expert Mode） | `chat/` | 完整设置表单，数据持久化 | 1.5 |

### 6.5 阶段五：Content Script + 页面工具（第 13-14 天）

| # | 子任务 | 产出 | 验收标准 | 依赖 |
|---|--------|------|----------|------|
| 5.1 | Content Script 基础框架 | `content/` | Content Script 注入成功，与 Background 通信正常 | 1.3 |
| 5.2 | Readability 集成（正文提取） | `content/` | 提取页面正文，返回标题+纯文本 | 5.1 |
| 5.3 | Selection Reader | `content/` | 读取用户选中文本 | 5.1 |
| 5.4 | Page Tools 注册到 Tool Registry | `tools/page/` | `page.getContent`、`page.getSelection`、`page.getMetadata` 可用 | 2.1, 5.2 |

### 6.6 阶段六：第二阶段能力（第 15-18 天）

| # | 子任务 | 产出 | 验收标准 | 依赖 |
|---|--------|------|----------|------|
| 6.1 | Bookmarks Tools | `tools/bookmarks/` | 搜索/创建/更新/删除书签 | 2.1 |
| 6.2 | History Tools | `tools/history/` | 搜索/删除历史记录 | 2.1 |
| 6.3 | Downloads Tools | `tools/downloads/` | 搜索/下载/清除 | 2.1 |
| 6.4 | Cookies Tools | `tools/cookies/` | 获取/设置/删除 Cookie | 2.1 |
| 6.5 | Session Tools | `tools/sessions/` | 保存/恢复标签页快照 | 2.1 |
| 6.6 | Clipboard / Notifications / Storage Tools | `tools/` | 各 Tool 单独测试通过 | 2.1 |

### 6.7 阶段七：测试 + 打包（第 19-21 天）

| # | 子任务 | 产出 | 验收标准 | 依赖 |
|---|--------|------|----------|------|
| 7.1 | 单元测试（Tool Registry / Guardrail / Agent / JSON-RPC） | `__tests__/` | 覆盖率 >70% | 全部 |
| 7.2 | E2E 测试（Playwright） | `e2e/` | 核心用户流程通过（发消息 → Agent 回复 → 执行 Tool） | 全部 |
| 7.3 | Chrome 打包 + 签名 | `dist/chrome/` zip | 可在 Chrome 加载已解压扩展，功能正常 | 全部 |
| 7.4 | Firefox 打包 + 签名 | `dist/firefox/` zip | 可在 Firefox 加载临时扩展，功能正常 | 全部 |

---

## 7. 技术选型与约束

### 7.1 技术约束

| 约束 | 说明 |
|------|------|
| **Manifest V3 only** | 不使用 MV2，Background 必须为 service_worker（Chrome）/ background script（Firefox） |
| **无 Node.js 依赖** | 所有代码运行在浏览器环境，禁止 `fs`、`path`、`child_process` 等 Node API |
| **无 eval / new Function** | 符合 CSP（Content Security Policy）要求 |
| **无远程代码加载** | 所有 JS 打包在扩展内，不 CDN 加载外部脚本 |
| **fetch-only HTTP** | 不使用 axios/ky 等有 Node.js 依赖的 HTTP 库，直接用 `fetch` |
| **包体积控制** | 单个构建产物 < 2MB（压缩后），Chat Page 首屏 < 500KB |
| **Readability 集成** | 使用 `@mozilla/readability` 库，在 Content Script 中运行 |

### 7.2 编码规范

```
目录命名: kebab-case (agent-runtime/, tool-registry/)
文件命名: kebab-case (agent-loop.ts, tool-registry.ts)
类命名:   PascalCase (AgentLoop, ToolRegistry)
函数命名: camelCase (buildContext, executeTool)
常量命名: UPPER_SNAKE_CASE (MAX_TOOL_ROUNDS)
接口命名: I 前缀 (IToolRegistry, IGuardrail)
类型命名: PascalCase，无前缀 (ToolDefinition, RiskLevel)

导出规则:
  - 模块内部实现细节不导出
  - 每个模块通过 index.ts 统一导出公开接口
  - 类型和实现分离：types.ts 定义接口，impl/ 目录放实现

文件组织:
  src/
    module-name/
      index.ts       # 公开导出
      types.ts       # 类型定义
      module-name.ts # 主实现
      __tests__/     # 测试
```

### 7.3 安全考虑

| 安全项 | 措施 |
|--------|------|
| API Key 存储 | 明文存 `chrome.storage.local`，UI 明确提示风险（黄色警告），后续版本加 WebCrypto 加密 |
| 敏感数据外发 | Guardrail 在发送前检查 `dataSensitivity`，敏感/关键数据禁止发送给远程 Provider |
| Tool 参数校验 | Tool 执行前校验参数类型和范围，防止非法参数传入浏览器 API |
| LLM 输出校验 | tool_call name 必须在 Tool Registry 中存在，参数必须符合 schema |
| XSS 防护 | Chat UI 渲染 LLM 输出时转义 HTML |
| CSP 合规 | 扩展 CSP 禁止 `unsafe-eval`、`unsafe-inline` |
| 确认防绕过 | 高风险操作的确认在 UI 层实现，不依赖 LLM 自觉 |

### 7.4 性能考虑

| 性能项 | 措施 |
|--------|------|
| Agent Loop 超时 | 单次运行最多 15 轮工具调用，防止无限循环 |
| LLM 请求超时 | fetch 设置 120s 超时，流式请求无超时但支持 AbortController |
| 浏览器状态同步 | 防抖 500ms + 全量刷新，不做增量状态机 |
| IndexedDB 查询 | 关键字段建索引（conversationId + timestamp） |
| Chat UI 虚拟列表 | 消息数 >100 时启用虚拟滚动（`@tanstack/react-virtual`） |
| Tool Schema 缓存 | Tool Registry 的 OpenAI Schema 在注册时计算，运行时直接使用缓存 |

---

## 8. 关键决策记录

| 决策 | 方案 | 备选 | 理由 |
|------|------|------|------|
| 扩展框架 | WXT | Plasmo / 手写构建 | WXT 双浏览器支持最成熟，HMR 体验最好 |
| Agent Runtime | 自研轻量 Loop | LangChain.js / Vercel AI SDK | 无 Node 依赖，体积可控，逻辑简单 |
| UI 框架 | React 18 | Preact / Solid.js | 生态最丰富，聊天组件可直接复用社区方案 |
| 通信协议 | JSON-RPC 2.0 | Custom Message / postMessage | 标准化，双向请求支持，易于调试 |
| 构建策略 | WXT 双构建产物 | 单构建 + runtime 适配 | Manifest 差异必须在构建时处理（权限声明、background 类型等） |
| Content Script 注入 | `manifest.content_scripts` 声明式 | `scripting.executeScript` 动态注入 | 声明式注入在所有页面自动生效，适合正文提取场景 |
| 流式响应 | SSE (fetch + ReadableStream) | WebSocket | SSE 简单、无状态，OpenAI 原生支持 |
| CSS 方案 | TailwindCSS 4 | CSS Modules / styled-components | 原子化 CSS 零运行时，产物体积最小 |

---

## 9. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| Firefox 不支持 `tabGroups` API | 高 | 确定 | Capability-based 注册，Firefox 不注册 tabGroups 工具 |
| Firefox MV3 service_worker 限制 | 中 | 中 | WXT 支持自动降级，必要时手动配置 |
| LLM 产生幻觉 tool_call | 中 | 高 | Agent Loop 校验 tool name + 参数 schema，错误反馈重试 |
| `chrome.storage.local` 容量限制 (10MB) | 低 | 低 | 聊天记录存 IndexedDB，storage.local 只存配置 |
| Service Worker 被浏览器休眠 | 中 | 中 | 关键操作前通过 `browser.runtime.connect()` 唤醒，alarms API 定期保活 |
| 大页面正文提取性能 | 低 | 中 | Readability 库已优化，设置 30s 超时 |
| Manifest 权限过多导致商店审核拒绝 | 中 | 中 | 准备审核说明文档，解释每个权限的用途 |

---

## 10. 附录

### 10.1 System Prompt 模板

```
You are a browser assistant. You have access to tools that can manage the user's browser tabs, windows, tab groups, bookmarks, history, downloads, page content, and more.

Your capabilities:
- Query, create, close, move, and group browser tabs
- Manage browser windows
- Read page content and selected text
- Search and manage bookmarks, history, and downloads
- Read and write clipboard content
- Save and restore tab sessions

Guidelines:
1. Be concise. Execute tools efficiently.
2. Before closing tabs or windows, always confirm with the user.
3. When reading page content, summarize it unless the user asks for full text.
4. For sensitive operations (history, bookmarks, downloads, cookies), confirm before sending data to the LLM.
5. If a tool fails, explain the error and suggest alternatives.
6. Do not fabricate browser state. Always use tools to query current state.

Current browser context will be provided at the start of each conversation.
```

### 10.2 package.json 关键依赖

```json
{
  "name": "browser-agent-extension",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "dev:chrome": "wxt -b chrome",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:chrome": "wxt build -b chrome",
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip",
    "test": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@mozilla/readability": "^0.5.0",
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "wxt": "^0.19.0",
    "typescript": "^5.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.45.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0"
  }
}
```

### 10.3 Manifest 关键权限（Chrome）

```json
{
  "manifest_version": 3,
  "name": "Browser Agent",
  "version": "0.1.0",
  "permissions": [
    "tabs",
    "windows",
    "tabGroups",
    "bookmarks",
    "history",
    "downloads",
    "cookies",
    "sessions",
    "scripting",
    "storage",
    "clipboardRead",
    "clipboardWrite",
    "notifications",
    "contextMenus",
    "sidePanel",
    "alarms"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "Browser Agent"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  }
}
```
