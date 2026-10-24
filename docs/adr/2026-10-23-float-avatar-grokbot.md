# ADR: 悬浮球头像采用 vendored GrokBot 引擎与 iframe status 协议

- **日期**: 2026-10-23
- **状态**: Implemented
- **决策者**: Felix
- **相关**: [GrokBot 移植调研](../grokbot-web-floating-widget-research.md) · [浮动控件原生 DOM ADR](2026-07-19-floating-widget-native-dom.md) · [浮动入口 iframe ADR](2026-07-19-floating-entry-iframe.md) · [#204](https://github.com/devcxl/browser-agent/issues/204)（Spec）及子任务 [#205](https://github.com/devcxl/browser-agent/issues/205)–[#210](https://github.com/devcxl/browser-agent/issues/210)

---

## 背景

悬浮球按钮原为 48px 静态 `logo-48.png`，只表达「入口存在」，无法传达 agent 正在运行、生成或等待确认——用户必须打开面板才能知道任务状态（事实：改造前 `BUTTON_SIZE = 48`，按钮内为 `<img>`）。

调研（2026-10-23，一手源码 + 本机构建）澄清了一个关键前提：**grokbot-web 没有悬浮球实现，它是 Canvas 2D 动画头像库**（39 个状态、18 种形状、25 套表情；无拖拽、注入、定位、持久化）。可复用的是按钮里的「脸」；「身体」——closed shadow root、拖拽吸附、黑名单、iframe 面板——仍完全由本项目实现。

上游本身也不适合按普通依赖引入：零运行时依赖、BSD-3-Clause、**npm 未发布**（`npm view grokbot-web` 返回 404）、9 个 commit / 单作者 / 视觉语言尚未定稿。

因此本 ADR 要裁决的是：在既有的「原生 DOM + closed shadow root」与「iframe 面板」两份 ADR、以及 PRD §6「不新增 npm 依赖」约束下，如何接入头像，并让按钮反映 iframe 内的 agent 状态。

## 决策 1：vendor 引擎源码并锁定 `616c1dd`，只使用引擎类入口

1. 上游 9 个文件复制到 `src/content/floating-widget/grokbot/`（`engine.ts`、`painter.ts`、`geometry.ts`、`theme.ts`、`easing.ts`、`types.ts`、`data/{expressions,shapes,states}.ts`），另加本项目 `index.ts` 桶文件统一导出。上游相对导入结构保持不变（除视线追踪纵向增益有一处显式标记的本地微调，见下文局部差异说明）。
2. **锁 commit `616c1dd`**，commit 同时写入桶文件头注释与 `THIRD_PARTY_NOTICES.md`；不跟随 `main`。
3. 只使用引擎类入口 `new GrokBot(canvas, options)`。**不内置** `element.ts`（`<grok-bot>` 自定义元素，自带 **open** shadow root）与 `react.tsx`。
4. 不新增 npm / git 依赖，`package.json` 不变，运行时仍为零依赖。
5. BSD-3-Clause 合规：`THIRD_PARTY_NOTICES.md` 保留上游与 Flutter 原版版权行、许可证全文及文件清单。

理由：npm 无包可装；git 依赖既违反 PRD §6，又把构建可复现性交给网络与上游分支；vendor 是最直接同时满足「零依赖 + 可审计 + 版本冻结」的路径。拒绝自定义元素入口，是因为它会创建 open shadow root，直接破坏本项目的 closed 隔离决策；拒绝 React 入口，是因为 [native-dom ADR](2026-07-19-floating-widget-native-dom.md) 明确不把 React 带进 content script。

## 决策 2：按钮从 48px 静态 logo 改为 60px Canvas 动画

- `BUTTON_SIZE` 48 → 60；`<canvas>` 宽高 60，引擎 `size: 60`，DPR 由引擎处理；初始状态 `idle`，`autoBlink: true`。
- 按钮不再有白底与描边，头像本体即按钮视觉，仅保留 `drop-shadow` 与 hover/active 缩放。
- 降级：Canvas 2D 不可用（`getContext('2d')` 返回 null 等构造异常）时捕获异常，`bot = null`，按钮加 `.avatar-unavailable` 显示同色圆形兜底；点击、拖拽、菜单全部不受影响。
- 可访问性：原生 `<button>` 的 `aria-label` / `title` 保留；引擎会向 canvas 写 `role="img"` 与相同 `aria-label`，外层再给 canvas 加 `aria-hidden="true"`，避免读屏把同一入口播报两次。
- 动效偏好：引擎默认 `respectReducedMotion: true`，系统开启 `prefers-reduced-motion: reduce` 时停止自动眨眼与表情漂移、morph 即时落位；本项目未再写额外媒体查询。
- 尺寸依据：上游 demo 最小展示尺寸为 72px，48px 下眼睛可读性不足（调研推断）；60px 是本次实现选定的折中，尚未做正式的 48 / 56 / 60 / 72px 对比验收。

## 决策 3：iframe → 外层 `status` 消息契约

[iframe ADR](2026-07-19-floating-entry-iframe.md) §4 原本只有 `close-request`。本次新增第二类消息 `status`，**方向不变**（仍只有 iframe → 外层）。

```ts
{
  source: 'ba-floating-widget';
  type: 'status';
  state: 'idle' | 'running' | 'streaming' | 'waitingConfirmation';
  reason?: 'complete' | 'error' | 'abort'; // 仅 idle 时携带
}
```

| 字段 | 约束 | 说明 |
|---|---|---|
| `source` | 固定 `'ba-floating-widget'` | 与 `close-request` 共用协议标识 |
| `type` | `'status'` | 未知类型外层直接忽略 |
| `state` | `AgentStatus` 四值 | 来自 `src/entrypoints/sidepanel/types.ts` |
| `reason` | 仅 `idle`；`complete` / `error` / `abort` | 缺省按正常完成处理 |

**兼容与校验**：

- 旧外层忽略未知 `type`，旧 iframe 不发 `status`：协议是纯增量，无破坏性变更。
- `reason` 缺省视为 `complete`（正常完成，可触发庆祝），保证旧发送端行为不退化为「永不庆祝」。
- 接收端（`panel.ts`）三重校验：`event.source === iframe.contentWindow`；`event.data.source === 'ba-floating-widget'`；`state` 为非空字符串。`reason` 仅接受白名单三值，其余归一为 `undefined`。
- 发送端用 `window.parent.postMessage(msg, '*')`：宿主页面 origin 任意，无法预知白名单，因此安全性由**接收端对 `event.source` 的身份比对**保证，而不是 `targetOrigin`。
- 仅在嵌入模式（`embedded=1`）发送；挂载时先发一次当前状态，外层无需等待下一次状态变化就能对齐初始视觉。
- 消息只含状态，不含消息正文、会话 ID 或错误详情。

## 决策 4：agent 状态 → 头像状态映射

映射集中在 `status-map.ts` 的纯函数，未知、空串、非字符串一律回退 `idle`。

| agent（`AgentStatus`） | 头像（`GrokBotState`） | 语义 |
|---|---|---|
| `idle` | `idle` | 空闲 |
| `running` | `working` | 工具/多步执行中 |
| `streaming` | `thinking` | 模型生成中 |
| `waitingConfirmation` | `listening` | 等待用户确认 |

`waitingConfirmation → listening` 是语义近似（侧头倾听），不是字面翻译。

状态源的语义约定（`useAgent` 侧保证，否则 `working` 不可达）：文本输出开始时置 `streaming`；工具即将执行时置 `running`；用户批准/拒绝确认后离开 `waitingConfirmation`。已知副作用：若 agent 侧新增了映射表外的状态，且它在活跃状态之后到达，会被当作 `idle` 并触发一次完成庆祝——这是「安全回退优先」的取舍，已由测试锁定。

## 决策 5：打磨参数与复位规则

- **400ms 去抖**（`DEFAULT_DEBOUNCE_MS`，常量由测试约束在 300–500ms 区间）：连续快速切换只呈现最终状态，首个非 `idle` 状态最迟 500ms 内生效。
- **2s 庆祝**（`DEFAULT_CELEBRATE_MS`）：仅当 `idle` 到达、且当前已应用状态属于 `thinking` / `working` / `listening` 时，先播 `celebrate` 再回落 `idle`。
- 庆祝期间重复收到 `idle` 不延长庆祝；收到任何非 `idle` 新状态则**立即中断庆祝并切走**，不再等去抖，避免庆祝盖住新任务。
- **立即复位**（不去抖、不庆祝）：`idle` + `reason` 为 `error` / `abort`；面板关闭（再次点击按钮或 iframe 发 `close-request`）。
- 目标状态与当前已应用状态相同则丢弃仍在等待的中间状态；`destroy()` 清理控制器定时器、引擎 rAF / 眨眼定时器 / ResizeObserver / visibility 监听。
- 面板刚打开时的初始 `idle → idle` 不产生视觉更新。

## 替代方案

### A. 把 `grokbot-web` 作为 npm 依赖（不采用）

2026-10-23 实测 `npm view grokbot-web` 返回 404，包不存在，方案不成立。

### B. 使用 git 依赖（不采用）

`github:Coiggahou2002/grokbot-web` 可安装，但会新增一条 npm 依赖并违反 PRD §6；构建可复现性依赖网络与上游分支状态；依赖包还包含 `element.ts` / `react.tsx` 入口，哪些代码进入 bundle 不再由本项目控制。vendor 只多一个目录，收益相同而边界更清楚。

### C. 使用 `<grok-bot>` 自定义元素（不采用）

该入口自带 **open** shadow root，与「closed shadow root 隔离页面样式」的既有决策冲突；同时引入属性序列化层与额外入口代码。引擎类入口已经能直接把头像画进本项目自己的 canvas，没有额外收益。

### D. 把头像渲染在 iframe 内（不采用）

按钮在 iframe 之外，且面板关闭时 iframe 被隐藏。若头像放进 iframe，收起状态下按钮就没有脸；还要为拖拽处理跨 iframe 指针事件（[native-dom ADR](2026-07-19-floating-widget-native-dom.md) 方案 B 已否决同类做法）。头像与按钮同层是最直接能保证「收起时也可见、可拖拽」的结构。

### E. 只换成 GrokBot 风格的静态图 / SVG（不采用）

成本最低、无动画与体积开销，但无法表达运行状态，只解决了「换皮」，没有解决本需求的「状态感知」。若动画视觉验收不通过，这是回滚成本最低的备选。

### F. 裁剪上游数据表（本次不做）

理论上只保留实际用到的状态、表情与形状，可把引擎数据压到约 1/3（调研估算，未实测构建）。本次不做，原因：

1. 当前体积仍在预算内（见下），没有触发裁剪的压力；
2. 裁剪必须改上游 `data/*` 与 `types.ts` 的联合类型，vendored 副本开始分叉，后续上游升级无法直接重放；
3. 映射可能扩展到 `searching` / `excited` 等已内置但当前未使用的状态，过早裁剪会把视觉迭代变成数据表维护。

触发条件：content bundle 逼近预算，或明确需要支持更多状态导致数据表继续增长。届时再按「仅保留实际状态 + 收敛类型」执行。

## 影响

### 体积与预算（2026-10-23 本机 `npm run build` 实测）

- `content.js`：**121,356 B**（gzip **43,318 B**），改造前约 71 KB，增量约 **50 KB**。增量主体推测是表情环数据（25 套 × 双眼 × 48 点）与状态表。
- `dist/chrome-mv3` 构建目录：**1,936,574 B**，WXT 汇总 1.94 MB（按 1024 计约 1,891 KB），2048 KB 预算下余量约 **157 KB**。
- 预算脚本 `scripts/check-size.sh` 校验的是 zip 体积；本机实测 chrome zip 为 **720 KB**（预算 2048 KB），余量充足。
- 未新增运行时依赖，`package.json` 无改动。
- **覆盖率阈值**：vendored 引擎原样引入且未移植上游测试，`vitest.config.ts` 将其排除出 coverage 统计；本项目自有代码仍须满足 95% 全局阈值。

### 与两份 2026-07-19 ADR 的兼容结论

- **native-dom ADR：兼容。** 没有引入 React、Tailwind 或新依赖；仍是 closed shadow root + 内联 `<style>` + 原生 DOM。头像引擎只操作传入的 canvas，不读写页面样式。拒绝 `<grok-bot>` 入口正是为了守住 open/closed 边界。
- **iframe ADR：兼容且为增量扩展。** 面板仍由 iframe 加载 `sidepanel.html?embedded=1`，懒加载/常驻、`close-request`、主题与语言的共享存储同步全部不变。新增的 `status` 只是同一单向通道上的第二类消息，没有引入外层 → iframe 的反向通信。

### 无障碍

- 按钮仍是原生 `<button>`，保留 `aria-label` / `title`，键盘行为不变。
- canvas 由引擎写入 `role="img"` 与相同标签，外层加 `aria-hidden="true"`；可访问名只由按钮提供，不会重复播报。
- `prefers-reduced-motion` 由引擎默认处理：停止自动眨眼与表情漂移，保留静态表情，不出现「完全空白」。
- 头像纯装饰之外的语义仍由按钮标签承担，状态变化不额外做 live region 播报（避免每个状态都打断读屏）。

### 上游变动与锁版本策略

- 上游是单作者、9 个 commit、v0.1.0、视觉语言刚经历一次特性提交后随即 revert 的项目；**不锁版本会持续漂移**。本项目锁 `616c1dd`，上游后续提交不会自动进入。
- 升级方式：手工比对上游 diff → 重放至 `grokbot/` → 跑 `status-map` / `bot-state-controller` / `widget-status` / `useEmbeddedStatusBridge` 测试 → 人工视觉验收 → 同步 `THIRD_PARTY_NOTICES.md` 的 commit 与文件清单。
- 代价：无法自动获得上游修复；vendored 副本自包含，即使上游弃更也不影响现状。

### 局部差异披露（vendored 代码微调）

- **`geometry.ts` 中的视线纵向增益**：
  在 `mapNormalizedGaze` 中，上游锁定版本 `616c1dd` 的 y 增益为 `8.4`，x 增益为 `13.2`。在上游该参数下，眼球在纵向的运动行程明显小于横向（仅约 63%），导致视线上下追踪时光标已至视口边缘而眼球位移不显著。
  本项目在 `src/content/floating-widget/grokbot/geometry.ts` 中将 y 增益由 `8.4` 局部微调至 `13.2`，使得视线在横纵方向具有等幅的视觉运动范围。
  **特别说明**：此改动为本项目根据悬浮球全视口视线追踪需求所做的**本地偏离（local deviation）**，锁定上游版本仍为 `616c1dd`，不代表或暗示上游已变更。后续升级上游时需保留此本地微调。

- **`geometry.ts` 与 `painter.ts` 中的真实球面俯仰投影（True Spherical Pitch）**：
  上游仅实现了基于经度（longitude）的转头（turn）与平面平移的 gaze，没有纬度俯仰（pitch）。这导致向下看（bottom-center / bottom-left）时，基准高位表情（如 idle 的 expression 0，自然眼位偏上约 52 像素）仅靠平移无法移入球体下半球；而单纯在 DOM 容器做 CSS rotateX 倾斜则会破坏球体正圆形状（变成椭圆）且无相对透视位移。
  本项目在 `geometry.ts` 中为 `projectEye` 扩展了可选的 `pitch` 纬度投影与垂直透视缩放（`pitch = 0` 时与上游逐位一致），并在 `painter.ts` 引入 `calculateTargetPitch` 与跨双眼共享的每帧 `clampSafePitch` 安全钳制，保证球体保持正圆、双眼在向下注视时能真实越过中轴俯视且无边缘裁切。
  **特别说明**：此改动为本项目本地几何增强，锁定上游版本仍为 `616c1dd`，后续升级上游时需保留此本地扩展。

### 已知限制

1. **abort 依赖错误名**：`useAgent` 以 `err.name === 'AbortError'` 判定中止（事实）。若某个 runtime 中止时正常 resolve 或抛出其他错误名，外层会把结束当作 `complete`（庆祝）或 `error`（直接复位）。
2. **短任务不庆祝**：任务若在 400ms 去抖窗口内完成，头像可能从未离开 `idle`，因此没有中间状态也没有庆祝。这是去抖的直接取舍。
3. **未知状态前向兼容**：映射表外的新状态回退 `idle`；从活跃态进入时会触发庆祝（已有测试覆盖）。
4. **关闭面板即复位**：关闭面板会立即把头像复位为 `idle`。iframe 按既有 ADR 常驻，若关闭时任务仍在运行，按钮不会继续显示该任务，直到下一次状态变化上报。这是「关闭 = 空闲」规则的直接结果，不是状态丢失 bug。
5. **数据未裁剪**：bundle 携带全部 39 状态 / 18 形状 / 25 表情，其中多数当前不可达（见方案 F）。
6. **功耗未实测**：引擎只在需要重绘或动画进行时排 rAF，静止后循环停止；隐藏标签页不排帧（改为同步渲染一帧）。常驻成本主要是眨眼/表情的 `setTimeout` 链，实际功耗未测量（推断为低）。

## 后续行动

1. 体积逼近预算或需要更多状态时，按方案 F 评估数据裁剪。
2. 上游升级时同步更新 `THIRD_PARTY_NOTICES.md` 的 commit 与文件清单，并重跑上述测试。
3. 可选：补 48 / 56 / 60 / 72px 的视觉对比，确认 60px 是当前最优而非仅仅可用。
4. 可选：若产品要求「面板关闭后仍反映后台任务状态」，需重新审视限制 4，改为持续上报状态或引入面板外状态源。

## 引用

- [调研报告：grokbot-web「悬浮球」实现分析与移植评估](../grokbot-web-floating-widget-research.md)
- 上游仓库：[Coiggahou2002/grokbot-web](https://github.com/Coiggahou2002/grokbot-web) @ `616c1dd`；Flutter 原版：[nasawz/GrokBot](https://github.com/nasawz/GrokBot)
- [ADR: 浮动控件使用原生 DOM + Shadow Root，不引入 React](2026-07-19-floating-widget-native-dom.md)
- [ADR: 浮动聊天入口采用 iframe 内嵌 sidepanel.html](2026-07-19-floating-entry-iframe.md)
- [#204](https://github.com/devcxl/browser-agent/issues/204) Spec · [#205](https://github.com/devcxl/browser-agent/issues/205) T1 vendor · [#206](https://github.com/devcxl/browser-agent/issues/206) T3 协议 · [#207](https://github.com/devcxl/browser-agent/issues/207) T2 按钮 · [#208](https://github.com/devcxl/browser-agent/issues/208) T4 映射 · [#209](https://github.com/devcxl/browser-agent/issues/209) T5 打磨 · [#210](https://github.com/devcxl/browser-agent/issues/210) T6 本 ADR
- 代码位置：`src/content/floating-widget/{status-map,bot-state-controller,widget,panel}.ts`、`src/content/floating-widget/grokbot/`、`src/entrypoints/sidepanel/hooks/useEmbeddedStatusBridge.ts`、`THIRD_PARTY_NOTICES.md`
