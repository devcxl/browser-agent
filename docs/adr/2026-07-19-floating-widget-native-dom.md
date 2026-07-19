# ADR: 浮动控件使用原生 DOM + Shadow Root，不引入 React

- **日期**: 2026-07-19
- **状态**: Proposed
- **决策者**: Felix
- **相关**: [浮动聊天入口技术方案](../dev/specs/floating-chat-entry.md)、[#172](https://github.com/devcxl/browser-agent/issues/172)

---

## 背景

浮动入口的 content script 侧需要渲染：圆形按钮、快捷菜单（一项）、面板外框（含 iframe）。共约十个静态元素，交互为拖拽、点击、右键菜单。

WXT 提供 `createShadowRootUi`，可在 content script 中挂载 React 应用并注入 Tailwind 样式。项目主 UI 技术栈是 React + Tailwind，存在「统一技术栈」的吸引力；但 content script 的 bundle 会注入到每个页面，体积和启动成本直接影响所有网页。

## 决策

1. content 侧控件用**原生 DOM API + Shadow Root + 内联 `<style>`** 实现，不引入 React、不引入 Tailwind、不新增依赖。
2. 拖拽、吸附、开合等逻辑拆为**纯函数模块**（`drag.ts`、`blacklist.ts`），与 DOM 组装（`widget.ts`）分离，保证可单测。
3. content 侧文案（tooltip、菜单项）仅个位数，内置 zh-CN/en 两份字面量，按 `preferences.language` 取值，不引入 i18n 框架。
4. 样式约 120 行手写 CSS，全部限定在 Shadow Root 内，不读写页面样式。

## 替代方案

### 方案 A：`createShadowRootUi` + React + Tailwind（不采用）

与主技术栈统一，可复用 sidepanel 组件。

不采用。需要把 React 运行时和 Tailwind 产物打进 content script 并注入每个页面，bundle 与启动成本上升；而 UI 只有约十个静态元素，组件化收益趋近于零。与 [聊天本地 UI 原语 ADR](2026-07-18-chat-ui-local-primitives.md) 「只为真实需求引入复杂度」的方向一致。

### 方案 B：按钮也放进 iframe（不采用）

整个控件（按钮 + 面板）都在 iframe 内渲染，折叠时 iframe 缩小为按钮大小。

不采用。拖拽需要高频指针事件与视口级定位，iframe 边界会成为拖拽的天花板（指针移出 iframe 即丢事件）；折叠/展开还要 iframe 内外通信调整尺寸，复杂度高于收益。

## 影响

- content script bundle 增量极小（原生 TS + 少量 CSS），对全网页注入的性能影响可控。
- content 侧出现一小套手写 DOM 代码，与 sidepanel 的 React 代码风格不同；通过纯逻辑/DOM 分层与单测控制质量。
- 未来若控件复杂度显著增长（多级菜单、富交互），可重新评估迁移到 `createShadowRootUi`，本决策不妨碍该路径。

## 后续行动

1. 按纯函数/DOM 分层实现 `drag.ts`、`blacklist.ts`、`widget.ts`、`panel.ts`。
2. 为纯函数层补单测；DOM 层由 e2e 覆盖。
