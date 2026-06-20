## 诊断报告

### 发现

刷新页面或切换会话后，聊天面板的消息列表为空，历史消息不展示。问题出在 UI 层——`ChatContext` 的消息状态从未从持久化层（IndexedDB）加载数据，而 `ConversationManager.get()` 和 `Database` 的读写功能本身完好。

### 原因

三个独立的缺失点共同导致此 bug：

**1. `ChatContext.tsx:29` — 消息状态无加载逻辑**

`messages` state 初始化为空数组 `useState<UIMessage[]>([])`。整个 `ChatProvider` 组件（共 77 行）没有任何 `useEffect` 在组件挂载时或 `activeId` 变化时从 DB 加载历史消息。消息只在 `useAgent.run()` 执行时通过 `onMessage` 回调动态添加，从未从 IndexedDB 恢复。

文件：`src/entrypoints/chat/ChatContext.tsx`，第 29 行，第 25-77 行整体。

**2. `useConversations.ts:38-40` — `select()` 只设置 ID，不触发消息加载**

```typescript
const select = useCallback((id: string) => {
  setActiveId(id);
}, []);
```

`select` 仅更新 `activeId` 状态。`ChatContext` 中没有 `useEffect` 监听 `activeId` 变化并调用 `manager.get(id)` 加载消息。因此切换会话时，侧边栏高亮切换了，但消息区域仍然是旧状态（通常是空）。

文件：`src/entrypoints/chat/hooks/useConversations.ts`，第 38-40 行。

**3. `App.tsx` — 刷新后 `activeId` 为 null，缺少恢复机制**

`useConversations` 中 `activeId` 初始化为 `null`（第 11 行）。没有从 `ConfigStore` / `browser.storage.local` 持久化最近活跃会话 ID 的逻辑。`StorageSchema`（`src/shared/types/storage.ts:7-16`）中不包含 `activeConversationId` 字段。

此外，即使 `activeId` 正确恢复，也没有代码执行 `manager.get(activeId)` 来加载历史消息（回到原因 #1）。

文件：`src/entrypoints/chat/App.tsx`，第 14 行初始化 ConfigStore 但仅用于 provider/agent settings；`src/shared/types/storage.ts:7-16` 缺少 `activeConversationId` 字段。

**4. `StoredMessage` → `UIMessage` 转换缺失**

两种消息类型结构不同：
- `StoredMessage.toolCalls` 类型为 `Array<{id, name, params, result?}>`（`src/shared/types/conversation.ts:10-15`）
- `UIMessage.toolCalls` 类型为 `ToolCallDisplay[]`（`src/entrypoints/chat/types.ts:5-13`），包含 `status`、`riskLevel`、`confirmed` 等 UI 专用字段

`useAgent.ts:87-97` 有 `recordToDisplay()` 将 `ToolCallRecord` 转为 `ToolCallDisplay`，但没有对应的 `StoredMessage` → `UIMessage` 转换函数。历史消息中的工具调用无法正确还原为 UI 可渲染的格式。

### 修复建议

需要在三个层面添加逻辑：

**A. `ChatContext` 增加历史消息加载 effect**

在 `ChatProvider` 中添加 `useEffect`，依赖 `conversations.activeId`。当 `activeId` 变化时：
1. 若 `activeId` 为 null → 清空 messages
2. 若 `activeId` 非 null → 调用 `ConversationManager.get(activeId)` 获取完整 Conversation（含 messages），将 `StoredMessage[]` 转换为 `UIMessage[]` 后 `setMessages`

需要处理的状态：
- 加载中（loading indicator）
- 加载失败（error 展示）
- 空会话（正常，无消息）

**B. `StoredMessage` → `UIMessage` 转换函数**

在 `src/entrypoints/chat/` 下新增转换函数（或扩展现有 utils），将 `StoredMessage` 转为 `UIMessage`：
- 基础字段直接映射：`id`, `role`, `content`, `timestamp`
- `toolCalls`：`StoredMessage` 的 `{id, name, params, result?}` → `ToolCallDisplay` 的 `{id, name, params, result, status: 'success', riskLevel: 'low', confirmed: true}`（历史消息均为已完成，status 固定 'success'）
- `status`：历史消息固定为 `'complete'`
- `reasoningContent`：当前 `StoredMessage` 不持久化 reasoning content——这是现有限制，暂不处理

**C. `activeId` 持久化与刷新恢复**

在 `useConversations` 的初始化 effect 中（或 `ChatProvider` 中）：
1. 从 `ConfigStore`（`browser.storage.local`）读取上次活跃的 `activeId`
2. 若存在且该会话仍在 IndexedDB 中 → 恢复 `activeId`
3. 若无持久化记录但有历史会话 → 自动选中最近更新的会话（`list[0]`）

