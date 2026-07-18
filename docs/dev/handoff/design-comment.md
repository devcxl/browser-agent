## 技术方案

Issue #161 采用最小的 Side Panel 局部改造：

- 新增共享 `ChatContentContainer`，统一首页、消息流和输入框宽度：`<1024px` 全宽安全边距，`1024–1439px` 90%，`>=1440px` 75%，不再使用固定 `max-w-3xl`。
- 新增无依赖、Portal 渲染的 `ChatSelect`，仅替换聊天输入框的 Provider、Model、Reasoning；支持主题、ARIA、键盘、外部点击关闭、焦点恢复和视口上下翻转。
- 抽取 Provider 就绪度纯函数；完整条件为 Endpoint + 至少一个合法 Model，不要求 API Key。聊天只使用完整 Provider，设置页继续管理全部 Provider。
- `ChatLayout` 在 Provider 加载完成后按挂载周期自动打开一次配置向导；残缺配置预填并进入 Connection 或 Models；关闭后保留 CTA，保存后立即选中新 Provider/Model/Reasoning。
- `ProviderWizard` 新增可选 `initialStep` 并完整接入现有中英文 i18n；不改 Provider 存储、Agent 或网络层。

## ADR

- `docs/adr/2026-07-18-chat-ui-local-primitives.md`
- `docs/adr/2026-07-18-provider-onboarding-state.md`

完整文档：`docs/dev/specs/chat-first-run-experience.md`
