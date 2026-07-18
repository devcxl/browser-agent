# DESIGN.md — Tab Controller Side Panel

> 浏览器扩展侧边栏 AI 助手的设计系统。双主题（明/暗），陶土橙 accent，全气泡消息流，居中输入框首页。

---

## 1. Visual Theme & Atmosphere

**氛围关键词**：温暖、精致、工具感、克制

- 整体气质接近 Claude 的编辑温暖感 + Linear 的精确度，应用于一个 400px 左右宽度的浏览器侧边栏
- 双主题对等设计：暗主题不是简单反色，而是独立的表面层级系统
- 密度：中等偏高（工具型产品），但通过圆角、留白和层级弱化压迫感
- 动效原则：短促（120–200ms）、ease-out、仅用于状态反馈（发送、流式、折叠展开），不做装饰性动画
- 品牌人格：可靠的浏览器管家，不卖萌、不炫技

## 2. Color Palette & Roles

### Light Theme

| Token | Hex | 角色 |
|---|---|---|
| `canvas` | `#FAFAF9` | 应用底色（stone-50） |
| `surface` | `#FFFFFF` | 卡片、气泡、浮层 |
| `surface-soft` | `#F5F4F2` | 次级表面、hover 底色、AI 气泡 |
| `ink` | `#1C1917` | 主文本（stone-900） |
| `body` | `#44403C` | 正文文本（stone-700） |
| `mute` | `#78716C` | 辅助文本（stone-500） |
| `hairline` | `#E7E5E4` | 分隔线（stone-200） |
| `accent` | `#C2410C` | 主强调色·陶土橙（orange-700），CTA、用户气泡、激活态 |
| `accent-hover` | `#9A3412` | accent 按压/hover（orange-800） |
| `accent-soft` | `#FFF7ED` | accent 浅底（orange-50），badge、选中背景 |
| `on-accent` | `#FFFFFF` | accent 上的文本 |
| `danger` | `#DC2626` | 错误、高风险操作 |
| `warning` | `#D97706` | 中风险警告（amber-600） |
| `success` | `#16A34A` | 成功状态 |

### Dark Theme

| Token | Hex | 角色 |
|---|---|---|
| `canvas` | `#161412` | 应用底色（暖黑，非纯黑） |
| `surface` | `#201D1A` | 卡片、气泡、浮层 |
| `surface-soft` | `#292522` | 次级表面、hover 底色（stone-800） |
| `ink` | `#F5F5F4` | 主文本（stone-100） |
| `body` | `#D6D3D1` | 正文文本（stone-300） |
| `mute` | `#A8A29E` | 辅助文本（stone-400） |
| `hairline` | `#38322D` | 分隔线（暖灰，不用冷灰） |
| `accent` | `#EA580C` | 主强调色（orange-600，暗色下提亮一档） |
| `accent-hover` | `#F97316` | accent hover（orange-500） |
| `accent-soft` | `#431407` | accent 浅底（orange-950），badge、选中背景 |
| `on-accent` | `#FFFFFF` | accent 上的文本 |
| `danger` | `#EF4444` | 错误（red-500） |
| `warning` | `#F59E0B` | 警告（amber-500） |
| `success` | `#22C55E` | 成功（green-500） |

**规则**：
- accent 仅用于：主 CTA、用户气泡、激活导航、关键 badge、焦点环。一屏内 accent 出现不超过 3 处
- 暗主题分隔线必须带暖调（`#38322D`），禁止纯灰 `#374151` 类冷灰
- 状态色（danger/warning/success）仅用于工具调用状态、确认对话框、风险等级标识

## 3. Typography Rules

| 层级 | 规格 | 用途 |
|---|---|---|
| 字体族 | `Inter, ui-sans-serif, system-ui` | 全局 |
| 等宽 | `ui-monospace, 'JetBrains Mono', monospace` | 工具参数、代码、token 数 |
| Display | 20px / 600 / -0.02em | 首页品牌标语 |
| H1 | 15px / 600 | 面板标题（侧边栏、设置） |
| Body | 13.5px / 400 / 1.6 | 消息正文、Markdown 排版 |
| Label | 12px / 500 | 按钮、输入框 placeholder、表单标签 |
| Caption | 11px / 400 | 时间戳、token 统计、辅助说明 |
| Code-inline | 12.5px 等宽 | 行内代码，accent-soft 底色 |

**规则**：
- 消息正文行高必须 ≥1.6，长文可读性优先
- 数字（token、时间）用等宽或 `font-variant-numeric: tabular-nums`
- 标题字重 600，正文 400，禁止 300 以下字重（侧边栏窄宽度下发虚）

## 4. Component Stylings

### 按钮

| 类型 | 样式 | 状态 |
|---|---|---|
| Primary | accent 底 + on-accent 字 + radius 8px + 12px/500 | hover→accent-hover；active 缩放 0.98；disabled 50% 透明 |
| Secondary | surface 底 + hairline 边 + body 字 | hover→surface-soft |
| Ghost | 无底无边 + mute 字 | hover→ink 字 + surface-soft 底 |
| Danger | danger 底 + 白字 | 仅用于确认对话框的危险操作 |
| Icon-btn | 28×28，ghost 样式，图标 16px | hover→surface-soft 底 + radius 6px |

### 输入框（首页大输入框）

- 容器：surface 底 + 1px hairline + radius 16px + 阴影 `0 1px 3px rgba(0,0,0,0.06)`
- 聚焦：边框变 accent + 外发光 `0 0 0 3px accent-soft`
- 内嵌：textarea 无边框，底部工具行（模型选择器、effort 选择器、发送按钮）
- 发送按钮：圆形 accent 底 + 白色箭头图标，disabled 时 mute 色

### 消息气泡

