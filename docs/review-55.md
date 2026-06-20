## 审查报告

### 审查结论：需修改（Comment - 自有 PR 无法提交 Request Changes）

---

### 问题列表

#### [CRITICAL] ChatContext 消息加载存在竞态条件
- 文件: `src/entrypoints/chat/ChatContext.tsx:74-104`
- 原因: `useEffect` 内异步加载消息时，用闭包捕获的 `activeId` 发起 `manager.get(activeId)`。当用户快速切换会话（A→B）时，会话 A 的异步结果可能在会话 B 的结果之后到达，导致最终展示的是 A 的消息而非 B 的消息。
- 重现步骤:
  1. 用户点击会话 A → 触发 `manager.get('A')`
  2. 用户快速点击会话 B → 触发 `manager.get('B')`
  3. 会话 B 的 `get` 先返回 → `setMessages(B的消息)` ✓
  4. 会话 A 的 `get` 后返回 → `setMessages(A的消息)` ❌ 错误覆盖
- 建议: 使用 AbortController 或 ignore 标志来取消过期的异步请求：

```tsx
useEffect(() => {
  const activeId = conversations.activeId;
  if (activeId === prevActiveIdRef.current) return;
  prevActiveIdRef.current = activeId;

  if (!activeId) {
    setMessages([]);
    setMessagesLoading(false);
    setMessagesError(null);
    return;
  }

  let cancelled = false;
  setMessagesLoading(true);
  setMessagesError(null);

  (async () => {
    try {
      const conv = await manager.get(activeId);
      if (cancelled) return; // ← 关键：忽略过期请求
      if (conv) {
        setMessages(conv.messages.map(storedMessageToUIMessage));
      } else {
        setMessages([]);
      }
    } catch (e) {
      if (cancelled) return;
      setMessagesError((e as Error).message);
      setMessages([]);
    } finally {
      if (!cancelled) setMessagesLoading(false);
    }
  })();

  return () => { cancelled = true; };
}, [conversations.activeId]);
```

---

#### [HIGH] useConversations 恢复逻辑同样存在竞态条件
- 文件: `src/entrypoints/chat/hooks/useConversations.ts:72-92`
- 原因: `useEffect` 中异步获取 `savedId` 和 `manager.list()` 后直接 `setActiveId(savedId)`，没有 cleanup 取消机制。React 严格模式下 `useEffect` 会执行两次，第二次的执行结果可能被第一次的延迟结果覆盖。
- 建议: 同样添加 `cancelled` 标志：

```tsx
useEffect(() => {
  if (initialRestoredRef.current || loading) return;
  initialRestoredRef.current = true;

  let cancelled = false;
  (async () => {
    const savedId = await store.get<string | undefined>('activeConversationId');
    if (cancelled) return;
    if (savedId) {
      const conv = await manager.get(savedId);
      if (cancelled) return;
      if (conv) {
        setActiveId(savedId);
        return;
      }
    }
    const convs = await manager.list();
    if (cancelled) return;
    if (convs.length > 0) {
      const sorted = [...convs].sort((a, b) => b.updatedAt - a.updatedAt);
      setActiveId(sorted[0]!.id);
    }
  })();

  return () => { cancelled = true; };
}, [loading]);
```

---

#### [MEDIUM] 测试中混用 `waitFor` 和 `vi.waitFor`，语义不一致
- 文件: `src/entrypoints/chat/__tests__/ChatContext.test.tsx:108,113`
- 原因: 第 108 行用 `waitFor`（从 `@testing-library/react` 导入），第 113 行用 `vi.waitFor`。虽然两者行为相同，但混用降低可读性。Vitest 2.x 中 `vi.waitFor` 已废弃，应统一使用 `@testing-library/react` 的 `waitFor`。
- 建议: 统一使用 `waitFor`，将第 113 行改为 `await waitFor(...)`。

---

#### [MEDIUM] 缺少快速切换会话的竞态条件测试
- 文件: `src/entrypoints/chat/__tests__/ChatContext.test.tsx`
- 原因: 现有测试只覆盖了单一会话加载场景，没有覆盖快速切换会话的竞态条件。修复 CRITICAL 问题后，需要添加对应的回归测试。
- 建议: 添加测试用例：

