# 开发文档: T17 - Chat Page 完整 UI

**Project:** Browser Agent
**Task ID:** T17
**Slug:** chat-ui-full
**Issue:** #17
**类型:** frontend
**Batch:** 7
**依赖:** T6（Capability Detector）, T12（LLM Provider Client）, T13（Agent Runtime）, T14（Conversation Manager）, T15（Guardrail）

---

## 1. 目标

实现 Chat Page 完整 React UI，包含消息流式渲染、工具调用卡片、高风险确认弹窗、Abort 控制、Provider/Agent/Expert Mode 设置面板、实时浏览器状态面板、会话列表侧边栏，以及 XSS 防护、虚拟滚动、响应式布局。

---

## 2. 前置条件

- [x] T6: Capability Detector 就绪，可通过 JSON-RPC 获取 `Capabilities`
- [x] T12: LLM Provider Client 就绪，`ILlmClient.chatStream()` / `chat()` 可用
- [x] T13: Agent Runtime 就绪，`IAgentRuntime.run(input)` / `abort()` 可用
- [x] T14: Conversation Manager 就绪，`IConversationManager` CRUD 可用
- [x] T15: Guardrail 就绪，`IGuardrail.check()` 返回 `GuardrailCheck`
- [x] WXT + React + TailwindCSS 4 项目骨架已搭建
- [x] `src/app/` 目录已创建，Chat Page 入口 `chat.html` 已配置

---

## 3. 实现步骤

### 3.1 页面骨架 + 布局

**文件:** `src/app/ChatPage.tsx`

```
布局结构（桌面端）:
┌─────────────────────────────────────────────────────┐
│ Header (Agent 状态指示器 + 设置/侧边栏按钮)          │
├──────────┬──────────────────────────┬───────────────┤
│ Sidebar  │     ChatView             │ BrowserState  │
│ (会话列表) │  ┌─────────────────┐   │ Panel         │
│          │  │ MessageBubble   │   │ (可折叠)      │
│ 260px    │  │ (流式 + 工具卡片) │   │ 280px         │
│          │  └─────────────────┘   │               │
│          │  ┌─────────────────┐   │               │
│          │  │ ConfirmDialog   │   │               │
│          │  │ (模态覆盖)       │   │               │
│          │  └─────────────────┘   │               │
│          ├────────────────────────┤               │
│          │ MessageInput           │               │
│          │ (输入框 + Abort + 发送) │               │
│          └────────────────────────┴───────────────┘
└─────────────────────────────────────────────────────┘

移动端: Sidebar 抽屉覆盖，BrowserStatePanel 底部 Sheet
```

**关键逻辑:**
- 使用 CSS Grid 实现三栏布局，TailwindCSS `grid grid-cols-[260px_1fr_280px]`
- 响应式断点: `<1024px` 折叠侧边栏到抽屉，`<768px` 折叠状态面板
- `ChatPage` 作为状态中心，通过 React Context 向下传递 `agentState`、`conversationId`、`browserState`

---

### 3.2 ConversationSidebar（会话列表侧边栏）

**文件:** `src/app/components/ConversationSidebar.tsx`

**功能:**
- 显示所有会话列表，按 `updatedAt` 降序
- 新建会话按钮（顶部 "+" 图标）
- 点击切换会话，高亮当前会话
- 右键菜单：重命名 / 删除
- 删除时弹出确认提示

**关键接口调用:**
```ts
const conversations = await conversationManager.list();
await conversationManager.create(title);
await conversationManager.delete(id);
await conversationManager.update(id, { title });
```

**验收细节:**
- 列表支持滚动，超过可视区域显示滚动条
- 新建会话后自动聚焦到输入框
- 删除当前会话后自动切换到最近会话，无会话时显示空状态引导

---

### 3.3 ChatView（消息列表 + 流式渲染 + 虚拟列表）

**文件:** `src/app/components/ChatView.tsx`, `src/app/components/MessageBubble.tsx`, `src/app/components/ToolCallCard.tsx`

#### 3.3.1 虚拟列表

**依赖:** `@tanstack/react-virtual`（如包体积敏感，可手写简易虚拟滚动 ~80 行）

- 消息数 >100 时启用虚拟滚动
- 新消息到达自动滚动到底部（`scrollIntoView`）
- 用户手动上滚时不自动滚动（检测 `scrollTop` 是否在底部阈值内）

#### 3.3.2 消息渲染

**MessageBubble 组件:**
- `role="user"`: 右对齐，蓝色气泡
- `role="assistant"`: 左对齐，灰色气泡，支持流式渲染（内容逐字追加）
- `role="tool"`: 左对齐，紧凑卡片样式，显示工具名称 + 执行状态

