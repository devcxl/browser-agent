---
parent_issue: 135
phase: 1
dependencies: []
status: todo
estimated_lines: +150/-508
---

# Task 1.1: 创建 ToolLoopAdapter 包装器

## 目标
实现 `ToolLoopAdapter` 类，作为 AI SDK `ToolLoopAgent` 与现有 `IAgentRuntime` 接口之间的适配层。

## 实现要点
1. 新建 `src/agent/tool-loop-adapter.ts`
2. 实现 `IAgentRuntime` 接口（`run()`、`abort()`）
3. `run()` 内部：
   - 构建 AI SDK `tools` 对象（调用 `buildTools()`）
   - 构建初始 `messages`（调用 `buildInitialMessages()`）
   - 创建 `ToolLoopAgent` 实例，配置 `maxSteps`、`stopWhen`、`onStepFinish`
   - 预留 `prepareStep` 和 `toolApproval` 回调接口（Phase 1.4 和 Phase 2 实现）
4. `buildTools()`：遍历 `IToolRegistry.getAllTools()`，调用 `jsonSchemaToZod()` 转换为 AI SDK `tool()` 参数
5. `abort()`：通过 `AbortController.signal` 控制中断
6. 通过 Feature Flag `useToolLoopAgent` 控制新旧实现切换

## 验收标准
- [ ] `ToolLoopAdapter` 实现 `IAgentRuntime` 所有方法
- [ ] 单元测试：正常完成、提前终止、maxSteps 限制
- [ ] Feature Flag 关闭时仍使用旧 `AgentLoop`
- [ ] TypeScript 编译无错误
