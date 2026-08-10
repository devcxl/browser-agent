# 输入框思考等级旁上下文占用进度环技术方案

> 状态：Proposed
> 日期：2026-08-10
> 关联：[#193 输入框思考等级旁展示会话上下文占用进度环](https://github.com/devcxl/browser-agent/issues/193)
> 上游 PRD：[context-usage-ring.md](../../prd/context-usage-ring.md)

## 1. 目标与边界

在聊天输入框底部工具行、思考等级（Reasoning Effort）下拉框右侧、麦克风按钮左侧，新增一个圆形进度环，实时展示当前会话上下文占用比例（最近一次请求的 `prompt` token 数 ÷ 上下文上限），帮助用户感知"上下文还剩多少"。

边界（非目标）：

- 不改变 Agent/LLM 调用链、压缩/截断策略；不改 `ChatContext`、`useAgent`、`TokenUsage` 类型。
- 不做实时 token 估算，以服务端返回的 usage 为准。
- 不修改 `ConversationSidebar` 现有 token 展示。
- 不新增 npm 依赖；进度环用内联 SVG 实现。
- 不改 `ChatProviderSDK` 路径（其 `tokenUsage` 恒为 `{0,0}`，进度环自然隐藏，与现有 `ConversationSidebar` 行为一致）。

## 2. 现状与数据链路

```text
useAgent.run 完成 → onTokenUsage(output.tokenUsage)            [useAgent.ts L299-301 / L435-437]
  → ChatProviderLegacy setTokenUsage                           [ChatContext.tsx L172]
  → ChatContextValue.tokenUsage                                [ChatContext.tsx L256]
  → ChatLayout 解构 tokenUsage                                  [App.tsx L44]
  → inputProps                                                  [App.tsx L303-315]
  → MessageInput（本方案新增渲染）
  ↓
会话切换 → useEffect(activeId) 重置 tokenUsage = {0,0}          [ChatContext.tsx L180-185]
```

上下文上限现状（两处口径）：

- `useAgent.ts` L171：`contextWindowTokens: modelConfig?.limit?.context ?? 128000`（未读 `agentSettings`）。
- PRD 要求进度环口径：`modelConfig.limit.context` 缺失时回退 `agentSettings.contextWindowTokens`（默认 128000），后者在 `App.tsx` L58-67 / L115-124 已加载维护。

> 注意：ring 的分母回退链包含 `agentSettings.contextWindowTokens`，与 `useAgent` 当前实际预算（`?? 128000`）在"模型无 `limit.context` 且用户自定义了 contextWindowTokens"时不一致。本 flow 不改 `useAgent`（PRD 非目标），偏差登记见 §8。

## 3. 决策摘要

| 决策 | 选择 | 原因 |
| --- | --- | --- |
| 进度环实现 | 内联 SVG（约 20px 圆形，dasharray/dashoffset 画弧） | 零依赖、无额外包体，PRD 约束 |
| 上限解析位置 | `MessageInput` 内：`activeModel?.limit?.context ?? contextWindowTokens ?? 128000` | `MessageInput` 已内部派生 `activeModel`（L41-43），与 `useAgent` 构造 agentConfig 的位置对齐；App 只透传 `agentSettings.contextWindowTokens`，无需新增派生状态 |
| 隐藏条件 | `used <= 0 || limit <= 0` 返回 null | PRD 要求 `prompt===0` 隐藏；`limit<=0` 为除零防御（模型非法配置、设置被置 0 时不可见，不显示误导比例） |
| hover 数值格式 | 复用 `formatNum`（`45,200 / 128,000`） | PRD §6 硬约束；与 `ConversationSidebar` 一致。decision-map 示例 `45.2K / 128K` 视为示意，裁决见 ADR |
| 变色阈值 | 占用率 ≥ 80% 时进度弧用 `text-warning` | 常量 `WARNING_THRESHOLD = 0.8`，语义通过 `data-state="warning|normal"` 暴露给测试 |
| 会话切换重置 | 零改动，复用 `ChatContext` 既有重置 | L180-185 已把 `tokenUsage` 重置为 `{0,0}`，环随 `prompt===0` 隐藏，无残留 |

## 4. 目标架构

```text
ChatContext.tokenUsage ──┐
agentSettings.contextWindowTokens ──┼──> App.inputProps ──> MessageInput ──> ContextUsageRing
activeModel (MessageInput 内部派生) ─┘
```

### 4.1 Module：`ContextUsageRing`

新文件 `src/entrypoints/sidepanel/components/ContextUsageRing.tsx`，纯展示组件 + 导出一个纯函数。

Interface（组件 Props）：

```ts
interface ContextUsageRingProps {
  /** 最近一次请求发送给 LLM 的完整上下文 token 数（tokenUsage.prompt） */
  used: number;
  /** 上下文上限（模型 limit.context 或 agentSettings.contextWindowTokens） */
  limit: number;
}
```

Interface（纯函数）：

```ts
/** 占用率（0-100 整数），limit<=0 时防御性返回 0 */
export function contextUsagePercent(used: number, limit: number): number;
```

渲染行为：

- 隐藏：`used <= 0 || limit <= 0` 时组件返回 `null`。
- SVG：20px 圆形，背景轨 + 进度弧；进度弧 `stroke-dashoffset = CIRCUMFERENCE * (1 - percent / 100)`，`transform="rotate(-90 …)"` 使起点在 12 点方向。
- 变色：`percent >= WARNING_THRESHOLD * 100`（即 ≥80）时进度弧 `text-warning`，否则 `text-primary`；wrapper 上暴露 `data-state="warning" | "normal"`。
- hover：wrapper 设 `title` 与 `aria-label`，文案 = `t('chat.contextUsage.tooltip', { used: formatNum(used, locale), limit: formatNum(limit, locale) })`。
- 语义锚点：wrapper `data-testid="context-usage-ring"`；进度弧 `data-testid="context-usage-ring-progress"`。

几何常量（模块内私有）：`SIZE=20`、`STROKE=2.5`、`RADIUS=(SIZE-STROKE)/2`、`CIRCUMFERENCE=2π·RADIUS`、`WARNING_THRESHOLD=0.8`。

### 4.2 Module：`MessageInput` 集成

Props 新增两个可选字段（既有调用方与测试零破坏）：

```ts
tokenUsage?: TokenUsage;              // 来自 App 透传；未传视为 {0,0}
contextWindowTokens?: number;         // agentSettings.contextWindowTokens；默认 128000
```

组件内派生（与 useAgent L171 的语义对齐）：

```ts
const contextLimit = activeModel?.limit?.context ?? contextWindowTokens ?? 128000;
```

渲染位置：`hasConfigRow` 片段结束之后、`{micButton}` 之前：

```tsx
{tokenUsage && <ContextUsageRing used={tokenUsage.prompt} limit={contextLimit} />}
{micButton}
```

说明：

- 工具行 DOM 顺序：reasoning-select → context-usage-ring → mic-button → 右侧发送/中止。
- `hasConfigRow` 为 false（无 Provider）时无请求发生，`tokenUsage` 恒 `{0,0}`，环不渲染，无需额外分支。
- home 变体（空态首页）同样恒为 `{0,0}`，环不渲染。

### 4.3 `App.tsx`

`inputProps`（L303-315）追加两行，无其他改动：

```ts
tokenUsage,
contextWindowTokens: agentSettings.contextWindowTokens,
```

### 4.4 i18n

`i18n/types.ts` 的 `MessageSchema.chat` 新增 `contextUsage` 段；`zh-CN.json` / `en.json` 同步新增：

```json
"contextUsage": {
  "tooltip": "上下文占用：{used} / {limit}"
}
```

```json
"contextUsage": {
  "tooltip": "Context usage: {used} / {limit}"
}
```

`t` 的 `applyVars` 支持 `{var}` 插值（I18nProvider.tsx L34-44），数值由 `formatNum` 预先格式化后作为 vars 传入（zh-CN 默认 locale 下 `45200 → "45,200"`、`128000 → "128,000"`）。

## 5. 文件边界

| 文件 | 变更 |
| --- | --- |
| `src/entrypoints/sidepanel/components/ContextUsageRing.tsx` | 新增组件 + `contextUsagePercent` 纯函数 + 几何/阈值常量 |
| `src/entrypoints/sidepanel/components/MessageInput.tsx` | 新增 `tokenUsage` / `contextWindowTokens` props，渲染环 |
| `src/entrypoints/sidepanel/App.tsx` | `inputProps` 追加 `tokenUsage`、`contextWindowTokens` |
| `src/entrypoints/sidepanel/i18n/types.ts` | `MessageSchema.chat` 新增 `contextUsage` |
| `src/entrypoints/sidepanel/locales/zh-CN.json` | 新增文案 |
| `src/entrypoints/sidepanel/locales/en.json` | 新增文案 |
| `src/entrypoints/sidepanel/__tests__/ContextUsageRing.test.tsx` | 新增组件测试 |
| `src/entrypoints/sidepanel/__tests__/MessageInput.test.tsx` | 扩展集成测试 |

零改动：`ChatContext.tsx`、`types.ts`、`ConversationSidebar.tsx`、`useAgent.ts`。

## 6. Testing Decisions

测试环境：vitest + jsdom + @testing-library/react（vitest.config.ts），组件测试沿用 `MessageInput.test.tsx` 的 `wrappedRender`（`I18nProvider` 包裹，默认 locale zh-CN）与 `mockBrowserStorage` 惯例。

### 6.1 占用率计算与 clamp

- Test Seam: `contextUsagePercent(used, limit)` — `ContextUsageRing.tsx` 导出的纯函数。
- Observable Result: 返回 0–100 整数。`(45200, 128000) → 35`；`(128000, 128000) → 100`；`(150000, 128000) → 100`（clamp 上限）；`(0, 128000) → 0`；`(100, 0) → 0` 且不抛错（`limit<=0` 防御）；`(-1, 128000) → 0`（clamp 下限）。
- Test Level: unit（纯函数，无 DOM）。

### 6.2 隐藏条件（prompt===0 / 无有效上限）

- Test Seam: `<ContextUsageRing used={…} limit={…} />` 渲染（RTL + I18nProvider）。
- Observable Result: `used=0, limit=128000` → `queryByTestId('context-usage-ring')` 为 `null`；`used=45200, limit=0` → `null`；`used=45200, limit=128000` → 存在。
- Test Level: component。

### 6.3 变色阈值（≥80%）

- Test Seam: 组件渲染后读 wrapper 的 `data-state` 与进度弧 class。
- Observable Result: 恰好 80%（`used=102400, limit=128000`）→ `data-state="warning"`，进度弧 class 含 `text-warning`；79%（`used=101120, limit=128000`）→ `data-state="normal"`，class 含 `text-primary`；100%（`used=128000`）仍为 `warning`。
- Test Level: component。

### 6.4 hover 数值格式化

- Test Seam: 组件渲染后读 wrapper 的 `title` / `aria-label`。
- Observable Result: `used=45200, limit=128000` → 文案为"上下文占用：45,200 / 128,000"（zh-CN locale，`formatNum` 千位分隔）；`used=1000, limit=128000` → 含"1,000"与"128,000"。
- Test Level: component。

### 6.5 进度弧几何闭环（percent → dashoffset）

- Test Seam: `data-testid="context-usage-ring-progress"` 的 `stroke-dashoffset` 属性。
- Observable Result: 按同一几何公式计算期望值 `CIRC = 2π·((20-2.5)/2)`：percent=25 → `offset ≈ 0.75·CIRC`（数值容差 ±0.5）；percent=100 → `offset ≈ 0`；percent=0 → `offset ≈ CIRC`。
- Test Level: component（验证纯函数结果确实驱动了 SVG 渲染）。

### 6.6 MessageInput 集成（props 传入与渲染位置）

- Test Seam: `<MessageInput tokenUsage contextWindowTokens … />`（沿用现有 `wrappedRender`，需带含模型的 `providers` 使工具行渲染）。
- Observable Result: `tokenUsage={{prompt: 45200, completion: 0}}` → `context-usage-ring` 存在且 `aria-label` 含"45,200 / 128,000"；`tokenUsage` 未传或 `prompt=0` → 不存在；`activeModel.limit.context` 存在时优先于 `contextWindowTokens`（`limit.context=32768` 时 `aria-label` 含"32,768"）；DOM 顺序为 `reasoning-select`（或 `reasoning-unsupported`）→ `context-usage-ring` → `mic-button`（用 `compareDocumentPosition` 或 container 内 querySelectorAll 顺序断言）。
- Test Level: component（MessageInput × ContextUsageRing 集成）。

### 6.7 会话切换重置（无残留旧值）

- Test Seam: 复用 `ChatContext` 既有会话切换重置（L180-185），本方案不改该模块；环侧的契约面是"`prompt===0` 即隐藏"（6.2 已覆盖）。
- Observable Result: `ChatContext.test.tsx` 现有断言基础上，追加一条回归：切换 `activeId` 后 context value 的 `tokenUsage` 为 `{0,0}`（若已有等价断言则跳过）。
- Test Level: integration（ChatContext 既有测试，仅补断言，不改逻辑）。

## 7. ADR 兼容性

本方案零依赖、纯 UI 增量，与既有 ADR（AI SDK 迁移、Chat UI 本地原语、Floating Widget）无冲突：

- 不改 `ProviderConfig` / `ConfigStore` / AI SDK 消息格式，符合 `2026-07-17-ai-sdk-migration.md` 约束。
- 不新增抽象层或依赖，符合 `2026-07-18-chat-ui-local-primitives.md` 的本地原语原则。
- 新增文档 `docs/adr/2026-08-10-context-usage-ring.md` 记录数值格式裁决与口径偏差。

## 8. 风险与假设

| 项 | 说明 | 缓解 |
| --- | --- | --- |
| 口径偏差（ring vs 实际预算） | ring 分母回退链含 `agentSettings.contextWindowTokens`，`useAgent` L171 当前为 `?? 128000` 未读该设置 | 本 flow 不改 `useAgent`（PRD 非目标）；登记为后续对齐项：`useAgent` 应改为 `modelConfig?.limit?.context ?? savedAgentSettings?.contextWindowTokens ?? 128000` |
| `45.2K / 128K` 示例 | decision-map 示例为紧凑格式，PRD §6 硬约束复用 `formatNum`（输出 `45,200 / 128,000`） | 若产品坚持紧凑格式，仅替换 tooltip 内格式化函数，无结构性影响（见 ADR） |
| `limit.context` 缺失时的分母 | 回退 `agentSettings.contextWindowTokens`（App 默认 128000，异步加载前也是 128000） | 环在请求发生前不渲染，加载完成前无请求，不存在闪变 |
| SDK 模式 | `ChatProviderSDK` 的 `tokenUsage` 恒 `{0,0}`，环永不显示 | 与 `ConversationSidebar` 现有行为一致，可接受 |
| 非法上限配置 | `limit.context=0` 或设置被置 0 | `limit<=0` 隐藏，不显示误导比例 |

## 9. 实施建议

单个垂直切片即可完成（组件 + 集成 + i18n + 测试），预计涉及 6 个生产文件与 2 个测试文件，符合一个小型 UI 功能集。实现顺序：`ContextUsageRing.tsx` → i18n → `MessageInput` 集成 → `App` 透传 → 测试。

验收命令：

```bash
npm run test:run
npm run typecheck
npm run lint
npm run build:chrome
```
