---
slug: context-usage-ring
type: feature
task: context-usage-ring
issue: null
test_commands:
  - npx vitest run src/entrypoints/sidepanel/__tests__/ContextUsageRing.test.tsx src/entrypoints/sidepanel/__tests__/MessageInput.test.tsx
verify_commands:
  - npm run test:run
  - npm run typecheck
  - npm run lint
  - npm run build:chrome
---

# context-usage-ring

## Builds

聊天输入框（MessageInput）工具行中，思考等级下拉框右侧、麦克风按钮左侧，在会话产生首次请求后出现一个圆形进度环，实时展示当前会话上下文占用（`tokenUsage.prompt` ÷ 上下文上限）：hover 显示"上下文占用：45,200 / 128,000"，占用率 ≥80% 时进度弧变色警告；新会话、未运行过请求（`prompt===0`）或上限非法（≤0）时进度环隐藏；切换会话后随 `tokenUsage` 重置而隐藏，无残留旧值。

数据链路（零改动上游）：`ChatContext.tokenUsage` 经 `App.inputProps` 透传至 `MessageInput`；上限解析链在 `MessageInput` 内部完成：`activeModel?.limit?.context ?? contextWindowTokens ?? 128000`。

## Acceptance Criteria

- [ ] 纯函数 `contextUsagePercent(used, limit)` 返回 0–100 整数：`(45200, 128000) → 35`；`(128000, 128000) → 100`；`(150000, 128000) → 100`（clamp 上限）；`(0, 128000) → 0`；`(100, 0) → 0` 且不抛错（`limit<=0` 防御）；`(-1, 128000) → 0`（clamp 下限）
- [ ] 隐藏条件：`used=0, limit=128000` 时 `queryByTestId('context-usage-ring')` 为 `null`；`used=45200, limit=0` 时为 `null`；`used=45200, limit=128000` 时存在
- [ ] 变色阈值：恰好 80%（`used=102400, limit=128000`）→ wrapper `data-state="warning"` 且进度弧 class 含 `text-warning`；79%（`used=101120`）→ `data-state="normal"` 且 class 含 `text-primary`；100% 仍为 `warning`
- [ ] hover 数值：`used=45200, limit=128000`（zh-CN locale）时 wrapper 的 `title` / `aria-label` 为"上下文占用：45,200 / 128,000"（`formatNum` 千位分隔）
- [ ] 进度弧几何闭环（percent → dashoffset）：`CIRC = 2π·((20-2.5)/2)`，percent=25 → `stroke-dashoffset ≈ 0.75·CIRC`（容差 ±0.5）；percent=100 → `≈ 0`；percent=0 → `≈ CIRC`
- [ ] MessageInput 集成：传 `tokenUsage={{prompt: 45200, completion: 0}}`（带含模型的 `providers`）→ `context-usage-ring` 存在且 `aria-label` 含"45,200 / 128,000"；`tokenUsage` 未传或 `prompt=0` → 不存在；`activeModel.limit.context=32768` 时 `aria-label` 含"32,768"（优先于 `contextWindowTokens`）；DOM 顺序为 reasoning 下拉（`reasoning-select` 或 `reasoning-unsupported`）→ `context-usage-ring` → `mic-button`（`compareDocumentPosition` 或容器内顺序断言）
- [ ] 会话切换回归：`ChatContext.test.tsx` 追加断言——切换 `activeId` 后 context value 的 `tokenUsage` 为 `{0,0}`（若已有等价断言则跳过）
- [ ] 回归：既有 `MessageInput` 测试全绿（新增 props 为可选，零破坏）；`npm run typecheck`、`npm run lint`、`npm run build:chrome` 通过

## Blocked By

None

## Implementation Notes

- 新文件 `src/entrypoints/sidepanel/components/ContextUsageRing.tsx`：纯展示组件 + 导出纯函数 `contextUsagePercent`；几何/阈值常量模块内私有（`SIZE=20`、`STROKE=2.5`、`RADIUS=(SIZE-STROKE)/2`、`CIRCUMFERENCE=2π·RADIUS`、`WARNING_THRESHOLD=0.8`）；SVG 进度弧 `stroke-dashoffset = CIRCUMFERENCE * (1 - percent/100)` + `rotate(-90)` 使起点在 12 点方向
- 语义锚点：wrapper `data-testid="context-usage-ring"`（含 `data-state="warning|normal"`）；进度弧 `data-testid="context-usage-ring-progress"`
- 隐藏条件为 `used <= 0 || limit <= 0`（ADR 决策 2，`limit<=0` 为除零防御扩展）；hover 数值复用 `formatNum` 千位分隔格式（ADR 决策 1，否决紧凑 `45.2K` 格式）
- 上限解析在 `MessageInput` 内派生（ADR 决策 3）：`const contextLimit = activeModel?.limit?.context ?? contextWindowTokens ?? 128000`；新增 props `tokenUsage?: TokenUsage`（未传视为 `{0,0}`）与 `contextWindowTokens?: number`（默认 128000）；渲染位置为 `hasConfigRow` 片段结束之后、`{micButton}` 之前
- `App.tsx` 仅 `inputProps` 追加 `tokenUsage` 与 `contextWindowTokens: agentSettings.contextWindowTokens` 两行
- i18n：`i18n/types.ts` 的 `MessageSchema.chat` 新增 `contextUsage` 段，`locales/zh-CN.json` / `en.json` 同步新增 `contextUsage.tooltip`（`t` 的 `applyVars` 支持 `{var}` 插值，数值预先经 `formatNum` 格式化）
- 零改动清单：`ChatContext.tsx`、`types.ts`（TokenUsage 定义）、`ConversationSidebar.tsx`、`useAgent.ts`、`ChatProviderSDK`（其 `tokenUsage` 恒 `{0,0}`，环自然隐藏）
- 测试沿用 `MessageInput.test.tsx` 的 `wrappedRender`（`I18nProvider` 包裹，默认 zh-CN locale）与 `mockBrowserStorage` 惯例；集成测试需带含模型的 `providers` 使工具行渲染
- 分支名基准：`feat/context-usage-ring`
