---
parent_issue: 135
phase: 5
dependencies: ["Phase 2.3", "Phase 3.2", "Phase 4.2", "Phase 5.1"]
status: todo
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
- [ ] 所有 Feature Flag 已移除（不再有新旧代码分支）
- [ ] 旧代码完全删除，无残留引用
- [ ] 所有单元测试通过
- [ ] 集成测试通过
- [ ] E2E 测试通过
- [ ] 包体积测量（对比迁移前后增量）
- [ ] TypeScript 编译无错误
