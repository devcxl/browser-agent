---
name: 'chat-provider-onboarding'
github_issue: 165
depends_on: ['provider-readiness-wizard-i18n', 'chat-content-container']
labels: ['task']
worktree_root: '.worktree/chat-provider-onboarding/'
---

# 首次 Provider 引导与页面集成

## 目标

在 `ChatLayout` 中以完整 Provider 驱动聊天可用性，在无完整配置时每次挂载自动引导一次，并将首页、消息流和输入框接入共享内容容器。

## 实现要点

1. 等待 Provider 读取和迁移完成后，从原始配置派生 `completeProviders`；设置面板仍使用完整原始列表。
2. 首次选择仅使用完整 Provider 及其默认或首个合法模型；没有完整项时清空聊天选择并禁用输入。
3. 实现内存级自动引导：每次 Side Panel 挂载最多打开一次，关闭后显示 CTA，重新挂载后仍可再次自动引导。
4. 有残缺项时按就绪度路由至 `connection` 或 `models`；没有项时从模板步骤开始。
5. 在 App 中以轻量 modal 承载 `ProviderWizard`，实现焦点进入/恢复、Escape/关闭、与设置面板 overlay 互斥；保存后持久化、选中新完整 Provider/模型/Reasoning 并关闭引导。
6. 用 `ChatContentContainer` 统一包裹首页标题、输入框、建议卡片、消息流和聊天输入本体，保留原有全宽背景和滚动区域。
7. 添加加载、一次性自动打开、CTA 重开、残缺路由、保存后可聊天与共享容器接入的集成测试。

## 验收标准

- [ ] Provider 未加载前不显示引导；无完整 Provider 时每次挂载最多自动打开一次。
- [ ] 关闭向导后可通过 CTA 重开，且不会在同一挂载周期再次自动弹出。
- [ ] 残缺 Provider 路由到正确步骤；无 API Key 的完整 Provider 保存后立即可选并可发送。
- [ ] 设置面板与引导弹窗不会同时存在，关闭后焦点恢复到来源控件。
- [ ] 首页、消息流和聊天输入均使用同一内容容器，聊天输入背景和消息滚动行为不回归。
- [ ] 定向测试、`npm run test:run`、`npm run typecheck`、`npm run lint`、Chrome/Firefox 构建通过。

## Worktree

- 路径: `.worktree/chat-provider-onboarding/`
- 分支: `feat/chat-provider-onboarding`
- 创建时机: `/code` 阶段首次执行时自动创建
- 清理时机: PR 合并后自动删除