**流式渲染逻辑:**
```ts
// Agent Runtime 通过回调推送流式 chunk
agentRuntime.run({
  ...input,
  onStreamChunk: (chunk: StreamChunk) => {
    // 更新当前 assistant 消息的 content
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.streaming) {
        return [...prev.slice(0, -1), { ...last, content: last.content + chunk.delta }];
      }
      return [...prev, { role: "assistant", content: chunk.delta, streaming: true }];
    });
  },
  onToolCall: (record: ToolCallRecord) => {
    // 插入工具调用卡片
    setMessages(prev => [...prev, {
      role: "tool",
      toolCall: record,
    }]);
  },
});
```

#### 3.3.3 ToolCallCard 组件

**文件:** `src/app/components/ToolCallCard.tsx`

- 显示工具名称（如 `tabs_remove`）、状态图标（执行中/成功/失败）
- 可展开查看参数摘要和结果摘要
- 高风险工具显示橙色边框，已确认显示绿色勾
- 执行中显示 loading spinner

**XSS 防护:**
- 所有 LLM 输出内容使用 `textContent` 或 React 默认转义（不 `dangerouslySetInnerHTML`）
- 如需渲染 Markdown，使用 `marked` 或 `markdown-it` + DOMPurify 清洗
- 工具参数/结果中的 URL 仅显示，不做可点击链接（除非明确标记为安全）

---

### 3.4 MessageInput（发送 + Abort）

**文件:** `src/app/components/MessageInput.tsx`

**功能:**
- Textarea 输入框，支持 Enter 发送、Shift+Enter 换行
- 发送按钮（发送中变为 Abort 按钮）
- Abort 按钮调用 `agentRuntime.abort()`
- 输入框在 Agent 运行中禁用
- 字符数显示（可选）

**状态管理:**
```ts
type InputState = "idle" | "sending" | "streaming";

// idle: 空输入框，发送按钮灰色
// sending: Agent 运行中，显示 Abort 按钮，输入框禁用
// streaming: LLM 流式输出中，Abort 可用
```

**关键逻辑:**
- 发送前检查 Provider 配置是否存在，不存在则弹出提示引导设置
- 发送前检查输入非空（trim 后）
- Abort 后恢复输入框状态

---

### 3.5 ConfirmDialog（高风险确认弹窗）

**文件:** `src/app/components/ConfirmDialog.tsx`

**功能:**
- 模态弹窗，展示 Preflight 结果
- 影响对象清单（表格形式）：类型图标、标题、URL/ID、原因
- 警告信息列表
- 操作按钮：确认执行 / 取消
- 支持 "本次会话不再提示" 复选框（仅对 medium 风险）

**Props 接口:**
```ts
interface ConfirmDialogProps {
  open: boolean;
  toolName: string;
  toolDescription: string;
  preflightResult: PreflightResult;
  onConfirm: () => void;
  onCancel: () => void;
}
```

**影响对象渲染:**
- `type="tab"`: 显示 🌐 图标 + title + url
- `type="window"`: 显示 🪟 图标 + title
- `type="bookmark"`: 显示 🔖 图标 + title + url
- `type="cookie"`: 显示 🍪 图标 + domain + name
- 超过 10 个对象时折叠，显示 "还有 N 个..."

**与 Guardrail 的集成:**
```ts
// Agent Runtime 中
const check = await guardrail.check(toolName, params, context);
if (check.requiresConfirmation) {
  const preflightResult = await tool.preflight(params);
  // 显示 ConfirmDialog，等待用户操作
  const userConfirmed = await showConfirmDialog(toolName, preflightResult);
  if (!userConfirmed) {
    return { success: false, error: "用户取消操作" };
  }
}
```

---

### 3.6 SettingsPanel（Provider 配置 + Agent 设置 + Expert Mode 开关）

**文件:** `src/app/components/SettingsPanel.tsx`

#### 3.6.1 Provider 配置子面板

**文件:** `src/app/components/settings/ProviderConfig.tsx`

- Provider Profile 列表（CRUD）
- 每个 Profile 字段：name, endpoint, apiKey, model, isLocalTrusted, extraHeaders
- API Key 输入框为 password 类型，带显示/隐藏切换
- 默认 Provider 选择（单选）
- 连接测试按钮（调用 `llmClient.checkHealth(config)`）
- Local Trusted 开关，带黄色警告提示

