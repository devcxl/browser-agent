---
parent_issue: 135
phase: 2
dependencies: ["Phase 1.3"]
status: todo
estimated_lines: +60
---

# Task 2.1: 实现 risk 到 toolApproval 的映射

## 目标
在 `ToolLoopAdapter` 中实现 `toolApproval` 回调，将 Guardrail 的 riskLevel 映射为 AI SDK 的 toolApproval 动作。

## 实现要点
1. 在 `ToolLoopAdapter.toolApprovalHandler()` 中实现映射逻辑：
   ```
   low/medium → { action: 'approve' }
   high + localTrusted → { action: 'approve' }
   high + !localTrusted → { action: 'require_approval', metadata }
   critical + expertMode → { action: 'require_approval', metadata }
   critical + !expertMode → { action: 'deny', reason }
   ```
2. 保留 `Guardrail.check()` 调用获取 riskLevel
3. 删除 Guardrail 中的 `requiresConfirmation` 字段
4. 从 `GuardrailCheck` 接口中移除 `requiresConfirmation`
5. 敏感数据过滤 `filterResultForRemote()` 保留在 tool execute 包装中

## 验收标准
- [ ] low/medium 工具直接执行，无需确认
- [ ] high 工具非本地受信环境弹出确认
- [ ] critical 工具非 Expert Mode 被拒绝
- [ ] 敏感数据过滤在 tool 执行后正确调用
- [ ] 单元测试：四种 riskLevel 的映射行为
- [ ] Integration test：Gate 阻止高风险操作
