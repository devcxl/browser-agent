# PRD: Browser Agent Extension

> 浏览器扩展型 Agent 平台 — 以独立聊天页面为交互入口，以浏览器扩展 API 为工具层，用户通过自然语言管理标签页、窗口、分组、页面内容、书签、历史记录、下载、Cookie 等浏览器数据。

---

## 1. 产品定位

**Full Browser Agent（浏览器 Agent 平台）**

核心定位：运行在浏览器扩展内部的智能助理，理解用户意图并调用浏览器扩展 API 完成浏览器管理任务。

不是：
- ❌ MCP Server 控制浏览器
- ❌ Claude Code 远程控制
- ❌ 单纯 Tab 管理插件
- ❌ DevTools Protocol 方案

---

## 2. MVP 目标与边界

### 2.1 首发范围

- **Chrome + Firefox 双浏览器同时支持**
- **Manifest V3-first**，按事件驱动后台设计，各自生成适配 manifest
- 单核心代码 + 双 manifest + 双构建产物

### 2.2 能力覆盖

**默认 Full Browser Agent 能力（首发）：**

| 域 | 说明 |
|---|---|
| tabs | 查询、创建、更新、关闭、移动、分组/取消分组 |
| windows | 查询、创建、关闭、聚焦 |
| tabGroups | 查询、创建、更新、重命名 |
| bookmarks | 搜索、创建、更新、删除 |
| history | 搜索、删除 |
| downloads | 搜索、下载、清除 |
| sessions | 保存/恢复快照 |
| page content | 读取正文、选中文本、元数据 |
| cookies | 获取、设置、删除 |
| storage | 扩展存储 |
| clipboard | 读写剪贴板 |
| notifications | 创建通知 |
| contextMenus | 上下文菜单 |
| sidePanel | 侧边栏（Chrome only） |
| alarms | 定时任务 |

**Expert Mode（需要手动开启）：**

| 域 | 说明 |
|---|---|
| proxy | 代理配置 |
| privacy | 隐私设置 |
| management | 扩展管理 |
| debugger | 调试协议 |
| webRequest | 网络请求拦截 |
| declarativeNetRequest | 声明式网络请求 |
| nativeMessaging | 原生消息通信 |
| identity | 身份认证 |

### 2.3 Expert Mode 启用规则

- Expert Mode = 总开关
- 每个系统级 API 域 = 子开关
- 未开启 Expert Mode：Expert Tools 不注册给 Agent
- 开启 Expert Mode 但未开启具体 API：对应工具仍不可用
- 开启后工具默认 riskLevel = critical，仍需要 preflight + 用户确认

### 2.4 MVP 不做

- 不依赖外部 MCP Server
- 不依赖 Native Messaging Host
- 不做云同步/后端账户
- 不做应用层加密（API Key 默认持久化到 storage.local）
- 不做自动路由/多 Agent 协作
- 不做事件溯源/完整操作日志
- 不做工作区历史快照

---

## 3. 架构设计

### 3.1 总体架构

```
Browser Extension
├── Chat Page（独立页面）
│   ├── Agent Runtime
│   ├── LLM Provider Adapter
│   ├── Tool Registry
│   ├── Guardrail
│   ├── Confirmation UI
│   ├── Conversation Manager
│   └── JSON-RPC Client
│
├── Background
│   ├── Capability Detector
│   ├── JSON-RPC Router
│   ├── Browser API Proxy
│   ├── Event Listener（tabs/windows/tabGroups）
│   └── Content Script Bridge
│
├── Content Script
│   ├── DOM Access
│   ├── Readability（正文提取）
│   ├── Selection Reader
│   └── Page Actions
│
└── Storage
    ├── chrome.storage.local（配置/设置）
    └── IndexedDB（聊天记录/操作摘要）
```

### 3.2 执行环境职责

| 环境 | 职责 |
|---|---|
| **Chat Page** | Agent Runtime、LLM 调用、Tool Registry、Guardrail、用户确认 UI、会话状态 |
| **Background** | 浏览器事件监听（tabs/windows/tabGroups）、JSON-RPC 路由、API 代理、content script 桥接 |
| **Content Script** | 页面正文读取、DOM 信息提取、选中文本读取、页面内操作 |

关键原则：**Agent 主状态不放在 background，不依赖 background 常驻。**

### 3.3 Agent 大脑

| 维度 | 决策 |
|---|---|
| 运行时 | 扩展内 Agent Runtime |
| LLM Provider | 可配置，支持 OpenAI-compatible / Ollama / llama-server / custom |
| Provider 模型 | 多个 Profile，一个全局默认 Provider，不做会话级切换 |
| API Key | 默认持久化到 storage.local，UI 提示风险 |
| Provider 信任 | 默认所有 Provider 视为 remote/untrusted，用户手动标记 local-trusted |

