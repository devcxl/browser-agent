---
parent_issue: 135
phase: 1
dependencies: ["Phase 1.1", "Phase 1.2"]
status: todo
estimated_lines: +200/-300
---

# Task 1.3: 替换 AgentLoop 为 ToolLoopAgent

## 目标
用 `ToolLoopAdapter` 完全替换 `AgentLoop`，接入 AI SDK 原生的工具调用循环。

## 实现要点
1. 在 `ToolLoopAdapter.run()` 中集成 `ToolLoopAgent`：
   - 通过 `ProviderRegistry.createModel()` 创建 `LanguageModelV1`
   - 调用 `streamText()` 启动 Agent 循环
   - 配置 `maxSteps`（默认 15）、`stopWhen`
2. 实现 `onStepFinish` 回调：
   - 收集 `toolCalls` 记录（转为 `ToolCallRecord`）
   - 收集最终 `text` 响应
3. 实现 `buildInitialMessages()`：
   - 从 `AgentRunInput` 构建 AI SDK `CoreMessage[]`
   - 包含 system prompt（通过 `buildSystemPrompt()`）
4. 在 `src/agent/index.ts` 中导出 `ToolLoopAdapter`
5. 通过 `useToolLoopAgent` Feature Flag 切换：
   ```typescript
   const agent = FEATURE_FLAGS.useToolLoopAgent
     ? new ToolLoopAdapter(config)
     : new AgentLoop(config);
   ```
6. 保留旧 `AgentLoop` 代码（Phase 5 清理）

## 验收标准
- [ ] `ToolLoopAdapter.run()` 端到端可执行完整对话
- [ ] 工具调用循环正确：用户消息 → 工具调用 → 结果 → 最终响应
- [ ] Feature Flag 关闭时行为与迁移前完全一致
- [ ] 集成测试覆盖：单轮工具调用、多轮工具调用、无工具调用
- [ ] 所有 14 个 Provider 均可正常执行工具调用