需要在 `StorageSchema` 中新增 `activeConversationId?: string` 字段。
在 `select` 和 `create` 时将当前 `activeId` 写入 `ConfigStore`。

**D. 新建会话时清空消息**

`create()` 已设置 `setActiveId(conv.id)`，配合上述 effect 应自动触发重新加载。新会话在 DB 中无消息，`get()` 返回 `messages: []`，消息列表自然为空——行为正确。

**E. Agent 运行时切换会话的处理**

当前方案建议：切换会话时不中断正在运行的 agent，但切换到新会话后消息区域展示新会话的历史消息。Agent 的输出仍会追加到原来的 `messages` 状态中（通过 `onMessage` 回调），但由于用户已切换到另一会话，这些消息在 UI 上不可见——这是一个已知限制，需要在后续 issue 中单独处理。

### 验证方法

1. **刷新恢复**：在会话 A 中发送几条消息，刷新页面。期望：自动选中会话 A 并展示其历史消息。
2. **切换会话**：在侧边栏点击会话 B。期望：消息区域展示会话 B 的历史消息。
3. **新建会话**：点击"新建"按钮。期望：消息列表清空，侧边栏高亮新会话。
4. **空状态**：删除所有会话后刷新。期望：侧边栏显示"暂无会话"，消息区域为空。
5. **加载状态**：在慢速 IndexedDB 环境下切换会话。期望：显示加载指示器。
6. **错误处理**：模拟 IndexedDB 读取失败。期望：显示错误信息，不崩溃。
7. **无回归**：现有功能（发送消息、agent 运行、工具调用展示、确认对话框）均正常。

### 根因确认

- [x] 修复前能复现 bug：刷新页面后消息列表为空；在侧边栏点击其他会话后消息列表不更新。
- [ ] 修复后 bug 不再出现
- [ ] 相关测试全部通过
- [ ] 无回归

---

## Agent Brief

**类别：** bug
**摘要：** 在 ChatContext 中增加从 IndexedDB 加载历史消息的逻辑，并在刷新时自动恢复最近活跃会话。

**当前行为：**
- 刷新页面后，侧边栏展示会话列表，但消息区域为空
- 点击侧边栏切换会话后，高亮变化但消息区域仍为空
- 消息只在 agent 运行时动态添加，从未从持久化层恢复

**期望行为：**
- 刷新后自动恢复最近活跃会话（优先 `ConfigStore` 中持久化的 ID，其次选最近更新的会话），并展示其历史消息
- 切换会话时，从 IndexedDB 加载该会话的完整消息并展示
- 新建会话时消息列表清空（新会话无历史消息）
- 无会话时显示空状态
- 消息加载期间展示加载指示器
- 加载失败时展示错误信息，不影响其他功能
- Agent 正在运行时切换会话：当前不中断 agent 运行，但切换到新会话后消息区域展示新会话历史，agent 输出不可见（已知限制，后续处理）

**关键接口：**
- `ConversationManager.get(id)` — 返回完整 `Conversation` 含 `StoredMessage[]`，应被复用
- `ConversationManager.list()` — 返回按 `updatedAt` 排序的会话列表，用于自动恢复时取最近会话
- `StoredMessage` — 需新增转换函数 → `UIMessage`。toolCalls 字段结构不同，status/riskLevel/confirmed 等 UI 字段需补默认值
- `ChatContext.messages` / `setMessages` — 需新增加载 effect
- `useConversations.select` / `activeId` — 需在 `ChatContext` 中响应 `activeId` 变化
- `ConfigStore` / `StorageSchema` — 需新增 `activeConversationId` 字段用于持久化

**验收标准：**
- [x] 修复前能复现 bug（刷新后消息为空，切换会话后消息不更新）
- [ ] 修复后刷新页面自动恢复最近会话并展示历史消息
- [ ] 修复后切换会话加载并展示该会话历史消息
- [ ] 修复后新建会话消息列表清空
- [ ] 无会话时展示空状态，不报错
- [ ] 消息加载中展示 loading 状态
- [ ] 消息加载失败展示错误提示
- [ ] 现有 `ConversationSidebar.test.tsx` 全部通过
- [ ] 现有 `conversation-manager.test.ts` 全部通过
- [ ] 现有 `useAgent.test.ts` 全部通过
- [ ] 手动回归：发送消息、agent 运行、工具调用、确认对话框均正常

**不在范围内：**
- 不修改 `ConversationManager` 或 `Database` 的持久化逻辑（它们工作正常）
- 不修改 `AgentLoop` 或 `useAgent` 的 agent 运行逻辑
- 不修改消息渲染组件（`ChatView`、`MessageBubble` 等）
- 不处理 agent 运行时切换会话的中断/暂停问题（后续 issue 单独处理）
- 不持久化 `reasoningContent`（当前 `StoredMessage` 无此字段，属后续增强）