### 3.4 通信协议

| 维度 | 决策 |
|---|---|
| 内部协议 | JSON-RPC 2.0 |
| 传输通道 | `runtime.connect` / Port（统一长连接） |
| 通信链路 | Chat Page ⇄ Background ⇄ Content Script |

### 3.5 目录结构

```
browser-agent-extension/
├── src/
│   ├── app/                  # 聊天 UI
│   ├── background/           # 后台服务
│   ├── content/              # Content Scripts
│   ├── agent/                # Agent Runtime
│   ├── tools/                # Tool 实现
│   │   ├── tabs/
│   │   ├── bookmarks/
│   │   ├── history/
│   │   ├── downloads/
│   │   ├── cookies/
│   │   └── page/
│   ├── adapters/
│   │   ├── browser-adapter.ts    # 接口定义
│   │   ├── chrome-adapter.ts
│   │   └── firefox-adapter.ts
│   ├── registry/             # Tool Registry
│   ├── guardrail/            # 安全守卫
│   ├── provider/             # LLM Provider 适配
│   └── shared/               # 共享类型/工具
├── manifests/
│   ├── manifest.chrome.json
│   └── manifest.firefox.json
├── dist/
│   ├── chrome/
│   └── firefox/
└── package.json
```

---

## 4. 执行模型

### 4.1 工具调用流程

```
User Message
    ↓
LLM Provider → Provider Adapter → Internal ToolCall Schema
    ↓
Guardrail 检查风险等级
    ↓
低风险 → 直接 execute
中风险 → 可选 preflight → 用户确认 → execute
高风险 → 必须 preflight → 展示影响清单 → 用户确认 → execute
    ↓
Tool Registry 查找 ToolDefinition
    ↓
BrowserAdapter 调用浏览器 API
    ↓
返回结果
```

### 4.2 Guardrail 风险分级

| 等级 | 策略 |
|---|---|
| **Low** | 直接执行。查询 tabs/windows/tabGroups、获取 active tab 基础信息 |
| **Medium** | 可选 preflight + 建议确认。移动 tab、创建/修改 tab group、固定/静音 |
| **High** | 必须 preflight + 必须确认。批量关闭 tab、关闭窗口、读取页面正文、读取 history/bookmarks/downloads/cookies、scripting 注入、删除/修改书签 |
| **Critical** | Expert Mode 专用，每次强确认 |

### 4.3 Preflight 机制

高风险工具必须实现 `preflight` 方法，用于在执行前计算影响对象清单：

```ts
type ToolPreflightResult = {
  affectedObjects: Array<{
    type: "tab" | "window" | "bookmark" | "history" | "download" | "cookie" | "page";
    id?: string;
    title?: string;
    url?: string;
    reason?: string;
  }>;
  warnings: string[];
};
```

确认弹窗展示具体影响对象清单（标题、URL、数量），用户同意后继续执行原始 Tool Call。

---

## 5. 工具系统

### 5.1 Tool Registry

Tool Registry 是工具定义、风险等级、权限需求、preflight 能力、执行函数的**唯一事实来源**。Provider Adapter、Guardrail、Preflight、Executor、UI 都只消费 Tool Registry 元数据。

### 5.2 Tool 粒度

**Browser API 粒度** — Tool 是浏览器能力的映射层，不承载业务逻辑。例如 `tabs.query`、`tabs.remove`、`tabs.group`，不存在 `tabs.closeDuplicates` 或 `tabs.organize` 等高阶 Tool。

### 5.3 双层工具体系

| 层级 | 说明 |
|---|---|
| **Semantic Tools** | Agent 默认可用，面向用户意图 |
| **Raw Tools** | 内部执行层 / 开发者模式 / 高级调试使用 |

### 5.4 Tool Schema

采用 **OpenAI Tool Schema + 扩展字段**：

```json
{
  "type": "function",
  "function": {
    "name": "tabs_query",
    "description": "Query browser tabs",
    "parameters": {
      "type": "object",
      "properties": {
        "active": { "type": "boolean" }
      }
    }
  },
  "x-capability": "tabs",
  "x-risk-level": "low",
  "x-confirmation-required": false
}
```

### 5.5 注册方式

**Capability-based Registration** — 启动时检测浏览器能力，动态注册对应 Tool：

```ts
const caps = detectCapabilities(); // Chrome / Firefox
if (caps.tabs) registerTabsTools();
if (caps.sidePanel) registerSidePanelTools(); // Chrome only
```

Agent 永远只看到当前浏览器真正支持的 Tool。

---

## 6. 权限与安全

### 6.1 权限策略

**安装时申请全部权限**（Power-user / Developer-first 定位）。权限风险通过产品内 Guardrail 控制，而非浏览器运行时按需授权。

