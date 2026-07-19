---
name: "widget-mounting-and-panel"
depends_on: ["storage-extend-floating-settings", "drag-blacklist-pure-logic"]
labels: ["backend"]
worktree_root: ".worktree/widget-mounting-and-panel/"
---

## 目标

实现 content script 侧浮动控件的 DOM 组装：Shadow host、圆形按钮、快捷菜单、iframe 面板容器、拖拽交互绑定与启动入口。

## 实现要点

1. 新建 `src/content/floating-widget/` 下文件：
   - `widget.ts`：`FloatingWidget` 类
     - `mount()` — 创建 Shadow host（挂载到 `document.documentElement`），shadow root 内含：内联 `<style>`（约 120 行）、按钮（`<button>` 圆形 logo）、快捷菜单（`<div>` 单项）、面板容器（`<div>` + iframe 预留）
     - `apply(settings)` — 响应设置变更（开关/位置/黑名单）
     - `destroy()` — 移除整个 host，清理监听器
     - 按钮事件绑定：`pointerdown/move/up` → 调用 `drag.ts` 逻辑
     - `contextmenu` + 长按（≥500ms 无位移）→ 显示快捷菜单
     - 菜单项点击 → 调用 `blacklist.ts` 的 `addToBlacklist` → 更新存储 → `destroy()`
   - `panel.ts`：`ChatPanel` 类
     - 懒加载 iframe：`toggle()` 首次调用时设置 `iframe.src`
     - 滑入/滑出动画（transform + opacity，250ms ease-out）
     - 监听 `window.message`，校验 `event.source === iframe.contentWindow` 和消息白名单，收到 `close-request` 时关闭
     - iframe `load` 事件超时处理（如 5s 未触发，显示降级提示）
   - `index.ts`：`startFloatingWidget()` 入口函数
     - 读取 `floatingButtonSettings` → `shouldMount()` 判定
     - 订阅 `storage.onChanged` → 实时挂载/卸载
     - 全局唯一实例 guard

2. 在 `src/content/index.ts` 的 `main()` 末尾调用 `startFloatingWidget()`（不影响现有 Port 监听）。

3. 按钮 icon：使用 `<img>` 加载 `browser.runtime.getURL('logo-48.png')`，或内联 SVG。

## 验收标准

- [ ] 开启开关后页面出现圆形浮动按钮，位于默认位置
- [ ] 按钮可拖拽，松手吸附到左/右边缘
- [ ] 点击按钮打开面板，iframe 加载 `sidepanel.html?embedded=1`，再点或发送 `close-request` 关闭
- [ ] 按钮 `contextmenu`/长按显示快捷菜单，「在此站点隐藏」后按钮消失、该站点加入黑名单
- [ ] 设置开关关闭后按钮立即消失且 DOM 无残留
- [ ] 按钮区域外页面交互不受影响
- [ ] 面板未打开时不加载 iframe（首次打开才懒加载）
- [ ] playwright e2e 冒烟：按钮出现、拖拽、面板开合

## Worktree
- 路径: `.worktree/widget-mounting-and-panel/`
- 分支: `feat/widget-mounting-and-panel`
```json
