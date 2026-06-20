# 开发文档: T2 - 共享类型定义

**Project:** Browser Agent
**Task ID:** T2
**Slug:** define-types
**Issue:** #2
**类型:** infrastructure
**Batch:** 1
**依赖:** 无

## 1. 目标

定义全项目共享的 TypeScript 类型和接口，覆盖浏览器数据、JSON-RPC 协议、工具系统、Guardrail、LLM Provider、Conversation、Storage 所有领域。纯类型文件，零运行时依赖。

## 2. 前置条件

- T1 项目骨架已初始化（至少需要 `src/shared/types/` 目录存在和 `tsconfig.json` 配置）

## 3. 实现步骤

### 3.1 浏览器数据类型

**文件: `src/shared/types/browser.ts`**

所有类型必须与 Chrome Extensions API 兼容（即 Chrome API 返回的数据可直接赋值给这些类型）。

```ts
// ==================== Tab ====================

export interface Tab {
  id?: number;
  index: number;
  windowId: number;
  groupId: number;        // -1 表示未分组（chrome.tabGroups.TAB_GROUP_ID_NONE）
  openerTabId?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  active: boolean;
  pinned: boolean;
  audible?: boolean;
  mutedInfo?: { muted: boolean };
  discarded: boolean;
  status?: 'loading' | 'complete';
  incognito: boolean;
  width?: number;
  height?: number;
}

// ==================== Window ====================

export type WindowType = 'normal' | 'popup' | 'panel' | 'devtools';
export type WindowState = 'normal' | 'minimized' | 'maximized' | 'fullscreen';

export interface Window {
  id?: number;
  focused: boolean;
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  incognito: boolean;
  type?: WindowType;
  state?: WindowState;
  alwaysOnTop: boolean;
  title?: string;
}

// ==================== TabGroup ====================

export type TabGroupColor =
  | 'grey' | 'blue' | 'red' | 'yellow'
  | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

export interface TabGroup {
  id: number;
  collapsed: boolean;
  color: TabGroupColor;
  title?: string;
  windowId: number;
}

// ==================== 浏览器状态 ====================

/** 完整浏览器状态（背景同步用） */
export interface BrowserState {
  windows: Window[];
  tabs: Tab[];
  tabGroups: TabGroup[];
  capturedAt: number;
}

/** 状态变更信息 */
export interface StateChanges {
  addedTabs: number[];
  removedTabs: number[];
  updatedTabs: number[];
  addedWindows: number[];
  removedWindows: number[];
  changedGroups: number[];
}

/** 低敏浏览器上下文，注入 LLM system prompt */
export interface LowSensitivityContext {
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
  activeTab?: {
    id?: number;
    title: string;
    url: string;
    windowId: number;
  };
}

// ==================== Capabilities ====================

/** 浏览器能力检测结果，覆盖 17 个能力域 */
export interface Capabilities {
  // 基础
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

// ==================== Tab 查询/创建/更新参数 ====================

export interface TabQueryInfo {
  active?: boolean;
  pinned?: boolean;
  audible?: boolean;
  muted?: boolean;
  highlighted?: boolean;
  discarded?: boolean;
  autoDiscardable?: boolean;
  currentWindow?: boolean;
  lastFocusedWindow?: boolean;
  status?: 'loading' | 'complete';
  title?: string;
  url?: string | string[];
  groupId?: number;
  windowId?: number;
  windowType?: WindowType;
  index?: number;
}

export interface TabCreateProperties {
  windowId?: number;
  index?: number;
  url?: string;
  active?: boolean;
  pinned?: boolean;
  openerTabId?: number;
}

export interface TabUpdateProperties {
  url?: string;
  active?: boolean;
  pinned?: boolean;
  muted?: boolean;
  openerTabId?: number;
  autoDiscardable?: boolean;
}

// ==================== Window 查询/创建/更新参数 ====================

export interface WindowGetInfo {
  populate?: boolean;
  windowTypes?: WindowType[];
}

export interface WindowCreateData {
  url?: string | string[];
  tabId?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  focused?: boolean;
  incognito?: boolean;
  type?: WindowType;
  state?: WindowState;
}

export interface WindowUpdateInfo {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  focused?: boolean;
  drawAttention?: boolean;
  state?: WindowState;
}

// ==================== TabGroup 查询/更新参数 ====================

export interface TabGroupQueryInfo {
  collapsed?: boolean;
  title?: string;
  color?: TabGroupColor;
  windowId?: number;
}

export interface TabGroupUpdateProperties {
  collapsed?: boolean;
  title?: string;
  color?: TabGroupColor;
}
```

