---
name: 'chat-content-container'
github_issue: 166
depends_on: []
labels: ['task']
worktree_root: '.worktree/chat-content-container/'
---

# 共享响应式聊天内容容器

## 目标

建立唯一的聊天主内容宽度原语，并移除 `ChatView` 内部与该原语冲突的固定最大宽度。

## 实现要点

1. 新增无状态 `ChatContentContainer`，仅管理宽度与水平边距，支持 `className`。
2. 断点规则：小于 `1024px` 保留安全边距，`1024-1439px` 为 90%，不小于 `1440px` 为 75%，不使用固定 `max-width`。
3. 从 `ChatView` 消息列移除 `max-w-3xl`，保留其滚动、背景和垂直布局职责。
4. 添加组件/结构测试，确保宽度规则只来自容器且聊天消息列不再保留旧限制。

## 验收标准

- [ ] 容器类准确覆盖三个断点区间，且不定义滚动或背景职责。
- [ ] `ChatView` 不再含 `max-w-3xl` 宽度约束。
- [ ] 组件测试通过，`npm run typecheck` 与 `npm run lint` 通过。

## Worktree

- 路径: `.worktree/chat-content-container/`
- 分支: `feat/chat-content-container`
- 创建时机: `/code` 阶段首次执行时自动创建
- 清理时机: PR 合并后自动删除
