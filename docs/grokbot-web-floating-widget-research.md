# 调研报告：grokbot-web「悬浮球」实现分析与移植评估

> **调研日期**: 2026-10-23
> **对象仓库**: https://github.com/Coiggahou2002/grokbot-web @ `616c1dd`（2026-09-09，main 分支 HEAD，共 9 个 commit）
> **对照仓库**: 本项目 `src/content/floating-widget/`、`docs/adr/2026-07-19-*.md`、`docs/prd/floating-chat-entry.md`、`e2e/tests/floating-widget.spec.ts`
> **调研方式**: `git clone` 到本地通读全部源码（src/ 9 个文件 + demo + 配置），实际执行 `npm install && npm run build` 测量产物体积，`npm view` 验证发布状态；未依赖任何二手博客/转述。

---

## 1. 研究结论摘要

**首要澄清：grokbot-web 没有「悬浮球 / floating widget」实现。** 它是一个 **Canvas 2D 动画头像（avatar）库**——Flutter 组件 [nasawz/GrokBot](https://github.com/nasawz/GrokBot) 的 TypeScript 移植（BSD-3-Clause），提供一个会眨眼、转头、跟随视线、变换表情的卡通机器人脸。仓库中**不存在**任何拖拽、悬浮定位、边缘吸附、Shadow DOM 注入、站点黑名单、iframe 面板代码；`grep -i "float|drag|widget"` 仅命中一个名为 `dragging` 的**动画状态名**（`src/data/states.ts:59`）和描述上游是 Flutter widget 的文档措辞。「floating widget」是上游 Flutter 语境中的「可挂件」，被任务描述误读为「悬浮球」。

**因此本次调研的实际命题转化为**：把 grokbot-web 的动画头像引擎移植进本项目悬浮球按钮——即将按钮内容从静态 `<img src="logo-48.png">` 替换为一个 48px 的 `<canvas>`，由 GrokBot 引擎驱动一张会动的「脸」，并可选地把聊天会话状态映射为头像的动画状态（如思考中→`thinking`）。

核心发现：

1. **技术形态**：纯 TypeScript、零运行时依赖的绘制引擎，构造函数 `new GrokBot(canvas, options)` 直接绑定调用方提供的 canvas（`src/engine.ts:107`），**不自带任何 DOM 挂载/注入逻辑**；仓库提供三种入口（引擎类 / `<grok-bot>` 自定义元素 / React 组件），其中只有自定义元素入口会 `attachShadow`（open 模式，`src/element.ts:48`），本项目应避开该入口、直接用引擎类。
2. **与本项目差异最大的三点**：① grokbot-web 是**内容渲染库**，本项目悬浮球是**注入式交互控件**，两者是「脸」与「身体」的关系而非同类物；② grokbot-web **无任何注入/隔离/持久化策略**，样式隔离（closed shadow root）、z-index、黑名单、位置持久化全部只存在于本项目一侧；③ grokbot-web **未发布到 npm**（2026-10-23 实测 `npm view grokbot-web` 返回 404），README 的 `npm install grokbot-web` 目前不可用，只能 git 依赖或 vendor 源码。
3. **移植可行性：高**。引擎与数据为纯 TS + Canvas 2D，可直接放进现有 closed shadow root 内运行（引擎只操作传入的 canvas，不读写页面样式，不碰宿主 DOM）；与两份 ADR（原生 DOM、iframe 面板）**均不冲突**（见 §6.3）。主要成本是 content script 体积（全量产物 23.3 KB gzip，可用数据裁剪压到约 1/3）与「按钮感知聊天状态」所需的 iframe 消息协议扩展。最小可用版（固定 `idle` 状态换脸）预计 0.5–1 人日；带状态映射与数据裁剪的完整版 2–4 人日。

---

## 2. 背景与问题定义

任务要求调研 grokbot-web 的「悬浮球」实现，用于改造本项目悬浮球。本项目悬浮球（`src/content/floating-widget/widget.ts`，605 行）是：content script 注入 closed shadow root，内含 48px 圆形 logo 按钮（拖拽 + 左右边缘吸附 + 位置持久化）、右键/长按快捷菜单（「在此站点隐藏」）、iframe 聊天面板（420px，懒加载 `sidepanel.html?embedded=1`）。

调研后确认 grokbot-web 与「悬浮球」唯一的语义交集是：它的头像可以作为悬浮球按钮的**视觉主体**。本报告按此转化后的命题展开，并在 §6 给出移植评估。

**限制**：本报告不评价头像美术风格是否符合项目调性（需人工视觉决策）；体积数字为本机实测（Node 环境、tsup es2022 产物），不同打包器下会有出入。

---

## 3. grokbot-web 技术形态（一手源码）

### 3.1 定位与架构

| 维度 | 事实 | 来源 |
|---|---|---|
| 本质 | Canvas 2D 动画头像库，上游 nasawz/GrokBot（Flutter）的 TS 移植 | `README.md:1-17`、`package.json` description |
| 许可证 | BSD-3-Clause（与上游一致，要求保留版权声明） | `package.json` license 字段、`README.md:252-255` |
| 运行时依赖 | **零**（react 仅为 optional peerDependency） | `package.json` peerDependencies |
| 入口① 引擎类 | `new GrokBot(canvas, init)`，绑定一个 canvas，长生命周期实例 | `src/index.ts:7`、`src/engine.ts:107-130` |
| 入口② 自定义元素 | `<grok-bot>`，open shadow root 内仅一个 canvas，属性镜像 options（kebab-case） | `src/element.ts:37-54`、`src/element.ts:128-135` |
| 入口③ React | `<GrokBotView>`，mount 建引擎、prop 变更走 patch，不重启在途动画 | `src/react.tsx:48-123` |
| 构建 | tsup 三入口 esm+cjs，target es2022，treeshake | `tsup.config.ts:3-12` |
| 测试 | 55 个 vitest 测试（geometry/easing/painter/engine/element） | `README.md:218`、`test/` 目录 |

关键架构事实：**引擎构造函数接收调用方提供的 `HTMLCanvasElement`**（`src/engine.ts:107`），自行获取 2d context 并接管该 canvas 的尺寸/DPR/绘制，对 canvas 的父级 DOM 零要求——这使它能无缝放进本项目任何 shadow root 结点中。

### 3.2 渲染管线（一帧如何产生）

```
state + 定时器
  → 阻尼弹簧 morph（1/120s 定步长积分，src/engine.ts:393-411）
  → 两只眼各 48 点闭合环的线性插值（src/engine.ts:311-324）
  → 注视偏移 + 球面投影（src/geometry.ts:138-162 projectEye）
  → Canvas 2D：填充圆角矩形身体 → clip → 填充双眼多边形（src/painter.ts:117-213）
```

- **身体**：CSS `border-radius` 语义的圆角矩形（18 种形状各带一套圆角/长宽比/脸部修正参数，`src/data/shapes.ts:22-41`），用 `ellipse` 弧逐段描出而非 `roundRect`（兼容老 Safari，`src/painter.ts:60-82`）。
- **眼睛**：每种表情 = 双眼各 48 点的闭合环（共 25 种表情，`src/data/expressions.ts`，由脚本从上游 Dart 数据生成）；球面投影使转头时眼睛随透视变窄、转到背后即隐藏（`src/geometry.ts:150-160`）。
- **动画**：表情切换走弹簧 morph（自然频率 `springFrequency` 默认 7）；眨眼固定 320ms（42% 闭 / 58% 睁，`src/engine.ts:11-14`）；`spin()` 整圈旋转用 `easeInOutCubic`。
- **空闲成本**：rAF 循环**仅在 morph/blink/spin 活跃时运行**（`src/engine.ts:364-391`），静止的头像零帧开销；后台标签页不跑帧（`document.hidden` 检查，`src/engine.ts:369`），`visibilitychange` 恢复（`src/engine.ts:518-525`）。自动眨眼/表情漂移由 `setTimeout` 链驱动（`src/engine.ts:282-309`）。

### 3.3 状态系统（对本项目最有价值的部分）

39 个字符串状态，每个定义「表情池 + 表情切换节奏 + 眨眼节奏」（`src/data/states.ts:22-62`）。与聊天 Agent 生命周期天然对齐的一组：

| GrokBot 状态 | 表情池 | 表情节奏 | 眨眼 | 本项目可映射到 |
|---|---|---|---|---|
| `idle` | 0, 8 | 9–16s | 6–14s | 默认/空闲 |
| `listening` | 10, 1, 19 | 2.8–5s | 3–7s | 用户输入中 |
| `thinking` | 8, 16, 14, 17, 5 | 2–3.6s | 3.5–7s | Agent 生成中 |
| `working` | 7, 16, 11, 10 | 1.8–3.2s | 2.8–5.5s | 工具调用中 |
| `searching` | 15, 9, 3, 20, 12, 18 | 1–1.8s | 1.6–4s | 检索类工具执行中 |
| `celebrate` / `excited` | … | … | … | 任务完成 |
| `sleeping` / `powering-down` | … | … | 不眨眼 | 面板关闭久置 |

`autoBlink` 默认开、`autoExpression` 默认关（`src/engine.ts:29-30`）；`update(patch)` 增量打补丁、只重启受影响的定时器（`src/engine.ts:148-179`）。此外 `blink()`/`spin()`/`reset()` 可作事件反馈（如「发送成功 spin 一圈」）。

### 3.4 视觉参数

- **配色**（`src/theme.ts:5-22`）：light 身体 `#5b7fe5`（蓝紫）+ 眼白 `#fffdf7`；dark 身体 `#6689ea` + 眼黑 `#181a15`。`theme` 可部分覆盖，`body-color`/`eye-color` 可任意定制（自定义元素属性 `src/element.ts:100-103`）。
- **尺寸**：`size` 为 CSS 像素数或 `'auto'`（ResizeObserver 跟踪 canvas 盒子）；自动处理 devicePixelRatio（`src/engine.ts:461-491`）；demo 主展示 280px、画廊 72px（`demo/style.css:102,190`）。
- **可访问性**：canvas 自动写 `role="img"` + `aria-label`（`src/engine.ts:120-121`）。
- **降级**：尊重 `prefers-reduced-motion`（默认开）——用户要求减少动态时，自动眨眼/表情漂移停止、morph 即时落位（`src/engine.ts:269-271,286,298`）。
- **视觉仍在变动**：最新两个 commit 是「扁平色块阴影跟随转头」的实现与**整体 revert**（`9c26e28` → `616c1dd`，2026-09-08/09），说明上游视觉语言尚未定稿。

### 3.5 体积实测（本机构建，2026-10-23）

| 产物 | raw | gzip |
|---|---|---|
| 核心 chunk（engine+painter+geometry+theme+全部数据表） | 98,119 B | **23,335 B** |
| `element.js`（自定义元素壳，复用核心 chunk） | 3,892 B | 1,425 B |
| `index.js`（纯 re-export 壳） | 575 B | 402 B |

体积大头是 `expressions.ts` 的 25×2×48 个数字（4,800 个浮点字面量）。若裁剪为实际用到的 6–8 种表情 + 5 个状态 + 1–2 个形状，估算核心可降至 **8–10 KB gzip**（推断，置信度中；表达式环占比按数据量估算约六成）。

---

## 4. 本项目悬浮球现状（对照基线）

| 维度 | 本项目实现 | 来源 |
|---|---|---|
| 注入 | content script（`matches: <all_urls>`）→ `document.documentElement.appendChild(host)`，host 为 `div#ba-floating-host` | `src/content/index.ts:8-9,62-65`、`widget.ts:217-232,277-281` |
| 隔离 | **closed** shadow root + 内联 `<style>`（约 120 行手写 CSS） | `widget.ts:35-157,225`；ADR 2026-07-19-native-dom |
| 按钮视觉 | 48px 圆形，白底 92% 不透明 + 双层阴影，内嵌 `logo-48.png`（error 时文字兜底） | `widget.ts:19,46-87,307-334` |
| 交互 | Pointer Events 拖拽（`setPointerCapture`）、5px 阈值区分点击/拖拽、松手吸附最近左右边缘、垂直 clamp、位置防抖写入存储、右键/500ms 长按菜单 | `widget.ts:384-440,575-590`、`drag.ts` |
| 面板 | 懒加载 iframe `sidepanel.html?embedded=1`，420px，250ms 滑入滑出，`close-request` postMessage 白名单 | `panel.ts:14-20,121-194`；ADR 2026-07-19-iframe |
| z-index | host/面板 2147483646，按钮 2147483647（按钮必须压住面板） | `widget.ts:39,50,144` |
| 站点控制 | 全局开关 + 黑名单（精确+子域名后缀匹配），命中即销毁不挂 DOM | `blacklist.ts`、`widget.ts:235-253,491-507` |
| 约束 | ADR：不引 React/Tailwind；PRD §6：**不新增 npm 依赖**；zip ≤ 2048KB（`scripts/check-size.sh`） | 相关文档 |

---

## 5. 对比分析

| 维度 | grokbot-web | 本项目悬浮球 | 关系 |
|---|---|---|---|
| 形态 | 内容渲染库（画一张脸） | 注入式交互控件（悬浮球本体） | 互补，非竞争 |
| DOM 挂载 | 无（引擎只认 canvas）；仅自定义元素入口自带 open shadow root | closed shadow root 手工组装 | 用引擎类入口即无冲突 |
| 样式隔离 | 不涉及（纯 canvas 绘制，不产生外部样式） | closed shadow root + 内联 style | 画进 canvas 天然隔离 |
| 拖拽/吸附/持久化 | 无 | 完整实现 | 保留本项目实现 |
| 黑名单/开关 | 无 | 完整实现 | 保留本项目实现 |
| 状态/动画 | 39 状态 + 弹簧 morph + 眨眼 + 转头 + 视线 | 无（静态 png，仅 hover scale） | **移植的核心价值** |
| 依赖 | 零运行时依赖 | PRD 要求不新增 npm 依赖 | vendor 源码可两全 |
| 发布渠道 | **npm 未发布**（404 实测），仅 GitHub 源码 | — | 只能 git 依赖或 vendor |
| 成熟度 | 9 commits / 单作者 / v0.1.0 / 2 周龄 | 本项目自有 | 上游变动风险高 |
| 许可证 | BSD-3-Clause（需保留声明） | 私有项目 | 需第三方声明文件 |

---

## 6. 移植评估

### 6.1 可直接搬（结构与逻辑）

- **引擎 6 文件**：`engine.ts`、`painter.ts`、`geometry.ts`、`theme.ts`、`easing.ts`、`types.ts` + `data/expressions.ts`、`data/shapes.ts`、`data/states.ts`——全部纯 TS，零依赖，头部已带 upstream 溯源注释，WXT/vite 无需任何配置改动即可编译。
- **生命周期约定**：`bot.destroy()` 完整停止 rAF/定时器/observer（`src/engine.ts:235-261`），在 `widget.ts` 的 `destroy()`（现 `widget.ts:256-273`）中接一行即可。
- **无障碍**：canvas 自带 `role="img"`，按钮的 `aria-label`/`title` 逻辑（`widget.ts:310-311`）原样保留。

### 6.2 需要适配

| 事项 | 说明 | 工作量 |
|---|---|---|
| 按钮内容替换 | `widget.ts:307-334` 的 `<img>` 换为 `<canvas>`（48×48，DPR 由引擎处理），CSS 中 `.float-btn img` 规则（`widget.ts:79-87`）改为 `.float-btn canvas` | 小 |
| 获取方式 | npm 404 → 二选一：① `npm i github:Coiggahou2002/grokbot-web`（git 依赖，但与 PRD「不新增 npm 依赖」冲突，需评审豁免）；② **vendor 源码**到 `src/content/floating-widget/grokbot/`（推荐，零依赖合规，锁定版本防上游漂移） | 小 |
| 体积裁剪 | 全量 23.3 KB gzip 进 content script bundle。裁剪策略：仅保留用到的状态（如 idle/listening/thinking/working/excited）与表情环、1–2 个形状；`stateData`/`shapeData` 是 Record，裁剪后需同步收敛类型或做子集映射 | 中 |
| 小尺寸可读性 | 上游 demo 最小 72px；48px 下眼睛可能过小。备选：按钮放大到 56–64px，或用 `eyeScale`/`emphasis` 补偿。**必须实测** | 小（含决策） |
| 深浅色 | 悬浮球在任意宿主页面上，建议固定 light 配色或随扩展主题（`ConfigStore` 已有主题体系）；`theme.ts` 的 `lightTheme/darkTheme` 可直接引用 | 小 |
| reduced-motion | 引擎默认尊重系统设置，自动动画会停——符合预期，无需处理，但需在 PRD 层面确认可接受 | 零 |
| 第三方声明 | BSD-3-Clause 要求保留版权 notice；vendor 时在 ` THIRD_PARTY_NOTICES.md`（或 about 页）添加 upstream credits | 小 |
| 测试 | `drag.ts`/`blacklist.ts` 纯函数测试不受影响；e2e（CDP pierce 找 `BUTTON[aria-label]`，`floating-widget.spec.ts:86-90`）按钮元素不变应仍通过，但 canvas 视觉无 CSS 可断言，建议补一条「canvas 已挂载且引擎已构造」的 DOM 断言 + 人工视觉验收 | 小 |

### 6.3 ADR 冲突评估

- **vs `2026-07-19-floating-widget-native-dom.md`**：不冲突。该 ADR 禁的是 React/Tailwind 进 content script；GrokBot 引擎是纯 TS + Canvas 2D，仍属「原生 DOM + Shadow Root + 内联 style」路线。注意勿用 `<grok-bot>` 自定义元素入口（它自带 **open** shadow root，与 closed 隔离决策相悖），直接 `new GrokBot(canvas)` 即可。唯一需评审点是 PRD §6「不新增 npm 依赖」——vendor 源码方案下不产生 npm 依赖，实质合规；git 依赖方案则需显式豁免。
- **vs `2026-07-19-floating-entry-iframe.md`**：不冲突且互不触碰。头像只改按钮视觉层；面板仍走 iframe。**但**若要「按钮感知聊天状态」（thinking/working），需扩展该 ADR §4 的单向通信协议（现仅 iframe→外层 `close-request`）：增加 iframe→外层 `status` 消息（如 `{source:'ba-floating-widget', type:'status', state:'thinking'}`），外层校验 `event.source` 后 `bot.update({state})`。这是增量 ADR 工作。

### 6.4 工作量与分期

| 方案 | 内容 | 估算 |
|---|---|---|
| 最小版（换脸） | vendor 引擎 + 按钮 canvas 替换 img + 固定 `idle` + `autoBlink` + destroy 接线 + notice 文件 | 0.5–1 人日 |
| 完整版（状态驱动） | 最小版 + 数据裁剪 + iframe `status` 消息协议 + 状态映射纯函数与单测 + 按钮尺寸/eyeScale 调优 + e2e 补强 | 2–4 人日 |

### 6.5 风险与最坏情况

| 风险 | 概率/影响 | 缓解 |
|---|---|---|
| 48px 下头像不可读/表达力差 | 中 / 中 | 实测后放大按钮或调 `eyeScale`；不满意可仅在面板打开时显示头像、收起时回落 logo |
| content script 体积增长引发全页注入性能顾虑 | 低 / 中 | 数据裁剪至 ~10 KB gzip；`check-size.sh` 2048KB 预算充裕 |
| 上游快速变动/弃更（9 commits、单作者、未发 npm） | 高 / 低 | vendor 锁版本；引擎自包含，弃更也不影响已 vendored 代码 |
| 常驻动画的功耗（setTimeout 链 + 间歇 rAF） | 低 / 低 | 引擎空闲零帧；后台页自动停；可提供设置项关闭动画回落静态图 |
| BSD-3-Clause 版权遗漏 | 低 / 中（合规） | vendor 时同步引入 LICENSE 头注释 + 项目级 notice |
| e2e 断言失效 | 低 / 小 | 按钮元素与 aria-label 不变，仅视觉断言需人工 |

**最坏情况可回滚性**：改动收敛在 `widget.ts` 的 `buildButton()` 与一个新 vendor 目录内，回滚 = 还原该函数 + 删除目录，无存储/协议破坏性变更（`status` 消息是纯增量，旧外层忽略未知消息类型即可）。损失完全可控。

---

## 7. 反方观点与不确定性

- **前提质疑（最重要）**：任务假设 grokbot-web 有「悬浮球实现」可供整体移植，实证为假。如果提问者真实意图是调研**另一个**「悬浮球」项目而仓库地址给错，本报告的移植评估需按新对象重做。**建议向任务发起方确认意图**（本报告按「把头像引擎用作悬浮球按钮的脸」这一最合理解释推进）。
- **「样式/实现」歧义**：若想要的只是 Grokbot 风格的视觉（圆润 blob + 大眼）而非动画引擎，成本可再降一个量级——手绘一张 SVG/PNG 替换 logo 即可，无需 vendor 引擎。两条路线的取舍（23 KB gzip + 常驻动画 vs 一张静态图）应由产品决策。
- **小尺寸可用性无一手证据**：上游没有 <72px 的官方用例，48px 表现纯属推断，必须实测。
- **裁剪后体积为估算**：未实际执行裁剪构建，1/3 的数字基于表达式数据占比推算（置信度中）。
- **上游视觉未定稿**：flat shadow 特性上线一天即被 revert（`616c1dd`），锁定 vendored 版本可规避，但意味着放弃其后续视觉迭代。

---

## 8. 建议

1. **先确认意图**：与任务发起方确认是想要「动画头像引擎」还是「静态视觉风格」。
2. 若走引擎路线，**采用 vendor 方案**（`src/content/floating-widget/grokbot/`），锁定 `616c1dd`，不引入 npm/git 依赖，保持 PRD §6 合规。
3. 分两步交付：先做**最小版**（固定 `idle` 换脸）验证 48px 可读性与功耗；视觉验收通过后再做**完整版**（数据裁剪 + `status` 消息协议 + 状态映射）。
4. 实施前补一份短 ADR：说明 vendor 决策、体积影响、BSD-3-Clause notice、与 native-dom/iframe 两份既有 ADR 的兼容性结论。

---

## 9. 参考来源

**grokbot-web（全部为 clone 至本地的一手源码 @ `616c1dd`，2026-09-09）**

| 文件 | 关键内容 |
|---|---|
| `package.json` | 零运行时依赖、BSD-3-Clause、三入口 exports、peerDep react optional |
| `README.md` | 定位、API 表、39 状态/18 形状/25 表情清单、与 Flutter 原版差异 |
| `src/engine.ts` | GrokBot 类：构造/`update`/`blink`/`spin`/`destroy`、弹簧积分、rAF 按需循环、DPR |
| `src/painter.ts` | Canvas 2D 绘制：圆角矩形身体、clip、眼环多边形填充、`Canvas2DLike` 结构化接口 |
| `src/geometry.ts` | 球面投影 `projectEye`、`parseBorderRadius`、坐标常量 |
| `src/element.ts` | `<grok-bot>` 自定义元素（open shadow root）——本项目不应采用的入口 |
| `src/react.tsx` | React 包装（mount-once + patch） |
| `src/theme.ts` / `src/types.ts` | 配色预设、全部类型定义 |
| `src/data/states.ts` / `shapes.ts` / `expressions.ts` | 39 状态节奏表、18 形状几何、25 表情环数据（自动生成） |
| `demo/main.ts` / `demo/style.css` | 交互演示：gaze 跟随指针、280px hero、72px 画廊 |
| `tsup.config.ts` | 构建配置 |
| 实测构建产物（本文作者执行 `npm run build`，2026-10-23） | 核心 chunk 98,119 B raw / 23,335 B gzip |
| 实测 `npm view grokbot-web`（2026-10-23） | E404，npm 未发布 |
| 上游 | https://github.com/nasawz/GrokBot（Flutter 原版，BSD-3-Clause） |

**本项目（browser-agent）**

| 文件 | 关键内容 |
|---|---|
| `src/content/floating-widget/widget.ts`（605 行） | closed shadow root、48px 按钮、拖拽/吸附、右键菜单 |
| `src/content/floating-widget/drag.ts` / `blacklist.ts` / `panel.ts` | 纯函数层、iframe 面板管理 |
| `src/content/index.ts` | content script 入口（`<all_urls>`） |
| `docs/adr/2026-07-19-floating-widget-native-dom.md` | 原生 DOM + Shadow Root、不引 React 的决策与理由 |
| `docs/adr/2026-07-19-floating-entry-iframe.md` | iframe 内嵌 sidepanel、单向通信协议 |
| `docs/prd/floating-chat-entry.md` | 需求基线、§6「不新增 npm 依赖」约束 |
| `e2e/tests/floating-widget.spec.ts` | CDP pierce 穿透 closed shadow 的测试策略 |
| `scripts/check-size.sh` | zip ≤ 2048KB 预算 |
| `src/shared/types/storage.ts` / `src/shared/i18n.ts` | `FloatingButtonSettings`、`translate()` 机制 |
