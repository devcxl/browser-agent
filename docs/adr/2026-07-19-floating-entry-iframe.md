# ADR: 浮动聊天入口采用 iframe 内嵌 sidepanel.html

- **日期**: 2026-07-19
- **状态**: Proposed
- **决策者**: Felix
- **相关**: [浮动聊天入口技术方案](../dev/specs/floating-chat-entry.md)、[#172](https://github.com/devcxl/browser-agent/issues/172)

---

## 背景

需求是在每个网页内提供浮动按钮，点击展开手机大小的聊天面板，且面板具备完整 Agent 能力（工具调用、Markdown、Provider 引导）。

现有聊天应用运行在 Side Panel 扩展页面上下文：`useChat` + `DirectChatTransport` + `ToolLoopAdapter`，直接访问 `browser.*` API、`ConfigStore`、主题与 i18n 体系（见 `src/entrypoints/sidepanel/`）。

把这套能力搬进页面有三条路径：iframe 加载扩展页面、content script 内重挂载 React 组件、或重写一套轻量聊天。

## 决策

1. **面板通过 iframe 加载 `sidepanel.html?embedded=1`**，聊天逻辑零复制。`sidepanel.html` 声明为 `web_accessible_resources`（仅 `<all_urls>` 可嵌入）。
2. **iframe 懒加载、加载后常驻**：首次打开面板才设置 `src`；关闭仅隐藏容器，不销毁 iframe，聊天上下文跨开合保留；总开关关闭或进入黑名单时随 host 一并销毁。
3. **内嵌差异通过查询参数表达**：sidepanel 检测 `embedded=1` 时渲染含关闭按钮的内嵌头部，其余行为（含 Provider 引导、会话存储）完全不变。
4. **外层与 iframe 单向通信**：仅 iframe → 外层的 `close-request`（`window.postMessage` + `event.source` 与消息类型白名单校验）；外层 → iframe 无消息，主题/语言/会话全部经共享存储同步。

## 替代方案

### 方案 A：Shadow DOM 重挂载 React 组件（不采用）

在 content script 中用 `createShadowRootUi` 挂载 sidepanel 的 React 组件树。

不采用。聊天引擎依赖扩展页面上下文：工具调用经 `browser.*` API 与 background JSON-RPC，会话/Provider/主题直读 `ConfigStore`。content script 是隔离世界，`browser.tabs` 等 API 不可用，需要为整个工具链和存储层新建消息代理，改动面远超本需求，且引入两套运行环境差异的长期维护成本。

### 方案 B：页面内独立轻量聊天（不采用）

content script 内实现纯文本对话，工具调用经消息桥转发给 background。

不采用。与「完整 Agent 能力」的需求结论冲突；且会产生第二套聊天 UI/会话模型，会话与 Side Panel 割裂。

### 方案 C：每次关闭销毁 iframe（不采用）

关闭面板即移除 iframe，下次打开重新加载。

不采用。每次打开丢失聊天滚动与输入状态、重复初始化应用；内存收益只在面板生命周期内存在。选择常驻，用「开关关闭/黑名单即销毁」控制总量。

## 影响

- `wxt.config.ts` 新增 `web_accessible_resources` 声明；`sidepanel.html` 可被任意网页 iframe 嵌入（内容跨源不可读，风险与现状相当）。
- sidepanel 增加一个 `embedded` 分支（内嵌头部 + `close-request`），默认路径行为不变。
- iframe 常驻带来每页一个扩展文档的内存占用；懒加载保证未使用者零开销。
- 与 Provider 引导 ADR 的交互：iframe 每次创建为新挂载周期，无完整 Provider 时面板内会再次出现一次向导——语义与「每次启动提示一次」一致，属预期行为。
- 会话、设置、主题、i18n 无需任何同步机制，天然与 Side Panel 一致。

## 后续行动

1. 实现 content 侧面板容器与懒加载/常驻逻辑。
2. sidepanel 实现 `embedded` 模式内嵌头部与 `close-request`。
3. e2e 验证严格 CSP 站点（github.com）iframe 可加载；失败时容器内显示降级提示。
