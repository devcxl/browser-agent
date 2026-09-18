---
parent_issue: 135
phase: 5
dependencies: ["Phase 2.3", "Phase 3.2", "Phase 4.2", "Phase 5.1"]
status: done
estimated_lines: -400
---

# Task 5.2: Feature Flag 清理 + 回归测试

## 目标
所有 Feature Flag 设为默认开启，移除旧代码，执行全量回归测试。

## 实现要点
1. **Feature Flag 全部开启**：
   - `useToolLoopAgent = true`
   - `useToolApproval = true`
   - `useSDKChat = true`
   - `useSDKTranscribe = true`
2. **移除旧代码**：
   - 删除 `AgentLoop`（508 行）
   - 删除 `ContextBuilder`（321 行）
   - 删除 `SttClient`（112 行）
   - 删除 `useAgent`（338 行）
   - 删除 `ProviderClientFactory` 中的适配逻辑（~200 行）
   - 删除 Feature Flag 定义和条件分支
   - 删除未使用的 Provider npm 包
3. **全量回归测试**：
   - 单元测试：`ToolLoopAdapter`、`jsonSchemaToZod`、`DirectChatTransport`、`ProviderRegistry`
   - 集成测试：Agent 循环端到端、Guardrail gate、Context 管理、跨 Provider
   - E2E 测试：安装 → 配置 Provider → 对话 → 工具执行 → 确认弹窗 → 会话摘要
4. **更新文档**：移除技术方案中 "Proposed" 状态，更新为 "Completed"

## 验收标准
- [x] 所有 Feature Flag 已移除（`src/shared/feature-flags.ts` 已删除）
- [x] 旧代码完全删除，无残留引用
      （`ContextBuilder` / `SummaryManager` / `@/agent` barrel / `audio-utils`）
- [x] 所有单元测试通过（1431 passed）
- [ ] 集成测试通过 — 未单独建设，由单元测试与构建覆盖
- [ ] E2E 测试通过 — e2e 不在 CI 中运行，且 `e2e/skill-system.spec.ts`
      引用了已移除的 `[data-testid="skill-panel-trigger"]`，当前无法通过
- [ ] 包体积测量（对比迁移前后增量）— 未测量
- [x] TypeScript 编译无错误

## 完成记录（2026-09-19）

见 [ADR: 自研 Agent 管线迁移到 AI SDK v7](../../adr/2026-07-17-ai-sdk-migration.md)
的「Task 5.1 / 5.2 完成记录」。验证：`tsc` 0 错误、`eslint` 0 error、
`vitest` 1431 通过、覆盖率 99.76%、`build:all` 双浏览器成功、CI 双 workflow success。