### 3.2 JSON-RPC 协议类型

**文件: `src/shared/types/jsonrpc.ts`**

严格遵循 JSON-RPC 2.0 规范（[spec](https://www.jsonrpc.org/specification)）。

```ts
// ==================== JSON-RPC 2.0 核心 ====================

/** JSON-RPC 2.0 请求 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 响应 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

/** JSON-RPC 2.0 通知（无 id，不期待响应） */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 错误对象 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** JSON-RPC 消息联合类型 */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// ==================== 标准错误码 ====================

export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // 自定义
  TIMEOUT: -32000,
  DISCONNECTED: -32001,
  UNKNOWN: -32099,
} as const;

export type JsonRpcErrorCode = (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode];

// ==================== 方法处理器类型 ====================

/** JSON-RPC 方法处理器 */
export type RpcMethodHandler = (params?: Record<string, unknown>) => Promise<unknown>;

/** JSON-RPC 通知处理器 */
export type RpcNotificationHandler = (params?: Record<string, unknown>) => void;

// ==================== Client 接口 ====================

export interface IJsonRpcClient {
  /** 发送请求并等待响应，超时抛出 TIMEOUT 错误 */
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  /** 发送通知（不等待响应） */
  notify(method: string, params?: Record<string, unknown>): void;
  /** 注册方法处理器（接收对端请求） */
  onRequest(method: string, handler: RpcMethodHandler): void;
  /** 注册通知处理器 */
  onNotification(method: string, handler: RpcNotificationHandler): void;
  /** 移除方法处理器 */
  offRequest(method: string): void;
  /** 移除通知处理器 */
  offNotification(method: string): void;
  /** 断开连接 */
  disconnect(): void;
  /** 连接状态 */
  readonly connected: boolean;
}
```

### 3.3 工具类型

**文件: `src/shared/types/tool.ts`**

```ts
// ==================== 枚举类型 ====================

/** 风险等级 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** 工具类别（16 个） */
export type ToolCategory =
  | 'tabs'
  | 'windows'
  | 'tabGroups'
  | 'bookmarks'
  | 'history'
  | 'downloads'
  | 'sessions'
  | 'page'
  | 'cookies'
  | 'storage'
  | 'clipboard'
  | 'notifications'
  | 'contextMenus'
  | 'sidePanel'
  | 'alarms'
  | 'expert';

/** 数据敏感级别 */
export type SensitivityLevel = 'low' | 'sensitive' | 'critical';

// ==================== 工具执行 ====================

/** Preflight 影响对象 */
export interface PreflightAffectedObject {
  type: 'tab' | 'window' | 'bookmark' | 'history' | 'download' | 'cookie' | 'page';
  id?: string;
  title?: string;
  url?: string;
  reason?: string;
}

/** Preflight 结果 */
export interface PreflightResult {
  affectedObjects: PreflightAffectedObject[];
  warnings: string[];
}

/** 工具执行结果 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** 返回数据中每个字段的敏感级别，用于过滤外发给 LLM 的内容 */
  sensitivityMap?: Record<string, SensitivityLevel>;
}

// ==================== 工具定义 ====================

/** OpenAI Function Calling Schema - parameters 部分 */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: { type: string };
  }>;
  required?: string[];
}

/** OpenAI Function Calling Schema - 完整格式 */
export interface OpenAIToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  };
  // 扩展字段（非 OpenAI 标准，内部使用）
  'x-capability'?: ToolCategory;
  'x-risk-level'?: RiskLevel;
  'x-confirmation-required'?: boolean;
}

/** 工具定义 */
export interface ToolDefinition {
  /** 唯一名称，如 "tabs_query", "tabs_remove" */
  name: string;
  /** 人类可读描述，注入 LLM system prompt */
  description: string;
  /** OpenAI Function Calling Schema（parameters 部分） */
  schema: ToolParameterSchema;
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

// ==================== Tool Registry 接口 ====================

export interface IToolRegistry {
  /** 注册工具 */
  register(tool: ToolDefinition): void;
  /** 批量注册 */
  registerAll(tools: ToolDefinition[]): void;
  /** 获取所有工具 */
  getAllTools(): ToolDefinition[];
  /** 按名称查找 */
  getTool(name: string): ToolDefinition | undefined;
  /** 按类别过滤 */
  getToolsByCategory(category: ToolCategory): ToolDefinition[];
  /** 导出为 OpenAI Tool Schema 格式 */
  toOpenAISchema(): OpenAIToolSchema[];
  /** 卸载某类别的所有工具 */
  unregisterCategory(category: ToolCategory): void;
  /** 已注册工具数量 */
  readonly size: number;
}

// ==================== 工具调用记录 ====================

export interface ToolCallRecord {
  toolName: string;
  params: Record<string, unknown>;
  result: ToolResult;
  riskLevel: RiskLevel;
  confirmed: boolean;
  timestamp: number;
}
```

### 3.4 Guardrail 类型

**文件: `src/shared/types/guardrail.ts`**

```ts
import type { RiskLevel, SensitivityLevel } from './tool';

// ==================== Guardrail Context ====================

export interface GuardrailContext {
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

// ==================== Guardrail Check Result ====================

export interface GuardrailCheck {
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

// ==================== Guardrail 接口 ====================

export interface IGuardrail {
  /**
   * 检查工具调用是否允许执行
   * @param toolName 工具名称
   * @param params 调用参数
   * @param context 当前上下文
   */
  check(
    toolName: string,
    params: Record<string, unknown>,
    context: GuardrailContext,
  ): Promise<GuardrailCheck>;
}
```

### 3.5 LLM Provider 类型

**文件: `src/shared/types/llm.ts`**

```ts
// ==================== Provider Config ====================

export interface ProviderConfig {
  id: string;
  name: string;
  /** API 端点 (e.g., https://api.openai.com/v1) */
  endpoint: string;
  /** API Key */
  apiKey: string;
  /** 模型名称 */
  model: string;
  /** 是否标记为本地可信 */
  isLocalTrusted: boolean;
  /** 额外 HTTP headers */
  extraHeaders?: Record<string, string>;
  /** 请求超时 ms，默认 120000 */
  timeoutMs?: number;
  /** 是否默认 Provider */
  isDefault?: boolean;
}

// ==================== Chat Message ====================

export interface ToolCallDelta {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCallDelta[];
  tool_call_id?: string;
  name?: string;
}

// ==================== API Request/Response ====================

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: OpenAIToolSchema[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

// 需要前向引用 OpenAIToolSchema，从 tool.ts 导入
import type { OpenAIToolSchema } from './tool';

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCallDelta[];
    };
    finish_reason: 'stop' | 'tool_calls' | 'length';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ==================== Stream ====================

export interface StreamChunk {
  id: string;
  choices: Array<{
    delta: {
      role?: 'assistant';
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | null;
  }>;
}

// ==================== LLM Client 接口 ====================

export interface ILlmClient {
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

### 3.6 Conversation 类型

**文件: `src/shared/types/conversation.ts`**

```ts
// ==================== 消息 ====================

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** 工具调用信息（仅 assistant 消息可能包含） */
  toolCalls?: Array<{
    name: string;
    params: Record<string, unknown>;
    result?: string; // 只存摘要，不存原文
  }>;
  timestamp: number;
}