```tsx
it('ignores stale response when conversation changes during load', async () => {
  // 模拟会话 A 加载慢，会话 B 加载快
  let resolveA: (value: unknown) => void;
  const deferredA = new Promise((r) => { resolveA = r; });

  mockConversationManager.get
    .mockResolvedValueOnce(deferredA)  // 会话 A 延迟
    .mockResolvedValueOnce({           // 会话 B 立即返回
      id: 'conv-2', title: 'B', messages: [{ id: 'mB', role: 'user', content: 'B msg', timestamp: 1 }],
      createdAt: 1, updatedAt: 1, sensitiveDataGranted: false,
    });

  // 先选 A
  mockConversationManager.list.mockResolvedValue([
    { id: 'conv-1', title: 'A', updatedAt: 1, createdAt: 1, messages: [], sensitiveDataGranted: false },
    { id: 'conv-2', title: 'B', updatedAt: 1, createdAt: 1, messages: [], sensitiveDataGranted: false },
  ]);

  render(<ChatProvider><ContextInspector /></ChatProvider>);
  await waitFor(() => expect(screen.getByTestId('conv-loading').textContent).toBe('false'));

  // 此时 activeId 为 conv-1，消息正在加载（A 延迟）
  // resolveA 会带 conv-1 的消息
  resolveA!({ id: 'conv-1', title: 'A', messages: [{ id: 'mA', role: 'user', content: 'A msg', timestamp: 0 }], createdAt: 1, updatedAt: 1, sensitiveDataGranted: false });

  await waitFor(() => expect(screen.getByTestId('messages-loading').textContent).toBe('false'));
  expect(screen.getByTestId('messages-count').textContent).toBe('1');
  // 应展示 conv-1 的消息（最后 resolve 的），或如果修复了竞态，应为 0（无活跃会话）
});
```

---

#### [MEDIUM] `handleNewConversation` 残留死代码
- 文件: `src/entrypoints/chat/App.tsx:120`
- 原因: 第 120 行 `agent.setCallbacks({ onMessage: messages.push ? undefined : undefined });` 是无效代码——`messages.push` 始终是函数，`undefined` 永远为 `undefined`，整个表达式无实际作用。此行不是本次 PR 引入的，但应在清理时一并处理。
- 建议: 删除此行，或改为 `agent.setCallbacks({ onMessage: addMessage })` 显式重设回调。

---

#### [SUGGESTION] `ConfigStore.get<T>` 泛型对可选字段的行为
- 文件: `src/shared/types/storage.ts:16` 和 `src/shared/storage/config-store.ts:58-65`
- 原因: `activeConversationId` 标记为 `?`（可选），但 `ConfigStore.get<T>` 当 key 不存在时返回 `DEFAULTS[key]`。由于 `DEFAULTS` 中不包含 `activeConversationId`，`store.get('activeConversationId')` 在未持久化时返回 `undefined`，这是预期行为。但若未来有人在 `DEFAULTS` 中添加此字段，行为会改变。当前无风险，仅作提示。
- 建议: 无强制修改，仅需注意 `DEFAULTS` 中不应包含有状态字段。

---

#### [SUGGESTION] 测试 mock 过度，未验证真实组件行为
- 文件: `src/entrypoints/chat/__tests__/ChatContext.test.tsx`
- 原因: `ContextInspector` 只渲染几个 `data-testid` div，不渲染 `ChatView`、`ConversationSidebar` 等真实组件。这意味着测试验证的是 Context 状态变化，而非用户在 UI 上看到的效果。如果 `App.tsx` 中 `messagesLoading` 的渲染条件写错（如 `messagesLoading` 拼写错误），测试无法发现。
- 建议: 考虑在集成测试中使用完整的 `ChatLayout` 组件，或至少 mock `ChatView` 但验证其接收的 props。

---

### 验收标准对照

| 标准 | 状态 | 说明 |
|------|------|------|
| 修复前能复现 bug | ✅ | Issue #54 描述了复现步骤 |
| 刷新页面自动恢复最近会话并展示历史消息 | ⚠️ | 功能实现正确，但存在竞态条件 |
| 切换会话加载并展示该会话历史消息 | ⚠️ | 同上，快速切换时可能出错 |
| 新建会话消息列表清空 | ✅ | `setActiveIdAndPersist` → `ChatContext` useEffect 触发清空 |
| 无会话时展示空状态，不报错 | ✅ | `ChatContext.test.tsx` 验证通过 |
| 消息加载中展示 loading 状态 | ✅ | `App.tsx:157-165` 正确渲染 |
| 消息加载失败展示错误提示 | ✅ | `App.tsx:166-170` 正确渲染 |
| 现有测试全部通过 | ✅ | 583 tests passed |

---

### 不在范围内（已确认未修改）

- ✅ 未修改 ConversationManager 或 Database 的持久化逻辑
- ✅ 未修改 AgentLoop 或 useAgent 的 agent 运行逻辑
- ✅ 未修改消息渲染组件（ChatView、MessageBubble 等）
- ✅ 未处理 agent 运行时切换会话的中断/暂停问题
- ✅ 未持久化 reasoningContent（`storedMessageToUIMessage` 正确返回 `undefined`）

---

### 总结

核心功能实现正确，类型转换 `storedMessageToUIMessage` 质量高，测试覆盖了基本场景。**但 ChatContext 和 useConversations 的异步加载均存在竞态条件**，这在快速切换会话或 React 严格模式下会导致展示错误的会话消息。修复方案简单（添加 `cancelled` 标志），不涉及架构变更。建议修复后重新审查。

---

### 建议操作

1. 修复 ChatContext.tsx 竞态条件（CRITICAL）
2. 修复 useConversations.ts 竞态条件（HIGH）
3. 统一测试中的 `waitFor` 用法（MEDIUM）
4. 添加快速切换会话的竞态条件回归测试（MEDIUM）
5. 清理 `handleNewConversation` 死代码（MEDIUM，可选）
