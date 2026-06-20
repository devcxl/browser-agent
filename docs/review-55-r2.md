## 第 2 轮审查报告

### 审查结论：通过 ✅

### 第 1 轮问题修复确认

- **[CRITICAL] ChatContext 消息加载竞态条件** — ✅ 已修复
  - `cancelled` 标志覆盖了所有 await 点（`manager.get(activeId)` 之后，catch 分支中，finally 中）
  - cleanup 函数正确设置 `cancelled = true`
  - 新增竞态回归测试 `prevents stale messages from overwriting current conversation on rapid switch` 使用了 deferred promise 模式，真实模拟了快速切换场景

- **[HIGH] useConversations 会话恢复竞态条件** — ✅ 已修复
  - 新增 `initialRestoredRef` 防止重复执行
  - `cancelled` 标志覆盖所有 await 点（`store.get`、`manager.get`、`manager.list`）
  - cleanup 函数正确设置 `cancelled = true`

- **[MEDIUM] handleNewConversation 死代码** — ✅ 已修复
  - `agent.setCallbacks({ onMessage: messages.push ? undefined : undefined })` 已删除
  - `handleNewConversation` 函数体已简化为仅调用 `conversations.create()`
  - `agent` 依赖已从 useCallback 依赖数组中移除

- **[MEDIUM] waitFor 统一** — ✅ 已修复
  - `vi.waitFor` 已全部替换为 `@testing-library/react` 的 `waitFor`
  - 全仓库无 `vi.waitFor` 残留

### 新发现问题

#### [MEDIUM] App.tsx 中 messages 状态未经 loading/error 保护导致闪烁

文件：`src/entrypoints/chat/App.tsx:156`

`<ChatView messages={messages} />` 在 `messagesLoading` 为 true 时仍然渲染，此时 `messages` 可能处于：
1. 上一次会话的旧数据
2. 空数组（effect 开头 `setMessages([])` 尚未执行）

在 loading 状态和 messages 数据之间存在竞态窗口：用户可能看到旧会话消息一闪而过，然后新消息才加载出来。

**建议修复**：当 `messagesLoading` 为 true 时，不渲染 `<ChatView>`（或渲染一个骨架屏）：

```tsx
{!messagesLoading && <ChatView messages={messages} />}
```

或在 ChatView 内部根据 `messagesLoading` 状态自行处理。

---

#### [SUGGESTION] ChatContext.tsx 中 effect 依赖缺少 `prevActiveIdRef` 的初始化逻辑

文件：`src/entrypoints/chat/ChatContext.tsx:73-74`

```typescript
const activeId = conversations.activeId;
if (activeId === prevActiveIdRef.current) return;
prevActiveIdRef.current = activeId;
```

`prevActiveIdRef` 初始值为 `null`，当组件首次挂载且 `activeId` 也为 `null` 时，这段逻辑能正确跳过（`null === null`）。但当 `activeId` 通过 useConversations 的异步恢复变为非 null 时，能正确触发加载。逻辑正确，无需修改。

---

#### [SUGGESTION] useConversations.ts 中 `ConfigStore.getInstance()` 可能返回 undefined 导致运行时错误

文件：`src/entrypoints/chat/hooks/useConversations.ts:10`

```typescript
const store = ConfigStore.getInstance();
```

如果 ConfigStore 尚未初始化（如单测环境中 mock 未覆盖），`store` 可能为 undefined/null，后续 `store.set('activeConversationId', ...)` 将抛出 TypeError。

但当前测试文件中 mock 了 `ConfigStore.getInstance`，生产环境也会初始化，风险极低。仅作为代码健壮性建议。

---

### 总结

第 1 轮所有问题已正确修复，竞态测试覆盖了快速切换场景，无 Critical/High 新问题。建议后续处理 App.tsx 中 messages 的 loading 态渲染闪烁问题。