| 角色 | 样式 |
|---|---|
| User | accent 底 + on-accent 字 + radius 16px（右下 4px）+ 右对齐 + 最大宽 85% |
| Assistant | surface-soft 底 + ink 字 + radius 16px（左下 4px）+ 左对齐 + 最大宽 92% |
| Tool Call | surface 底 + hairline 边 + radius 12px，header 行（状态点 + 工具名等宽 + 风险 badge + 展开箭头），默认收起结果 |
| Reasoning | 折叠区，标题行「思考过程」+ mute 字 + 左侧 2px hairline 竖条，内容斜体 mute |
| Error | danger 10% 透明度底 + danger 字 + danger 30% 边 |

### 工具调用卡片

- 状态点：running=warning 脉冲、success=success、error=danger，6px 圆点
- 风险 badge：low 无 badge / medium warning 字 / high 橙底白字 / critical 红底白字
- 参数与结果：等宽 12px，max-height 120px 内部滚动，JSON 缩进 2

### 会话浮层（Sidebar）

- 触发：左上角 icon-btn 展开，浮层宽 280px，surface 底 + 右 hairline + 阴影 `0 8px 24px rgba(0,0,0,0.12)`
- 会话项：radius 8px，hover→surface-soft；激活项 accent-soft 底 + 左侧 2px accent 竖条
- 会话项操作（重命名/删除）：hover 才显示，icon 12px
- 状态点：running/streaming 时标题前 6px 脉冲圆点

### 确认对话框

- 居中模态，surface 底 + radius 16px + 阴影 `0 16px 48px rgba(0,0,0,0.2)`，遮罩 `rgba(0,0,0,0.4)` + 4px 模糊
- 顶部风险等级横条：high=warning 色、critical=danger 色，3px 高
- 按钮组右对齐：Cancel(Secondary) + Approve(Primary 或 Danger)

### 设置面板

- 右侧滑出抽屉，宽 320px，surface 底 + 左 hairline
- 分区标题：Caption 大写 + mute 字 + 下 hairline
- 表单控件高 32px，radius 8px，聚焦同输入框规则

## 5. Layout Principles

- 间距刻度：4 / 8 / 12 / 16 / 20 / 24，消息间距 12，区块间距 16
- 页面结构：`首页(居中输入)` → `聊天流(顶栏 + 消息流 + 底部输入)`
- 顶栏：40px 高，左侧浮层触发钮 + 会话标题，右侧设置钮
- 消息流：px-16，max-width 不限（侧边栏本身就窄），首条消息距顶 16
- 底部输入：与首页输入框同组件，贴底 + 上 1px hairline + canvas 底
- 首页：输入框垂直居中偏上（40% 位置），下方 2×2 快捷建议卡片（surface 底 + radius 12px + hover 浮起）

## 6. Depth & Elevation

| 层级 | 用途 | Light | Dark |
|---|---|---|---|
| L0 | canvas | 无阴影 | 无阴影 |
| L1 | 气泡、卡片 | `0 1px 2px rgba(0,0,0,0.04)` | `0 1px 2px rgba(0,0,0,0.3)` |
| L2 | 输入框、浮层触发 | `0 1px 3px rgba(0,0,0,0.06)` | `0 2px 6px rgba(0,0,0,0.4)` |
| L3 | 会话浮层、设置抽屉 | `0 8px 24px rgba(0,0,0,0.12)` | `0 8px 24px rgba(0,0,0,0.5)` |
| L4 | 确认对话框 | `0 16px 48px rgba(0,0,0,0.2)` | `0 16px 48px rgba(0,0,0,0.6)` |

**规则**：暗主题阴影加深但不扩大扩散半径；浮层必须同时有阴影 + hairline 边。

## 7. Do's and Don'ts

**Do**：
- accent 只给最关键的一个行动点（发送按钮 / 主 CTA）
- 流式输出时最后一条 AI 气泡底部显示 2px accent 呼吸条
- 所有交互元素 hover 必须有反馈（底色或字色变化）
- 暗主题下保持暖调，所有灰色系偏 stone 不偏 gray

**Don't**：
- 不用纯黑 `#000` / 纯白 `#FFF` 做大底色（用 canvas/surface token）
- 不用渐变底色、玻璃拟态、霓虹发光（保持克制）
- 不用 emoji 做图标（用 SVG）
- 气泡最大宽度不超过 92%，禁止全宽气泡（失去对话感）
- 禁止超过 200ms 的过渡动画

## 8. Responsive Behavior

- 目标宽度：320–480px（Chrome side panel 可拖拽调宽）
- <360px：会话浮层占满全宽；工具卡片参数区 max-height 降至 80px
- ≥400px：消息流 px 增至 20
- 触摸目标：所有可点元素 ≥28×28px
- 无横屏/桌面断点（扩展侧边栏场景固定）

## 9. Agent Prompt Guide

**快速色板**：accent `#C2410C`(light)/`#EA580C`(dark)，canvas `#FAFAF9`/`#161412`，surface `#FFF`/`#201D1A`

**页面生成 prompt 模板**：
> "Build a browser side panel chat UI per DESIGN.md: dual theme (warm stone light / warm black dark), terracotta orange accent, home view with centered large input + 4 suggestion cards, chat view with right-aligned orange user bubbles and left soft-surface assistant bubbles, collapsible tool call cards, overlay conversation drawer."

**Tailwind 映射**：
- accent → `orange-700`(l)/`orange-600`(d)
- canvas → `stone-50`(l)/自定义 `#161412`(d)
- surface → `white`(l)/自定义 `#201D1A`(d)
- hairline → `stone-200`(l)/自定义 `#38322D`(d)
- ink → `stone-900`(l)/`stone-100`(d)
