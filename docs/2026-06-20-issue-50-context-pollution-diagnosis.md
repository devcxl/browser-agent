## 诊断报告

### 发现

第二次对话的 AI 输出中混入了第一次对话的工具调用内容。具体症状：当用户在第一轮对话中触发工具调用（如"查询工具"），随后发起第二轮对话（如"查询所有分组"）时，LLM 收到的历史上下文中包含残缺的 tool_calls 链——assistant 消息有 `tool_calls` 但无对应的 `role: 'tool'` 响应消息，且 `tool_call_id` 是伪造的。这违反了 OpenAI API 约定，导致 LLM 行为异常，输出内容被污染。

### 原因

四个协同缺陷共同导致问题：

#### 缺陷 1【核心】Tool 响应消息从未持久化

**文件：** `src/agent/agent-loop.ts:235-239`

```typescript
messages.push({
  role: 'tool',
  tool_call_id: tc.id,
  content: JSON.stringify(filteredResult),
});
```

工具执行后，tool 响应消息只 push 到内存 `messages` 数组，从未调用 `conversationManager.addMessage()` 存入 IndexedDB。当第二轮对话的 ContextBuilder 从 DB 重建历史消息时，这些 tool 响应消息全部丢失。

**影响：** 这是整个污染链的根源——tool 响应消息不存在于任何持久化存储中。

#### 缺陷 2 assistant 存储丢失 tool_call_id 和真实结果

**文件：** `src/agent/agent-loop.ts:262-272`

```typescript
toolCalls: toolCalls.map((tc) => ({
  name: tc.toolName,
  params: tc.params,
  result: tc.result.success ? 'success' : tc.result.error,
})),
```

`StoredMessage.toolCalls` 的定义（`src/shared/types/conversation.ts:10-14`）只有 `name`、`params`、`result` 三个字段，**没有 `id` 字段**。LLM 返回的真实 `tool_call_id`（如 `call_abc123`）被完全丢弃。同时，真实执行结果被替换为字符串 `'success'` 或错误信息，原始 JSON 结果丢失。

#### 缺陷 3 ContextBuilder 伪造 tool_call_id 且不重建 tool 响应

**文件：** `src/agent/context-builder.ts:57-70`

```typescript
id: `call_${msg.id}`,  // 用消息 UUID 伪造，非 LLM 原始 id
```

因为 DB 中没有真实的 `tool_call_id`，ContextBuilder 只能用消息 UUID 拼凑出 `call_${msg.id}`。更致命的是，由于缺陷 1 导致 DB 中不存在 tool 响应消息，重建的 `ChatMessage[]` 中每个 assistant 的 `tool_calls` 都缺少对应的 `role: 'tool'` 消息。这违反了 OpenAI API 约定——每个 `tool_calls` 条目必须有对应的 `tool` 消息响应。

#### 缺陷 4 user 消息重复

**文件：** `src/agent/agent-loop.ts:57-62` + `:67-71`

```typescript
// 第 57 行：存入 DB
await this.conversationManager.addMessage(input.conversationId, { ... });
// 第 67 行：build() 从 DB 取出（包含刚存的 user 消息）
let messages = await this.contextBuilder.build(input.conversationId, ...);
// 第 71 行：又手动 push 一次
messages.push({ role: 'user', content: input.userMessage });
```

`build()` 内部调用 `getRecentMessages()` 已经包含了刚存入的 user 消息，但第 71 行又手动 push 了一次，导致当前 user 消息在消息数组中重复出现。

### 修复建议

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/shared/types/storage.ts` | `DB_VERSION` 1→2；`DbMessage` 新增 `toolCallId?: string` 字段 | 支持存储真实 tool_call_id |
| `src/shared/db/schema.ts` | upgrade 逻辑新增 v2 migration：为 messages store 添加 `toolCallId` 字段 | 兼容旧数据 |
| `src/shared/types/conversation.ts` | `StoredMessage.toolCalls` 新增 `id: string` 字段 | 保留 LLM 原始 tool_call_id |
| `src/conversation/conversation-manager.ts` | `addMessage()` 持久化 `role: 'tool'` 消息（带 `toolCallId`）；`dbMsgToStored()` 读回 `toolCallId` | 使 tool 消息可往返 |
| `src/agent/context-builder.ts` | `convertToChatMessage()` 使用真实 `id`；在 assistant tool_calls 后插入对应 tool 响应消息 | 正确重建消息对 |
| `src/agent/agent-loop.ts` | 工具执行后调用 `addMessage()` 持久化 tool 响应；移除第 71 行重复 push；assistant 存储时保留真实 `tool_call_id` | 修复数据流断裂点 |

### 验证方法

1. **集成测试：** 两轮对话（首轮含工具调用），断言第二轮 ContextBuilder 输出中每个 assistant tool_call 都有对应 tool 响应消息，且 `tool_call_id` 匹配
2. **单元测试：** 为 `convertToChatMessage()` 和 `addMessage()` 新增 tool 消息往返测试
3. **现有测试：** `npx vitest run` 全部 546 个测试通过
4. **手动验证：** 实际运行两轮对话，确认第二轮输出不再混入第一轮工具内容
5. **DB 兼容性：** 旧数据（无 `toolCallId` 字段）能正常读取，不抛异常
