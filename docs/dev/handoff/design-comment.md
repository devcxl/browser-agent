## 技术方案

**核心架构**：content script 注入 Shadow DOM 容器（按钮/拖拽/面板外框），面板内通过 iframe 加载 `sidepanel.html?embedded=1`，聊天逻辑零复制，会话/设置/主题/i18n 与 Side Panel 天然共享。

**决策摘要**：

| 决策 | 选择 |
| --- | --- |
| 聊天承载 | iframe 内嵌 sidepanel.html，懒加载、加载后常驻 |
| content 侧 UI | 原生 DOM + Shadow Root + 内联样式，不引 React/Tailwind/新依赖 |
| 拖拽吸附 | Pointer Events + transform，松手吸附左/右边缘 |
| 位置 | `{ side, top }` 全局存储于 `floatingButtonSettings` |
| 开合通信 | iframe → 外层 `close-request`（postMessage + 白名单校验），单向 |
| 开关语义 | 脚本常驻 + 启动早退 + `storage.onChanged` 实时挂载/卸载 |
| sidepanel 适配 | `embedded=1` 时渲染内嵌头部（关闭按钮），其余不变 |

**存储扩展**：`StorageSchema.floatingButtonSettings = { enabled, position, blacklist }`，默认值合并，无迁移。

**ADR 兼容性**：与既有 3 个 ADR（AI SDK 迁移、本地 UI 原语、Provider 引导）无冲突；Provider 引导在面板内按新挂载周期出现一次，属预期行为。

**主要风险**：严格 CSP 站点 iframe 加载（e2e 覆盖 + 降级提示）；每页常驻 iframe 内存（懒加载 + 开关关闭即销毁）。

## ADR

- [ADR: 浮动聊天入口采用 iframe 内嵌 sidepanel.html](../adr/2026-07-19-floating-entry-iframe.md)
- [ADR: 浮动控件使用原生 DOM + Shadow Root，不引入 React](../adr/2026-07-19-floating-widget-native-dom.md)

完整文档：`docs/dev/specs/floating-chat-entry.md`