### 6.2 权限模型

```
读取权限 ≠ 发送权限

扩展可以读取浏览器数据；
是否能发送给 LLM Provider，需按数据敏感级别判断。
```

### 6.3 数据分级

| 级别 | 数据 | 发送策略 |
|---|---|---|
| **Low Sensitivity** | tab title、URL、window id、tab group name | 默认允许进入 LLM 上下文 |
| **Sensitive** | page text、selected text、bookmarks、history、downloads、clipboard | 远程 Provider 发送前必须确认（按任务授权）；Local Trusted 可按会话授权 |
| **Critical** | cookies、auth headers、tokens、identity data、password-like fields | 默认禁止发送远程 Provider；Expert Mode + 明确确认才允许 |

---

## 7. 数据与存储

### 7.1 存储策略

| 存储类型 | 用途 |
|---|---|
| `chrome.storage.local` | Provider 配置、Agent 设置、Expert Mode 设置、权限开关 |
| IndexedDB | 聊天记录、Tool call 日志、操作摘要 |
| 内存 | `currentWorkspaceState`（不持久化） |

### 7.2 持久化规则

**默认保存：**
- Provider 配置
- Agent 设置
- Expert Mode 设置
- 聊天消息
- Tool call 名称、时间、状态
- Tab / Window / TabGroup 快照
- 用户确认记录摘要
- 操作结果摘要

**默认不保存原文：**
- 页面正文全文
- 浏览历史明细
- 书签全文导出
- 下载记录明细
- 剪贴板内容
- Cookie 内容
- Token / API Key / Authorization Header
- password-like 字符串

### 7.3 加密策略

**MVP 不做应用层加密。** API Key 默认保存到 storage.local，UI 明确提示风险。后续版本再考虑 Secure Vault / Master Password / WebCrypto。

---

## 8. 会话与上下文

### 8.1 聊天模型

- 多聊天会话（新建、切换、删除、重命名）
- 默认打开最近一个会话
- 本地保存聊天记录
- 不做会话级 Provider 切换

### 8.2 上下文注入策略

每次 LLM 请求默认包含：
1. system prompt
2. Tool Registry 生成的工具说明
3. 当前会话摘要
4. 最近 N 条消息
5. 当前任务必要的低敏浏览器上下文

浏览器数据按需读取，不默认全量注入。

### 8.3 会话摘要策略

MVP：消息数 > 30 或 token > 12k 或工具调用 > 50 条时，触发 LLM 摘要。
后续：规则摘要（操作日志）+ LLM 摘要（对话语义）混合。

摘要不写入 Sensitive / Critical 原文。

---

## 9. 浏览器状态监听

### 9.1 默认监听

- tabs（onCreated / onUpdated / onRemoved / onActivated / onMoved）
- windows（onCreated / onRemoved / onFocusChanged）
- tabGroups（onCreated / onUpdated / onRemoved）

### 9.2 默认不监听

- history / downloads / bookmarks / cookies / webRequest / debugger

### 9.3 监听行为

监听事件后：
- ✅ 更新 UI
- ✅ 刷新当前工作区状态
- ✅ 保存低敏快照
- ✅ 生成整理建议
- ❌ 不自动关闭/移动/分组 Tab
- ❌ 不自动读取敏感数据
- ❌ 不自动修改书签/历史/下载/Cookie

### 9.4 状态更新方式

防抖（300~1000ms）+ 全量刷新，不做增量状态机。

### 9.5 Workspace 状态

`currentWorkspaceState` 只作为内存缓存，不持久化。browser API = 事实来源。聊天页打开时读取，关闭后丢弃。

---

## 10. 关键设计原则

1. **扩展本身是 Agent**，不是外部 MCP 控制器
2. **MV3 事件驱动**，不依赖 background 常驻
3. **读取权限 ≠ 发送权限**，数据分级控制外发
4. **Tool 是薄映射层**，不承载业务逻辑
5. **Capability-based 注册**，Chrome/Firefox 差异由 Adapter 层处理
6. **JSON-RPC 2.0 统一协议**，chat/background/content script 同一种通信语言
7. **本地优先**，不默认云同步
8. **Guardrail 强控制**，高风险操作必须 preflight + 用户确认

---

## 11. 阶段规划

### 第一阶段：Tab Agent（MVP）

核心能力：tabs / windows / tabGroups / page content / sessions
LLM Provider 可配置 + Guardrail + 多会话聊天

### 第二阶段：Full Browser Agent

扩展至 bookmarks / history / downloads / cookies / clipboard / notifications / storage

### 第三阶段：Expert Mode

proxy / privacy / management / debugger / webRequest / nativeMessaging / identity

### 第四阶段：可选外部连接

外部 MCP Client / HTTP 同步 / 数据导出导入
