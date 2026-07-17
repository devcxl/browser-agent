---
parent_issue: 135
phase: 1
dependencies: ["Phase 1.1"]
status: todo
estimated_lines: +80/-321
---

# Task 1.4: 实现 prepareStep 上下文管理替代 ContextBuilder

## 目标
在 `ToolLoopAdapter` 中实现 `prepareStep` 回调，替代 `ContextBuilder` 的 token 预算截断、微压缩和序列修复功能。

## 实现要点
1. 在 `ToolLoopAdapter` 中实现 `prepareStepContext()` 方法
2. **Token 预算截断**：
   - 优先使用 AI SDK `pruneMessages`（若可用）
   - Fallback：保留现有 `ContextBuilder.trimToTokenBudget()` 逻辑
3. **微压缩**：
   - 实现 `microcompactToolResults()`，压缩过长的工具返回结果
   - 支持配置：`microcompactKeepRecent`、`microcompactMinChars`、`microcompactExcludeTools`
4. **序列修复**：
   - AI SDK 内部保证 `tool_call` 序列完整性
   - 仅处理历史消息中的孤立的 tool_call/tool_result 修复
5. 在 `ToolLoopAgent` 构造中配置：
   ```typescript
   prepareStep: async ({ messages, stepNumber }) =>
     this.prepareStepContext(input, messages, stepNumber)
   ```

## 验收标准
- [ ] 长对话（50+ 轮）的 token 预算截断正确
- [ ] 工具结果压缩后不丢失关键信息
- [ ] 历史消息中孤立的 tool_call 被正确修复
- [ ] 单元测试：截断边界、压缩阈值、序列修复
- [ ] 与旧 `ContextBuilder` 行为 A/B 一致