// ==================== 会话 ====================

export interface Conversation {
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

// ==================== Conversation Manager 接口 ====================

export interface IConversationManager {
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

// 需要前向引用
import type { ILlmClient } from './llm';
```

### 3.7 Storage / DB Schema 类型

**文件: `src/shared/types/storage.ts`**

```ts
import type { ProviderConfig } from './llm';

// ==================== chrome.storage.local 存储 Schema ====================

/** chrome.storage.local 中存储的所有数据 */
export interface StorageSchema {
  /** Provider 配置列表 */
  providers: ProviderConfig[];
  /** Agent 设置 */
  agentSettings: AgentSettings;
  /** Expert Mode 设置 */
  expertModeSettings: ExpertModeSettings;
  /** 全局偏好 */
  preferences: UserPreferences;
}

export interface AgentSettings {
  /** 最大工具调用轮次，默认 15 */
  maxToolRounds: number;
  /** 系统提示词 */
  systemPrompt: string;
  /** 上下文窗口最大消息数，默认 40 */
  maxContextMessages: number;
  /** 摘要触发阈值 */
  summaryThreshold: {
    messageCount: number;    // 默认 30
    estimatedTokens: number; // 默认 12000
    toolCallCount: number;   // 默认 50
  };
}

export interface ExpertModeSettings {
  enabled: boolean;
  switches: Record<string, boolean>;
}

export interface UserPreferences {
  /** UI 主题 */
  theme: 'light' | 'dark' | 'system';
  /** 语言 */
  language: 'zh-CN' | 'en';
  /** 侧边栏默认展开 */
  sidebarExpanded: boolean;
}

// ==================== IndexedDB Schema ====================

/** IndexedDB 数据库名 */
export const DB_NAME = 'browser-agent-db';
export const DB_VERSION = 1;

/** conversations 表 */
export interface DbConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  summary: string | null;
  summaryUpToIndex: number;
  sensitiveDataGranted: boolean;
}

/** messages 表 */
export interface DbMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCallName?: string;
  toolCallParams?: string;  // JSON string
  toolCallResult?: string;  // 摘要
  timestamp: number;
}

