## Agent Brief

**类别：** enhancement
**摘要：** 为聊天界面新增 LLM 思考过程展示（reasoning_content）和思考强度（reasoning_effort）配置支持。

**当前行为：**

1. `ChatCompletionRequest` 不包含 `reasoning_effort` 字段，LLM Client 不会向 API 发送思考强度参数
2. `StreamChunk.delta` 仅解析 `content` 和 `tool_calls`，不提取 `reasoning_content`
3. `ILlmClient.chatStream()` 只有单一的 `onChunk` 回调，没有独立的 reasoning 回调
4. `AgentLoop` 使用非流式 `chat()` 进行工具调用循环，`AgentLoopHooks` 仅有 `onStreamChunk`，无 reasoning 相关 hook
5. `UIMessage` 不包含 reasoning 数据，`MessageBubble` 无法展示思考过程
6. `AgentSettings`（storage 类型和 UI 类型）均无 `reasoningEffort` 字段，SettingsPanel 的 Agent 标签页无思考强度配置项

**期望行为：**

### 1. 类型定义层
- 新增 `ReasoningEffort` 类型：`'low' | 'medium' | 'high' | 'max'`
- `ChatCompletionRequest` 新增可选字段 `reasoning_effort?: ReasoningEffort`
- `StreamChunk.choices[].delta` 新增可选字段 `reasoning_content?: string`
- `ILlmClient.chatStream()` 新增可选参数 `onReasoning?: (content: string) => void`，用于接收 reasoning_content 增量内容（每次回调传递 delta 中的 reasoning_content 字符串，不是累积值）
- `AgentLoopHooks` 新增 `onReasoningChunk?: (chunk: string) => void`
- `UIMessage` 新增可选字段 `reasoning?: string`（完整的 reasoning 文本，在流式过程中持续拼接更新）
- `AgentSettings`（`shared/types/storage.ts` 中的 `AgentSettings` 和 `entrypoints/chat/types.ts` 中的 `AgentSettings`）新增可选字段 `reasoningEffort?: ReasoningEffort`

### 2. LLM Client（`LlmClient`）
- `chat()` 和 `chatStream()` 的请求体中，当 `request.reasoning_effort` 存在时，将其透传到 JSON body 的 `reasoning_effort` 字段
- `chatStream()` 在解析 SSE `data:` 行时，从 `choices[].delta` 中提取 `reasoning_content` 字段。若存在且 `onReasoning` 回调已提供，则调用 `onReasoning(delta.reasoning_content)`。该调用应与 `onChunk` 调用并行触发（同一 chunk 可能同时包含 content 和 reasoning_content）

### 3. Agent Loop
- `AgentLoopHooks.onReasoningChunk` 在 `emitStreamChunks` 调用时不做变更（当前非流式 `chat()` 不会产生 reasoning 增量）
- `AgentLoop` 将 `AgentConfig` 扩展为包含 `reasoningEffort` 字段，并在构造 `ChatCompletionRequest` 时传递 `reasoning_effort`
- `AgentLoop` 的 `hooks.onReasoningChunk` 保留给未来流式 Agent Loop 使用

### 4. UI — 设置面板
- SettingsPanel 的 Agent 标签页新增"思考强度"下拉选择，选项为：低（low）、中（medium）、高（high）、最大（max）
- 下拉框当前值从 `agentSettings.reasoningEffort` 读取，变更时通过 `onSaveAgentSettings` 持久化
- `App.tsx` 中 `agentSettings` 初始化和 `handleSaveAgentSettings` 同步更新以包含 `reasoningEffort`

### 5. UI — 消息气泡
- `MessageBubble` 组件新增 reasoning 折叠面板：当 `message.reasoning` 非空且 `message.role === 'assistant'` 时，在消息正文上方渲染一个可折叠区域
- 折叠面板默认收起，标题显示"思考过程"（或类似文案），点击展开后显示 `message.reasoning` 的文本内容（使用与正文不同的视觉样式，如更小的字号、灰色字体、左侧带边框）
- 流式过程中 reasoning 内容持续更新（`message.status === 'streaming'`），折叠面板在流式时自动展开

### 6. useAgent hook
- `agentConfig` 构造时从存储的 `agentSettings` 读取 `reasoningEffort` 并传入 `AgentConfig`
- 新增 `onReasoningChunk` hook 实现：将 reasoning chunk 拼接到 `assistantMsg.reasoning` 字段并通知 UI

### 7. 存储
- `ConfigStore.DEFAULTS.agentSettings` 新增 `reasoningEffort: 'medium'` 作为默认值
- `AgentSettings` 接口（`shared/types/storage.ts`）新增 `reasoningEffort?: ReasoningEffort`

**关键接口：**

- `ReasoningEffort` — 新增类型，值为 `'low' | 'medium' | 'high' | 'max'`
- `ChatCompletionRequest.reasoning_effort` — 新增可选字段，透传到 LLM API 请求体
- `StreamChunk.choices[].delta.reasoning_content` — 新增可选字段，承载 SSE 流中的思考增量
- `ILlmClient.chatStream()` — 新增 `onReasoning?: (content: string) => void` 参数
- `AgentLoopHooks.onReasoningChunk` — 新增可选回调，用于将 reasoning 流式推送到 UI
- `UIMessage.reasoning` — 新增可选字段，存储完整的 reasoning 文本
- `AgentSettings.reasoningEffort` — 新增可选字段，持久化到 chrome.storage.local
- `AgentConfig.reasoningEffort` — 新增可选字段，从 storage 读取并传入 AgentLoop

**验收标准：**

- [ ] `ReasoningEffort` 类型定义在共享类型中，所有相关接口正确引用
- [ ] `LlmClient.chat()` 和 `chatStream()` 在 `request.reasoning_effort` 存在时正确将其写入请求体
- [ ] `LlmClient.chatStream()` 能从 SSE chunk 中提取 `reasoning_content` 并通过 `onReasoning` 回调传递
- [ ] 设置面板 Agent 标签页显示"思考强度"下拉选择，选项完整（low/medium/high/max）
- [ ] 修改思考强度后刷新页面，值从 chrome.storage 正确恢复
- [ ] `MessageBubble` 在 `message.reasoning` 非空时显示可折叠的思考过程面板，默认收起
- [ ] 流式过程中 reasoning 面板自动展开并实时更新内容
- [ ] `ConfigStore.DEFAULTS` 中 `reasoningEffort` 默认值为 `'medium'`
- [ ] 现有单元测试（`useAgent.test.ts`、`MessageBubble.test.tsx`、`llm-client.test.ts`）不受破坏，新增用例覆盖 reasoning 相关逻辑

**不在范围内：**

- 将 Agent Loop 从非流式 `chat()` 切换为流式 `chatStream()`——当前 Agent Loop 保持非流式，reasoning_effort 参数仅影响模型推理质量，不在循环中实时展示 reasoning 流
- 修改 LLM API 的非流式响应解析（非流式 API 通常不返回 reasoning_content，此项为 API 行为，不在本 issue 范围内）
- 在 Conversation Sidebar 或 BrowserStatePanel 中展示 reasoning 内容
- 在 IndexedDB 的 `DbMessage` 中持久化 reasoning 字段（UI 层字段，不落库）
- 修改 `ConversationManager` 或 `SummaryManager` 以感知 reasoning 内容
