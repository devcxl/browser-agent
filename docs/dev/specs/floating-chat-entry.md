# 浮动聊天入口技术方案

> 状态：Proposed
> 日期：2026-07-19
> 关联：[#172 浮动聊天入口：页面内可拖拽按钮 + 内嵌聊天面板](https://github.com/devcxl/browser-agent/issues/172)
> 上游 PRD：[floating-chat-entry.md](../../prd/floating-chat-entry.md)

## 1. 目标与边界

在每个 http(s) 页面内注入一个浮动圆形按钮，点击后在页面内滑出手机大小的聊天面板，面板内通过 iframe 加载扩展自身的 `sidepanel.html`，完整复用现有 Agent 聊天能力。

不修改聊天引擎、工具调用链、Provider 体系、会话存储结构。聊天逻辑零复制，新增代码集中在 content script 侧的挂载/拖拽/开合，以及 sidepanel 的内嵌模式适配。不新增 npm 依赖。

## 2. 当前架构

```text
content script (src/content/index.ts)
  └─ 仅提供页面数据能力（readability / selection / metadata / click）
     通过 Port 'content-script-bridge' 响应 background 请求，不渲染任何 UI

sidepanel (src/entrypoints/sidepanel/)
  └─ 完整聊天应用：useChat + DirectChatTransport + ToolLoopAdapter
     直接访问 browser.* API 与 ConfigStore，自包含主题/i18n
```

关键事实：

- 聊天引擎运行在扩展页面上下文（`useChatAgent.ts` 使用 `DirectChatTransport`，`src/entrypoints/sidepanel/hooks/useChatAgent.ts:11`），iframe 加载 `sidepanel.html` 后就是完整扩展页面环境，工具链无需任何改造。
- content script 已声明 `matches: ['<all_urls>']`（`src/content/index.ts:8`），本方案复用同一脚本，不新增注入点。
- sidepanel 代码未使用任何 side_panel 特有 API（全仓仅 `capability-detector.ts` 探测一次），可直接被 iframe 嵌入。
- 存储层 `ConfigStore` + `StorageSchema`（`src/shared/types/storage.ts:8`）已集中管理设置，扩展一个键即可。

## 3. 决策摘要

| 决策         | 选择                                        | 原因                                                         |
| ------------ | ------------------------------------------- | ------------------------------------------------------------ |
| 聊天承载     | iframe 加载 `sidepanel.html?embedded=1`     | 聊天逻辑零复制；会话/设置/主题/i18n 天然共享                 |
| content 侧 UI | 原生 DOM + Shadow Root + 内联样式          | 按钮/菜单/框架仅约十个元素，引入 React + Tailwind 代价大于收益 |
| 拖拽吸附     | Pointer Events + setPointerCapture + transform | 一套代码覆盖鼠标/触控；transform 不触发页面重排              |
| 位置模型     | `{ side, top }` 全局存储                    | 需求已定全局统一；side 驱动面板滑出方向                       |
| iframe 生命周期 | 首次打开懒加载，之后常驻不销毁             | 保留聊天上下文；重复打开无重载开销                            |
| 开合通信     | `window.postMessage`，来源与类型白名单校验   | iframe 与 content script 同页面，postMessage 是最小机制        |
| 开关语义     | 脚本常驻 + 启动早退 + `storage.onChanged`    | 已打开标签页切换开关即时生效，无需刷新页面                    |

## 4. 目标架构

```text
页面
 └─ <div id="ba-floating-host">            (content script 创建，z-index 2147483647)
     └─ #shadow-root
         ├─ <style>                         (内联样式，约 120 行)
         ├─ <button> 圆形 logo 按钮          (拖拽 / 点击 toggle / 右键菜单触发)
         ├─ <div> 快捷菜单                   (「在此站点隐藏」，默认隐藏)
         └─ <div> 面板容器                   (position: fixed，同侧)
             ├─ <div> 面板头部               (仅内嵌提示，关闭按钮由 iframe 内渲染——见 §8)
             └─ <iframe src="sidepanel.html?embedded=1">  (懒加载，加载后常驻)

ConfigStore.floatingButtonSettings
  ├─ content script 启动时读取 → 早退 / 挂载
  ├─ storage.onChanged → 实时挂载 / 卸载 / 隐藏
  └─ SettingsPanel「浮动按钮」区块读写
```

### 4.1 文件边界

| 文件                                                     | 变更                                                     |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `src/content/index.ts`                                   | main() 末尾追加浮动 UI 启动调用，原有 Port 监听不动       |
| `src/content/floating-widget/index.ts`                   | 新增：启动入口（读设置、早退、onChanged 订阅）            |
| `src/content/floating-widget/widget.ts`                  | 新增：Shadow host、按钮、菜单、面板容器的 DOM 组装        |
| `src/content/floating-widget/drag.ts`                    | 新增：拖拽、点击阈值判定、边缘吸附、垂直 clamp（纯逻辑可单测） |
| `src/content/floating-widget/panel.ts`                   | 新增：iframe 懒加载、滑入滑出动画、postMessage 监听       |
| `src/content/floating-widget/blacklist.ts`               | 新增：主机名匹配、快捷隐藏写入（纯函数）                  |
| `src/content/floating-widget/strings.ts`                 | 新增：zh-CN/en 两份极简文案，跟随 `preferences.language`  |
| `src/shared/types/storage.ts`                            | `StorageSchema` 新增 `floatingButtonSettings`             |
| `src/shared/storage/config-store.ts`                     | 新增键的默认值与迁移                                      |
| `src/entrypoints/sidepanel/App.tsx`                      | 检测 `embedded` 参数，渲染内嵌头部（含关闭按钮）          |
| `src/entrypoints/sidepanel/components/SettingsPanel.tsx` | 新增「浮动按钮」设置区块                                  |
| `src/entrypoints/sidepanel/locales/zh-CN.json`、`en.json` | 新增设置区块与内嵌头部文案                               |
| `wxt.config.ts`                                          | manifest 声明 `web_accessible_resources: sidepanel.html`  |

## 5. 存储模型

```ts
// src/shared/types/storage.ts
export interface FloatingButtonSettings {
  /** 总开关，默认 true */
  enabled: boolean;
  /** 按钮位置：吸附边缘 + 距视口顶部 px，默认右侧垂直居中 */
  position: { side: 'left' | 'right'; top: number } | null;
  /** 站点黑名单（主机名，含子域名后缀匹配），默认 [] */
  blacklist: string[];
}

export interface StorageSchema {
  // ...existing keys
  floatingButtonSettings: FloatingButtonSettings;
}
```

- `ConfigStore` 默认值：`{ enabled: true, position: null, blacklist: [] }`，读取时与存储值合并（沿用现有默认值合并模式），无需数据迁移。
- `position: null` 表示未拖拽过，渲染默认位置。

## 6. 浮动按钮与拖拽

### 6.1 挂载

```ts
// src/content/floating-widget/index.ts（示意）
export async function startFloatingWidget() {
  const settings = await configStore.get<FloatingButtonSettings>('floatingButtonSettings');
  if (!shouldMount(settings, location.hostname)) return;   // 早退：不创建任何 DOM

  const widget = new FloatingWidget(settings);
  widget.mount();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.floatingButtonSettings) return;
    const next = merge(changes.floatingButtonSettings.newValue);
    shouldMount(next, location.hostname) ? widget.apply(next) : widget.destroy();
    // destroy 后再次变为可挂载状态时重新 new（避免复活已销毁实例）
  });
}

function shouldMount(s: FloatingButtonSettings, host: string): boolean {
  return s.enabled && !isBlacklisted(s.blacklist, host);
}
```

### 6.2 拖拽与吸附

- `pointerdown` 记录起点并 `setPointerCapture`；`pointermove` 累计位移。
- 位移 < 5px 的 `pointerup` 视为点击 → toggle 面板；否则进入拖拽态，按钮以 `transform: translate()` 跟随指针。
- 拖拽中指针超出视口时按钮 clamp 在视口内。
- `pointerup`（拖拽态）：
  1. 目标 `side` = 指针横坐标 < 视口中线 ? `'left'` : `'right'`；
  2. `top` = clamp(指针纵坐标 - 按钮半径, 8, innerHeight - 按钮高度 - 8)；
  3. 加 CSS transition 吸附到边缘；
  4. 写入 `position: { side, top }` 到存储（防抖 300ms，吸附动画结束即写一次）。
- 长按（≥500ms 无位移）与 `contextmenu` 均触发快捷菜单；菜单项「在此站点隐藏」→ 当前 `location.hostname` 写入黑名单 → `widget.destroy()`。

### 6.3 Shadow DOM 与样式

- host 元素挂到 `document.documentElement`，`all: initial` 不适用 shadow 内部，样式全部写在 shadow `<style>` 中，不读写页面任何样式。
- host 自身 `position: fixed; z-index: 2147483647; width/height: 0`，不拦截按钮区域以外的页面事件（按钮/面板各自定位）。
- 页面 SPA 导航不影响挂载（content script 生命周期跟随文档）。

## 7. 聊天面板

### 7.1 容器与动画

- 面板容器 `position: fixed`，`width: 380px; height: 640px`，约束：`max-width: calc(100vw - 16px)`、`max-height: calc(100vh - 16px)`。
- 定位：与按钮同侧，水平贴边 8px；垂直方向优先与按钮纵向居中对齐，超出视口时 clamp。
- 滑入滑出：`transform: translateX(±110%)` ↔ `translateX(0)` + opacity，250ms ease-out。

### 7.2 iframe 生命周期

- 首次打开面板时才设置 `iframe.src = browser.runtime.getURL('sidepanel.html') + '?embedded=1'`（懒加载）。
- 关闭面板仅隐藏容器（`visibility` + transform），不销毁 iframe——聊天上下文跨开合保留。
- `widget.destroy()`（开关关闭/进入黑名单）时移除整个 host，iframe 一并销毁。

### 7.3 开合通信

iframe（sidepanel 内嵌头部关闭按钮）→ 外层：

```ts
window.parent.postMessage({ source: 'ba-floating-widget', type: 'close-request' }, '*');
```

content script 侧监听并校验：

```ts
window.addEventListener('message', (e) => {
  if (e.source !== iframe.contentWindow) return;
  if (e.data?.source !== 'ba-floating-widget' || e.data?.type !== 'close-request') return;
  panel.close();
});
```

外层 → iframe 无消息需求：主题/语言/会话数据全部走共享 `ConfigStore`，sidepanel 已有响应机制。

## 8. Side Panel 内嵌模式

`App.tsx` 启动时读取 `new URLSearchParams(location.search).get('embedded') === '1'`：

- 为 true 时在最顶部渲染内嵌头部条（高 40px，含扩展名与关闭按钮），关闭按钮发送 §7.3 的 `close-request`。
- 其余布局、路由、Provider 引导、设置页全部不变。

与 [ADR: Provider 就绪度驱动首次聊天引导](../../adr/2026-07-18-provider-onboarding-state.md) 的交互：iframe 每次创建是一个新的挂载周期，无完整 Provider 时会在面板内再次出现一次配置向导——语义与「每次启动提示一次」一致（面板即启动），且引导在面板内可完成配置，属于预期行为。

## 9. 设置页

`SettingsPanel` 新增「浮动按钮」区块（组件 `FloatingButtonSection`）：

- 开关：绑定 `floatingButtonSettings.enabled`。
- 黑名单列表：逐条显示主机名 + 删除按钮；空态文案。
- 位置重置：提供「重置按钮位置」（写回 `position: null`），方便按钮意外丢失时找回。
- 文案进 sidepanel i18n（`zh-CN.json` / `en.json`）；content 侧按钮 tooltip 与菜单文案较少，在 `strings.ts` 内置两份，按 `preferences.language` 取值，不引入 i18n 框架。

## 10. Manifest 变更

```ts
// wxt.config.ts manifest 追加（Chrome 与 Firefox 均声明）
manifest.web_accessible_resources = [
  { resources: ['sidepanel.html'], matches: ['<all_urls>'] },
];
```

`sidepanel.html` 被声明为 web accessible 后任何网页可 iframe 加载它；页面脚本虽能嵌入该页面，但无法跨源读取其内容，风险与现状（任何扩展页面均可被 `runtime.getURL` 定位）相当。不接受页面 → iframe 的任何消息指令（§7.3 单向通信）。

## 11. 与既有 ADR 的兼容性

| ADR | 结论 |
| --- | ---- |
| [2026-07-17 AI SDK 迁移](../../adr/2026-07-17-ai-sdk-migration.md) | 不触碰聊天栈；iframe 复用 sidepanel 即复用 `useChat` + `DirectChatTransport`，方向一致 |
| [2026-07-18 聊天本地 UI 原语](../../adr/2026-07-18-chat-ui-local-primitives.md) | content 侧不引入组件库/新依赖，与其一致；按钮/菜单使用原生元素属同一路线 |
| [2026-07-18 Provider 就绪度引导](../../adr/2026-07-18-provider-onboarding-state.md) | iframe 新挂载周期触发一次引导为预期行为，见 §8 |

无冲突。

## 12. 测试策略

| 层 | 内容 |
| -- | ---- |
| 单测（vitest） | `drag.ts`：点击/拖拽阈值、side 判定、垂直 clamp；`blacklist.ts`：精确/子域名/大小写匹配；`shouldMount` 早退分支；存储默认值合并 |
| 单测（组件） | sidepanel `embedded` 模式渲染内嵌头部且点击发出 `close-request`；SettingsPanel 新区块读写设置 |
| e2e（playwright） | 加载扩展 → 测试页出现按钮 → 拖拽吸附 → 打开面板 → iframe 加载成功 → 关闭；开关关闭后 DOM 无残留 |
| 手动验收 | Chrome MV3 + Firefox MV3；严格 CSP 站点（github.com）；PRD §7 验收环境矩阵 |

## 13. 风险与缓解

| 风险 | 缓解 |
| ---- | ---- |
| 严格 CSP 站点拦截扩展 iframe（理论，Firefox 历史个案） | e2e 覆盖 github.com；iframe `load` 事件超时未触发时在容器内显示「此页面无法加载聊天面板」提示 |
| 每页一个常驻 iframe 的内存开销 | 懒加载保证未使用零开销；开关关闭即整体销毁；在 PRIVACY/文档中说明 |
| 按钮与高交互页面（地图、画布）指针事件冲突 | 仅按钮自身监听 pointer 事件；拖拽阈值避免误触 |
| `sidepanel.html` 暴露后被恶意页面嵌入探测 | 内容跨源不可读；无页面 → iframe 消息通道；不携带额外权限 |
| SPA 页面 `location.hostname` 不变但用户期望按路径隐藏 | 黑名单按主机名（PRD 已确认）；按路径隐藏列入 Out of Scope |

## 14. 实施顺序

1. 存储扩展 + 默认值（单测）
2. `drag.ts` / `blacklist.ts` 纯逻辑（单测）
3. `widget.ts` + `panel.ts` + 启动入口（e2e 冒烟）
4. sidepanel `embedded` 模式 + `close-request`（组件测试）
5. SettingsPanel 区块 + i18n（组件测试）
6. manifest 声明 + 双浏览器构建 + e2e + 手动验收矩阵
