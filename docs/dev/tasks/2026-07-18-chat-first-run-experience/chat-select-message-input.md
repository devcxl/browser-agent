---
name: 'chat-select-message-input'
github_issue: 164
depends_on: []
labels: ['task']
worktree_root: '.worktree/chat-select-message-input/'
---

# ChatSelect 与 MessageInput 配置选择器

## 目标

以无依赖、可访问的 Portal Listbox 替换 `MessageInput` 中的 Provider、Model、Reasoning 原生选择器，并保留已有联动回调语义。

## 实现要点

1. 新增 `ChatSelect`，用 button/`combobox`、`listbox` 和 `option` 角色实现选择器。
2. 三个实例共享 `openSelectId`；支持 ArrowUp/ArrowDown 循环、Enter 选择、Escape 与外部点击关闭、焦点恢复和卸载清理。
3. 通过 `createPortal` 和 `position: fixed` 渲染菜单；打开、`resize`、捕获阶段 `scroll` 时重算位置，底部空间不足时向上翻转。
4. 在 `MessageInput` 替换三处原生 `<select>`，维持 Provider/Model 改变时重置下游选择和 Reasoning 不支持时的不可交互状态。
5. 将现有依赖 `<option>` 的测试迁移为角色与用户键盘交互断言。

## 验收标准

- [ ] 三个聊天配置项不再渲染原生 `<select>`，且回调和联动行为不变。
- [ ] ARIA、键盘、外部点击、焦点恢复、禁用状态、内部滚动和上下翻转测试通过。
- [ ] 菜单不受 Side Panel 或输入框 overflow 裁剪。
- [ ] 定向测试、`npm run typecheck` 与 `npm run lint` 通过。

## Worktree

- 路径: `.worktree/chat-select-message-input/`
- 分支: `feat/chat-select-message-input`
- 创建时机: `/code` 阶段首次执行时自动创建
- 清理时机: PR 合并后自动删除