/** toolCallLogs 表 */
export interface DbToolCallLog {
  id: string;
  conversationId: string;
  toolName: string;
  riskLevel: string;
  paramsSummary: string;
  resultSummary: string;
  success: boolean;
  confirmedByUser: boolean;
  timestamp: number;
}

/** snapshots 表 */
export interface DbSnapshot {
  id: string;
  type: 'tab' | 'window' | 'tabGroup';
  data: string; // JSON
  capturedAt: number;
}

// ==================== ConfigStore 接口 ====================

export interface IConfigStore {
  /** 获取指定 key 的值 */
  get<T>(key: keyof StorageSchema): Promise<T>;
  /** 设置指定 key 的值 */
  set<T>(key: keyof StorageSchema, value: T): Promise<void>;
  /** 获取所有配置 */
  getAll(): Promise<StorageSchema>;
  /** 部分更新 */
  patch(patch: Partial<StorageSchema>): Promise<void>;
  /** 监听变更 */
  onChange(callback: (changes: Partial<StorageSchema>) => void): () => void;
}
```

### 3.8 统一导出

**文件: `src/shared/types/index.ts`**

```ts
// 所有类型统一从 index.ts 导出，外部模块只 import 此文件

export type {
  Tab,
  Window,
  WindowType,
  WindowState,
  TabGroup,
  TabGroupColor,
  BrowserState,
  StateChanges,
  LowSensitivityContext,
  Capabilities,
  TabQueryInfo,
  TabCreateProperties,
  TabUpdateProperties,
  WindowGetInfo,
  WindowCreateData,
  WindowUpdateInfo,
  TabGroupQueryInfo,
  TabGroupUpdateProperties,
} from './browser';

export type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcError,
  JsonRpcMessage,
  RpcMethodHandler,
  RpcNotificationHandler,
  IJsonRpcClient,
} from './jsonrpc';

export { JsonRpcErrorCode } from './jsonrpc';

export type {
  RiskLevel,
  ToolCategory,
  SensitivityLevel,
  PreflightAffectedObject,
  PreflightResult,
  ToolResult,
  ToolParameterSchema,
  OpenAIToolSchema,
  ToolDefinition,
  IToolRegistry,
  ToolCallRecord,
} from './tool';

export type {
  GuardrailContext,
  GuardrailCheck,
  IGuardrail,
} from './guardrail';

export type {
  ProviderConfig,
  ToolCallDelta,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChunk,
  ILlmClient,
} from './llm';

export type {
  StoredMessage,
  Conversation,
  IConversationManager,
} from './conversation';

export type {
  StorageSchema,
  AgentSettings,
  ExpertModeSettings,
  UserPreferences,
  DbConversation,
  DbMessage,
  DbToolCallLog,
  DbSnapshot,
  IConfigStore,
} from './storage';

export { DB_NAME, DB_VERSION } from './storage';
```

## 4. 接口/契约

### 4.1 类型关系图

```
browser.ts ─────── Tab, Window, TabGroup, BrowserState, Capabilities
                      │
jsonrpc.ts ─────── JsonRpcRequest/Response, IJsonRpcClient
                      │