**数据持久化:**
```ts
// 读取
const configs = await ConfigStore.get<ProviderConfig[]>("providerConfigs");
// 写入
await ConfigStore.set("providerConfigs", updatedConfigs);
await ConfigStore.set("defaultProviderId", selectedId);
```

#### 3.6.2 Agent 设置子面板

**文件:** `src/app/components/settings/AgentSettings.tsx`

- maxToolRounds: 数字输入（默认 15，范围 1-50）
- maxContextMessages: 数字输入（默认 20，范围 5-100）
- summaryThreshold: 摘要触发阈值（消息数 / token 数 / 工具调用数）
- systemPrompt: Textarea（默认使用内置模板，可自定义）

**持久化:**
```ts
await ConfigStore.set("agentConfig", agentConfig);
```

#### 3.6.3 Expert Mode 子面板

**文件:** `src/app/components/settings/ExpertModeSettings.tsx`

- Expert Mode 总开关
- 展开后显示各 API 域子开关（proxy, privacy, management, debugger, webRequest, declarativeNetRequest, nativeMessaging, identity）
- 总开关关闭时子开关全部禁用
- 每个子开关带风险等级标签（critical）

**持久化:**
```ts
await ConfigStore.set("expertMode", {
  enabled: boolean,
  switches: Record<string, boolean>,
});
```

---

### 3.7 BrowserStatePanel（实时浏览器状态）

**文件:** `src/app/components/BrowserStatePanel.tsx`

**功能:**
- 实时显示当前所有窗口和标签页
- 窗口分组显示，标题栏显示窗口标题 + Tab 数量
- 标签页显示 favicon + title（截断）+ url（截断）
- 当前活跃标签页高亮
- 点击标签页可切换到该 tab（通过 `browser.tabs.update(tabId, { active: true })` + `browser.windows.update(windowId, { focused: true })` 的 JSON-RPC 调用）
- 折叠/展开按钮

**数据来源:**
```ts
// 通过 JSON-RPC 通知接收 Background 推送的 BrowserState
jsonRpcClient.onNotification("browser.stateChanged", (params) => {
  setBrowserState(params.state as BrowserState);
});

// 初始加载时主动请求
const state = await jsonRpcClient.request("browser.getState");
```

**更新频率:**
- Background 防抖 500ms 后推送
- UI 不做额外轮询

---

### 3.8 状态管理

**文件:** `src/app/context/ChatContext.tsx`

使用 React Context + useReducer 管理全局状态：

```ts
interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: StoredMessage[];
  agentStatus: "idle" | "running" | "streaming" | "waitingConfirmation";
  browserState: BrowserState | null;
  settingsOpen: boolean;
  sidebarOpen: boolean; // 移动端
  statePanelOpen: boolean;
}

type ChatAction =
  | { type: "SET_CONVERSATIONS"; payload: Conversation[] }
  | { type: "SET_ACTIVE_CONVERSATION"; payload: string }
  | { type: "ADD_MESSAGE"; payload: StoredMessage }
  | { type: "UPDATE_LAST_MESSAGE"; payload: Partial<StoredMessage> }
  | { type: "SET_AGENT_STATUS"; payload: ChatState["agentStatus"] }
  | { type: "SET_BROWSER_STATE"; payload: BrowserState }
  | { type: "TOGGLE_SETTINGS" }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "TOGGLE_STATE_PANEL" };
```

---

## 4. 接口/契约

### 4.1 依赖的已有接口

| 接口 | 来源 | 用途 |
|------|------|------|
| `IAgentRuntime.run(input)` | T13 | 执行 Agent 运行 |
| `IAgentRuntime.abort()` | T13 | 中止运行 |
| `ILlmClient.chatStream()` | T12 | 流式 LLM 调用（Provider 连接测试） |
| `IConversationManager` CRUD | T14 | 会话管理 |
| `IGuardrail.check()` | T15 | 风险检查 |
| `IJsonRpcClient.request()` | T3 | 浏览器状态查询 |
| `IJsonRpcClient.onNotification()` | T3 | 接收浏览器状态推送 |
| `ConfigStore.get/set()` | T5 | 配置持久化 |

### 4.2 Chat Page 内部组件 Props 接口

```ts
// MessageBubble
interface MessageBubbleProps {
  message: StoredMessage;
  isStreaming?: boolean;
}

// ToolCallCard
interface ToolCallCardProps {
  toolCall: ToolCallRecord;
  isExecuting?: boolean;
}

// ConfirmDialog
interface ConfirmDialogProps {
  open: boolean;
  toolName: string;
  toolDescription: string;
  preflightResult: PreflightResult;
  onConfirm: () => void;
  onCancel: () => void;
}

// SettingsPanel
interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

// BrowserStatePanel
interface BrowserStatePanelProps {
  state: BrowserState | null;
  onSwitchToTab: (tabId: number, windowId: number) => void;
}

// ConversationSidebar
interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

// MessageInput
interface MessageInputProps {
  disabled: boolean;
  isRunning: boolean;
  onSend: (message: string) => void;
  onAbort: () => void;
}
```

