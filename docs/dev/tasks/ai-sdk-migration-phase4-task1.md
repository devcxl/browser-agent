---
parent_issue: 135
phase: 4
dependencies: ["Phase 1.3"]
status: todo
estimated_lines: +100/-238
---

# Task 4.1: 替换 useAgent 为 useChat + DirectChatTransport

## 目标
用 AI SDK v7 的 `useChat` hook + `DirectChatTransport` 替换自研 `useAgent` hook（338 行）。

## 实现要点
1. 新建 `src/chat/direct-chat-transport.ts`：
   - 实现 `ChatTransport` 接口
   - `sendMessages` → 调用 `ToolLoopAdapter.runStream()` 返回 `AsyncGenerator<StreamPart>`
   - `abort` → 调用 `ToolLoopAdapter.abort()`
2. 在 `ChatPanel` 中替换：
   ```typescript
   // 迁移前:
   const { messages, send, stop, status } = useAgent(agentAdapter);
   
   // 迁移后:
   const transport = useMemo(() => new DirectChatTransport({ agentAdapter }), []);
   const { messages, sendMessage, status, stop } = useChat({ transport });
   ```
3. AI SDK `UIMessage` 类型直接使用，无需手动转换
4. 删除 `useAgent` 中的手动 `streamingContent` 增量和 `toolCallDisplay` 管理
5. 通过 Feature Flag `useSDKChat` 控制新旧切换

## 验收标准
- [ ] `DirectChatTransport` 实现 `ChatTransport` 接口
- [ ] `useChat` 在 ChatPanel 中正常工作
- [ ] 消息流式传输正常（text/tool-call/tool-result）
- [ ] abort 中断正常
- [ ] Feature Flag 关闭时使用旧 `useAgent`
- [ ] 单元测试：sendMessages、abort、错误处理