tool.ts ────────── ToolDefinition, IToolRegistry, RiskLevel, ToolCategory
                      │
guardrail.ts ───── IGuardrail, GuardrailCheck (依赖 tool.ts)
                      │
llm.ts ─────────── ILlmClient, ProviderConfig (依赖 tool.ts 的 OpenAIToolSchema)
                      │
conversation.ts ── IConversationManager (依赖 llm.ts)
                      │
storage.ts ─────── IConfigStore, StorageSchema (依赖 llm.ts 的 ProviderConfig)
```

### 4.2 关键约束

| 约束 | 说明 |
|------|------|
| 零运行时 | 所有文件仅包含 `type`/`interface`/`const` 导出，不含任何函数实现 |
| 类型兼容 | `Tab`/`Window`/`TabGroup` 必须与 `chrome.tabs.Tab` / `chrome.windows.Window` / `chrome.tabGroups.TabGroup` 类型兼容 |
| JSON-RPC 规范 | 严格遵循 JSON-RPC 2.0，`jsonrpc` 字段固定为 `"2.0"` |
| RiskLevel | 四个值：`low`、`medium`、`high`、`critical`，不可增减 |
| ToolCategory | 16 个值，覆盖技术方案中定义的所有类别 |
| Capabilities | 22 个布尔字段，覆盖 17 个能力域（部分域含多个 API） |

## 5. 测试指引

### 5.1 类型检查

```bash
npm run typecheck
```

预期：零错误。所有类型文件互引无循环依赖。

### 5.2 类型兼容性验证（手动）

创建临时验证文件确认 Chrome API 类型兼容性：

```ts
// 此代码仅用于类型验证，不提交到仓库
const tab: Tab = {} as chrome.tabs.Tab;
const win: Window = {} as chrome.windows.Window;
// 如果编译不报错，则类型兼容
```

### 5.3 循环依赖检查

```bash
# 使用 madge 检查循环依赖
npx madge --circular --extensions ts src/shared/types/
```

预期：无循环依赖。

## 6. 验收标准

- [ ] `Tab`/`Window`/`TabGroup` 类型与 Chrome extensions API 类型兼容
- [ ] `Capabilities` 覆盖所有 22 个布尔字段（17 个能力域 + 部分域多个 API）
- [ ] `RiskLevel` 包含 `"low" | "medium" | "high" | "critical"`
- [ ] `ToolCategory` 覆盖全部 16 个类别
- [ ] `SensitivityLevel` 包含 `"low" | "sensitive" | "critical"`
- [ ] JSON-RPC 类型符合 JSON-RPC 2.0 规范（`jsonrpc: "2.0"`，`id` 为 `string | number`）
- [ ] 所有类型从 `src/shared/types/index.ts` 统一导出
- [ ] `npm run typecheck` 零错误
- [ ] 无循环依赖

## 7. 注意事项

- **接口命名**：所有接口使用 `I` 前缀（如 `IToolRegistry`、`IGuardrail`），类型别名无前缀（如 `ToolDefinition`、`RiskLevel`）。遵循编码规范。
- **前向引用**：`llm.ts` 和 `conversation.ts` 存在跨文件引用。TypeScript 的 `import type` 不会产生运行时依赖，可以安全使用。但如果 ESLint 报循环依赖，可将被引用类型提升到同一个文件或创建独立的 `common.ts`。
- **`OpenAIToolSchema` 引用**：`llm.ts` 中的 `ChatCompletionRequest` 引用了 `tool.ts` 的 `OpenAIToolSchema`。这是合理的单向依赖（llm → tool）。
- **`ILlmClient` 引用**：`conversation.ts` 中 `IConversationManager.generateSummary()` 需要 `ILlmClient`。这会在 T14 实现时用到，T2 仅定义类型。
- **`StorageSchema` 依赖**：`storage.ts` 引用 `llm.ts` 的 `ProviderConfig`。这是合理的（配置 Schema 需要 Provider 类型）。
- **枚举 vs 联合类型**：使用 string union type（如 `RiskLevel = 'low' | 'medium' | ...`）而非 TypeScript enum，更轻量且与 JSON 序列化更兼容。
- **`DB_NAME`/`DB_VERSION`**：虽然是 `const` 导出（有运行时值），但它们属于配置常量，放在类型模块中定义以保持唯一事实来源。
