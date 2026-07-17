---
parent_issue: 135
phase: 2
dependencies: ["Phase 2.1", "Phase 2.2"]
status: todo
estimated_lines: -60
---

# Task 2.3: 删除旧 Guardrail 冗余代码

## 目标
移除 Guardrail 中已被 `toolApproval` 替代的确认流程控制逻辑。

## 实现要点
1. 删除 `IGuardrail` 接口中 `requiresConfirmation` 相关方法/字段
2. 移除 `GuardrailCheck.requiresConfirmation` 字段
3. 移除 Guardrail 类中的确认弹窗控制逻辑（`requiresConfirmation` 计算）
4. 保留的方法：
   - `evaluateRisk()` — 风险评估
   - `filterResultForRemote()` — 敏感数据过滤
   - `preflightCheck()` — 预检
5. 更新所有对 `requiresConfirmation` 的引用（编译错误驱动清理）

## 验收标准
- [ ] Guardrail 不再包含确认流程控制逻辑
- [ ] `evaluateRisk` 和 `filterResultForRemote` 功能完整保留
- [ ] 所有引用 `requiresConfirmation` 的代码已更新
- [ ] TypeScript 编译无错误
- [ ] 现有 Guardrail 单元测试更新后通过
