---
name: "sidepanel-embedded-mode"
depends_on: []
labels: ["frontend"]
worktree_root: ".worktree/sidepanel-embedded-mode/"
---

## 目标

Side Panel 适配内嵌模式：检测 `?embedded=1` 查询参数，渲染内嵌头部（含关闭按钮），发送 `close-request` 给外层。

## 实现要点

1. 在 `src/entrypoints/sidepanel/App.tsx` 启动逻辑中：
   - 读取 `new URLSearchParams(location.search).get('embedded')`
   - 存储为 context / prop / state（决定是否渲染内嵌头部）

2. 新建 `src/entrypoints/sidepanel/components/EmbeddedHeader.tsx`：
   - 固定顶部条，高约 40px
   - 左侧显示扩展名或 logo
   - 右侧关闭按钮 → 调用：
     ```ts
     window.parent.postMessage(
       { source: 'ba-floating-widget', type: 'close-request' },
       '*'
     );
     ```
   - 使用现有主题变量，支持 light/dark

3. 内嵌模式下其余布局不变（Provider 引导、消息流、输入框照常渲染）。

4. 与 [ADR: Provider 就绪度引导](docs/adr/2026-07-18-provider-onboarding-state.md) 交互：内嵌 iframe 每次加载是新挂载周期，无完整 Provider 时会照常触发一次自动引导，属预期行为。

## 验收标准

- [ ] 不传 `embedded` 参数时，页面行为与现在完全一致（无内嵌头部）
- [ ] `embedded=1` 时渲染内嵌头部条，关闭按钮点击发送正确的 `postMessage`
- [ ] 发送的消息包含 `source: 'ba-floating-widget'` 和 `type: 'close-request'`
- [ ] 内嵌头部在 light/dark 主题下正常显示
- [ ] React Testing Library 组件测试覆盖：头部的存在/不存在、关闭按钮消息发送

## Worktree
- 路径: `.worktree/sidepanel-embedded-mode/`
- 分支: `feat/sidepanel-embedded-mode`
```json
