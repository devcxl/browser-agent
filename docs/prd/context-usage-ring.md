# PRD — 输入框思考等级旁展示会话上下文占用进度环

- Flow: #193
- 日期: 2026-08-10
- 状态: 已确认

## 1. 背景与问题

聊天侧栏中，用户无法直观感知当前会话上下文（Context Window）的占用情况。当上下文接近模型上限时，Agent 行为可能发生意外变化（触发压缩、截断），用户对此毫无感知。

## 2. 目标

在聊天输入框底部工具行、思考等级（Reasoning Effort）下拉框右侧，新增一个圆形进度环，实时展示当前会话上下文占用比例，帮助用户感知"上下文还剩多少"。

## 3. 验收标准

1. **位置**：进度环位于思考等级下拉框右侧、麦克风按钮左侧（工具行内）。
2. **数据口径**：占用率 = 最近一次请求的 `prompt tokens`（`tokenUsage.prompt`，即实际发送给 LLM 的完整上下文 token 数）÷ 上下文上限。
3. **上限来源**：优先模型配置 `modelConfig.limit.context`；缺失时回退 `agentSettings.contextWindowTokens`（默认 128000）。
4. **展示时机**：新会话或未运行过请求（`tokenUsage.prompt === 0`）时**隐藏**进度环，避免噪音。
5. **视觉反馈**：
   - 占用率 ≥80% 时进度环变色提醒（橙/红）；
   - hover 显示数值（如 `45.2K / 128K`）。
6. **会话切换**：切换到其他会话时进度环随 `tokenUsage` 重置而隐藏/更新，无残留旧值。

## 4. 非目标

- 不改变现有上下文压缩/截断策略。
- 不做实时 token 估算（以服务端返回的 usage 为准）。
- 不修改 `ConversationSidebar` 现有 token 展示。

## 5. 现有数据链路（已确认）

- `ChatContext.tokenUsage: TokenUsage`（`{prompt, completion}`）— 每次请求结束经 `onTokenUsage` 更新，切换会话时重置为 `{0,0}`（`ChatContext.tsx` L125/L172/L180-185）。
- `App.tsx` 已解构 `tokenUsage`，并经 `inputProps` 传给 `MessageInput`。
- `useAgent.run` 使用 `contextWindowTokens: modelConfig?.limit?.context ?? 128000`（`useAgent.ts` L171）。
- `MessageInput` 工具行渲染顺序：provider-select → model-select → reasoning-select（思考等级）→ micButton → 右侧发送/中止按钮（`MessageInput.tsx` L195-243）。

## 6. 设计约束

- 纯 UI 组件，无新增依赖；圆形进度环用 SVG 实现。
- 文案走 i18n（`locales/zh-CN.json` / `en.json`），hover 数值格式复用现有 `formatNum`（`ConversationSidebar` 已用）。
