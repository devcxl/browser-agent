# ADR — 输入框上下文占用进度环

- 日期：2026-08-10
- 关联：Flow #193 / [context-usage-ring 技术方案](../dev/specs/context-usage-ring.md)

## 背景

聊天输入框底部工具行需新增圆形进度环展示上下文占用。PRD 已明确数据口径（`tokenUsage.prompt` ÷ 上限）、展示时机、变色阈值与实现约束（零依赖、内联 SVG）。本文记录三个需要裁决或登记的点：hover 数值格式冲突、隐藏条件扩展、ring 分母与 agent 实际预算的口径偏差。

## 决策 1：hover 数值格式采用 `formatNum`（千位分隔），而非紧凑 `45.2K` 格式

- **冲突**：requirements 阶段 decision-map（`docs/dev/decision-map.md`）示例为 `45.2K / 128K`（紧凑格式）；PRD §6 设计约束则硬性要求"hover 数值格式复用现有 `formatNum`（`ConversationSidebar` 已用）"，而 `formatNum` 基于 `toLocaleString`，输出为 `45,200 / 128,000`。
- **裁决**：遵循 PRD §6 硬约束，复用 `formatNum`。理由：约束明确且为已确认文档的最终表述；KISS —— 不为此引入新的紧凑格式化函数；与侧栏 token 展示风格一致，用户认知成本低。
- **回退路径**：若产品确认必须紧凑格式，只需替换 tooltip 内的格式化调用（新增一个纯函数并配单测），组件契约与测试边界不变。
- **替代方案否决**：自定义 `45.2K` 格式化函数 —— 违反 PRD §6 显式约束，且为单一展示用例新增逻辑（YAGNI）。

## 决策 2：隐藏条件为 `used <= 0 || limit <= 0`（PRD 字面仅要求 `prompt === 0`）

- PRD 只规定"新会话或未运行过请求（`tokenUsage.prompt === 0`）时隐藏"。
- `limit <= 0` 为防御性扩展：模型配置非法（`limit.context` 被置 0）或用户将 `contextWindowTokens` 置 0 时，若显示环会呈现除零/100%+ 的误导比例。此情形下隐藏优于展示错误数据。
- 该扩展不改变任何 PRD 规定的可见行为，只覆盖数据异常路径。

## 决策 3：上限解析位置 —— `MessageInput` 组件内，而非 `App` 预计算

- `MessageInput` 已从 `providers` 派生 `activeModel`（L41-43），`activeModel.limit.context` 在此自然可得；`App` 只需透传 `agentSettings.contextWindowTokens` 作为回退值。
- 解析链 `activeModel?.limit?.context ?? contextWindowTokens ?? 128000` 与 `useAgent.ts` L171 构造 `agentConfig.contextWindowTokens` 的位置语义对齐，避免 App 侧新增派生状态。
- 否决：在 `App` 预计算 `contextLimit` 再传入 —— 需在 App 与 MessageInput 两处维护同一模型解析逻辑；MessageInput 已持有 activeModel，传预计算值是重复建模。

## 登记事项：ring 分母与 agent 实际预算的口径偏差（不在此 flow 修复）

- ring 分母回退链：`modelConfig.limit.context` → `agentSettings.contextWindowTokens` → 128000（PRD 规定）。
- `useAgent.ts` L171 当前实现：`modelConfig?.limit?.context ?? 128000`（未读 `agentSettings`）。
- 不一致场景：模型无 `limit.context` 且用户自定义了 `contextWindowTokens` 时，ring 展示的比例基于设置值，而 agent 实际压缩/截断预算仍是 128000。
- 处理：本 flow 不修改 `useAgent`（PRD 非目标："不改变现有上下文压缩/截断策略"）。登记为后续对齐项，建议将 `useAgent` 改为 `modelConfig?.limit?.context ?? savedAgentSettings?.contextWindowTokens ?? 128000`，使展示口径与实际预算一致。

## 兼容性

- 零新增依赖，符合 `2026-07-17-ai-sdk-migration.md`（不改 ProviderConfig/存储/AI SDK 消息格式）与 `2026-07-18-chat-ui-local-primitives.md`（本地原语、不引组件库）约束。
- 不改 `ChatContext` 状态机，会话切换重置沿用既有行为。
