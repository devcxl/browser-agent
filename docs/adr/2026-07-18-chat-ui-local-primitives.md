# ADR: 聊天配置使用本地 UI 原语

- **日期**: 2026-07-18
- **状态**: Proposed
- **决策者**: Felix
- **相关**: [聊天首次体验与响应式布局技术方案](../dev/specs/chat-first-run-experience.md)

---

## 背景

聊天首页、消息流和输入框目前各自定义宽度；输入框内的 Provider、Model、Reasoning 使用原生 `<select>`。原生菜单无法稳定继承应用主题，也不能满足向上展开、点击外部关闭和键盘交互要求。

项目已使用 React、Tailwind 和主题变量，但没有可复用的 Select/Listbox 组件。本次只需覆盖聊天输入框中的三个选择器。

## 决策

1. 新增 `ChatContentContainer`，作为首页和聊天页所有主内容的唯一响应式宽度来源。
2. 新增无依赖的 `ChatSelect`，仅用于聊天输入框内的 Provider、Model、Reasoning。
3. `ChatSelect` 使用原生 button + WAI-ARIA listbox 语义，菜单通过 React Portal 和 `position: fixed` 渲染。
4. 不替换设置面板或其他页面的原生控件。

容器断点：`<1024px` 全宽安全边距，`1024–1439px` 为 90%，`>=1440px` 为 75%，不设固定 `max-width`。

## 替代方案

### 方案 A：保留原生 `<select>`

不采用。只能美化闭合状态，菜单仍由浏览器绘制，无法满足主题一致性和定位要求。

### 方案 B：引入 Radix、Headless UI 等组件库

不采用。本需求只使用三个局部选择器；新增依赖扩大扩展包、构建和浏览器回归面，收益不足。

### 方案 C：一次性建立全应用表单组件库

不采用。范围包含设置页和其他控件，与 #161 的明确排除项冲突。

## 影响

- 新增两个局部组件和对应组件测试。
- `MessageInput` 从原生 select 测试迁移到基于角色和键盘交互的测试。
- Portal 定位需要处理 resize、scroll、焦点恢复和组件卸载清理。
- 不新增 npm 依赖，不影响 Agent 或 Provider 传输层。

## 后续行动

1. 实现共享容器并移除 `max-w-3xl` 的重复约束。
2. 实现并测试 `ChatSelect` 的键盘、ARIA 和视口边界行为。
3. 在 Chrome MV3 与 Firefox MV3 验收浅色、深色主题下的菜单样式。
