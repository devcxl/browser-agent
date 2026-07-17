---
parent_issue: 135
phase: 2
dependencies: ["Phase 1.3"]
status: todo
estimated_lines: +100/-100
---

# Task 2.2: 重建确认弹窗流程

## 目标
将确认弹窗从 `useAgent` 的 `onConfirm` hook 迁移到 AI SDK `toolApproval` 回调驱动的独立 React 状态管理。

## 实现要点
1. 移除 `useAgent` 中的 `onConfirm` / `confirmResolveRef` Promise 模式
2. 创建独立的状态管理 Hook 或 Context：
   ```typescript
   // src/chat/use-approval-dialog.ts
   const { pendingApproval, approve, deny } = useApprovalDialog();
   ```
3. `toolApproval` 回调中调用 UI 层 `onRequestApproval` 暂停执行
4. 确认弹窗组件独立渲染，不通过 UIMessage 通道
5. `GuardrailCheck` 的 metadata 传递给确认弹窗显示
6. 确认弹窗 UI 组件保持不变（Title、Description、Risk Badge）

## 验收标准
- [ ] 高风险工具调用时弹出确认弹窗
- [ ] 用户批准后工具继续执行
- [ ] 用户拒绝后工具被跳过
- [ ] Expert Mode + critical 工具正确弹出确认
- [ ] 确认弹窗 UI 与迁移前一致
- [ ] E2E 测试：完整确认流程