---

## 5. 测试指引

### 5.1 单元测试

| 测试场景 | 测试内容 | 预期结果 |
|----------|----------|----------|
| MessageInput 发送 | 输入文本 → 点击发送 | `onSend` 被调用，参数为输入文本 |
| MessageInput 空输入 | 输入框为空 → 点击发送 | `onSend` 不被调用 |
| MessageInput Abort | Agent 运行中 → 点击 Abort | `onAbort` 被调用 |
| ConfirmDialog 确认 | 点击"确认执行" | `onConfirm` 被调用 |
| ConfirmDialog 取消 | 点击"取消" | `onCancel` 被调用 |
| XSS 防护 | LLM 输出包含 `<script>alert(1)</script>` | 渲染为纯文本，不执行脚本 |
| 虚拟滚动 | 渲染 200 条消息 | 仅 DOM 中可见的消息节点被创建（检查 DOM 节点数 < 200） |

### 5.2 集成测试

| 测试场景 | 预期结果 |
|----------|----------|
| 完整流程：输入 → Agent 运行 → 流式显示 → 工具调用卡片 → 最终回复 | 消息列表正确渲染每一步 |
| 高风险确认流程：触发高风险工具 → 弹窗显示 → 确认 → 执行 | ConfirmDialog 正确展示 Preflight 结果 |
| Abort 流程：Agent 运行中 → 点击 Abort → Agent 停止 | 输入框恢复可用，消息列表保留已输出内容 |
| 设置持久化：修改 Provider 配置 → 关闭设置 → 重新打开 | 配置已保存 |
| 浏览器状态更新：打开/关闭标签页 → 状态面板更新 | 面板内容与浏览器实际状态一致 |
| 会话 CRUD：新建/切换/重命名/删除会话 | 列表正确更新，消息正确隔离 |

---

## 6. 验收标准

- [ ] 用户输入 → Agent 运行 → 流式显示 LLM 输出
- [ ] 工具调用显示为独立卡片（ToolCallCard），含状态图标
- [ ] 高风险触发确认弹窗（ConfirmDialog），展示影响对象清单
- [ ] Abort 按钮中止 Agent，恢复输入框
- [ ] Provider 配置增删改、默认选择、连接测试，持久化到 ConfigStore
- [ ] Agent 设置（轮次、上下文消息数、摘要阈值）持久化
- [ ] Expert Mode 总开关 + 子开关，持久化
- [ ] 浏览器状态面板实时更新（tabs/windows/tabGroups）
- [ ] 会话列表：新建、切换、重命名、删除
- [ ] 消息数 >100 时启用虚拟滚动，性能不降级
- [ ] XSS 防护：LLM 输出中的 HTML 标签被转义
- [ ] 响应式布局：桌面三栏 → 平板两栏 → 手机单栏

---

## 7. 注意事项

1. **性能:** 虚拟列表仅在消息 >100 时启用，避免小列表的过度工程。`@tanstack/react-virtual` 包体积约 5KB gzipped，可接受。
2. **XSS:** 不要使用 `dangerouslySetInnerHTML` 渲染 LLM 输出。如需 Markdown 支持，使用 `marked` 解析后通过 React 组件树渲染（不用 HTML 字符串）。
3. **状态同步:** BrowserState 通过 Background 推送更新，UI 不做轮询。首次打开 Chat Page 时主动请求一次 `browser.getState`。
4. **移动端适配:** Sidebar 和 SettingsPanel 在移动端使用 Drawer/Sheet 模式，不要用模态弹窗遮挡整个屏幕。
5. **TailwindCSS 4:** 使用 `@tailwindcss/vite` 插件，配置在 `wxt.config.ts` 中。注意 TailwindCSS 4 的配置方式与 v3 不同（CSS-based config）。
6. **组件拆分:** 每个组件文件不超过 200 行。超过则拆分子组件。工具函数提取到 `src/app/utils/`。
7. **错误处理:** LLM 调用失败时显示错误提示（Toast），不崩溃整个页面。网络错误显示重试按钮。
8. **空状态:** 无会话时显示引导提示，无消息时显示欢迎界面和示例命令。
