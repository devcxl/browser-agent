## Agent Brief

**类别：** bug
**摘要：** 修复 tool 响应消息未持久化导致的跨轮次对话内容污染——确保 tool 消息存入 DB、ContextBuilder 正确重建 tool_calls/tool 消息对、移除 user 消息重复。

**当前行为：**
工具执行后，tool 响应消息只存在于内存 `messages[]`，从未调用 `conversationManager.addMessage()` 存入 IndexedDB。第二轮对话的 ContextBuilder 从 DB 重建历史上下文时，assistant 消息携带伪造的 `tool_call_id`（`call_${msg.id}`）且缺少对应的 `role: 'tool'` 响应消息，违反 OpenAI API 约定。同时当前轮 user 消息在 `messages[]` 中重复出现两次（一次来自 DB 读取，一次来自手动 push）。

**期望行为：**
- 每次工具执行后，tool 响应消息立即通过 `addMessage()` 持久化到 IndexedDB，携带真实 `tool_call_id`
- assistant 消息存储时保留 LLM 返回的真实 `tool_call_id`（每个 tool_call 对应一个 id），原始执行结果完整保留
- ContextBuilder 重建历史时，每个 assistant 的 `tool_calls[]` 使用真实 `id`，且其后紧跟对应的 `role: 'tool'` 消息
- 当前轮 user 消息仅出现一次（由 `build()` 从 DB 读取即可，移除手动 push）
- 旧数据兼容：DB schema 升级 v1→v2，旧消息无 `toolCallId` 字段时正常读取不抛异常

**关键接口：**
- `DbMessage`（`src/shared/types/storage.ts`）— 新增 `toolCallId?: string` 字段；`DB_VERSION` 1→2
- `StoredMessage.toolCalls[].id`（`src/shared/types/conversation.ts`）— 新增 `id: string` 字段
- `addMessage()`（`src/conversation/conversation-manager.ts`）— 支持 `role: 'tool'` 消息持久化（写入 `toolCallId` 字段）；`dbMsgToStored()` 从 `toolCallId` 读回
- `convertToChatMessage()`（`src/agent/context-builder.ts`）— 使用真实 `id` 而非 `call_${msg.id}`；遍历 `recentMessages` 时识别 assistant 消息后的 tool 消息并正确配对
- `AgentLoop.run()`（`src/agent/agent-loop.ts`）— 工具执行后调用 `addMessage()` 持久化 tool 响应；移除第 71 行 `messages.push({ role: 'user', ... })`；assistant 存储时 `toolCalls` 包含 `id` 字段

**验收标准：**
- [ ] 修复前能复现 bug（集成测试：两轮对话，首轮含工具调用，断言第二轮 ContextBuilder 输出中每个 assistant tool_call 都有对应 tool 响应消息）
- [ ] 修复后 bug 不再出现
- [ ] 相关测试全部通过（`src/agent/__tests__/` + `src/conversation/__tests__/`）
- [ ] 无回归（现有全部测试通过）
- [ ] DB schema 升级兼容旧数据（旧消息无 `toolCallId` 字段时正常处理，不抛异常）
- [ ] 手动端到端验证：两轮对话，第二轮输出不混入第一轮工具内容

**不在范围内：**
- 不重构摘要生成逻辑
- 不修改 guardrail / tool registry
- 不调整 UI 层消息展示
- 不修复 `getRecentMessages` 返回消息顺序（reverse 导致倒序，属独立问题）
