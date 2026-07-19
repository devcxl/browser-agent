---
name: "manifest-e2e-integration"
depends_on: ["widget-mounting-and-panel", "sidepanel-embedded-mode", "settings-floating-section"]
labels: ["backend", "frontend"]
worktree_root: ".worktree/manifest-e2e-integration/"
---

## 目标

声明 manifest `web_accessible_resources`，编写 e2e 端到端测试，双浏览器构建验证。

## 实现要点

1. `wxt.config.ts` manifest 追加 `web_accessible_resources`：
   ```ts
   manifest.web_accessible_resources = [
     { resources: ['sidepanel.html'], matches: ['<all_urls>'] },
   ];
   ```
   确保 Chrome 和 Firefox 均声明。

2. e2e 测试（`e2e/` 目录，已有 playwright 基建）：
   - 扩展加载后测试页出现浮动按钮
   - 拖拽按钮到左侧 + 吸附
   - 点击打开面板 → iframe 加载成功 → 面板可见
   - 面板内容存在（至少 iframe loaded 事件触发）
   - 关闭按钮 → 面板消失

3. 双浏览器构建验证：
   - `npm run build:chrome` → 检查 dist/chrome-mv3/ 包含 sidepanel.html 且 manifest 声明 web_accessible_resources
   - `npm run build:firefox` → 同上

4. 如果有需要，修复各任务合并后可能产生的小冲突或集成问题。

## 验收标准

- [ ] `wxt build -b chrome` 与 `wxt build -b firefox` 成功
- [ ] dist manifest 包含 `sidepanel.html` 的 `web_accessible_resources` 声明
- [ ] playwright e2e 扩展测试通过（至少覆盖按钮出现、面板打开、关闭流程）
- [ ] 手动在 Chrome 和 Firefox 加载 dist 扩展，github.com 页面验证按钮/面板全流程

## Worktree
- 路径: `.worktree/manifest-e2e-integration/`
- 分支: `feat/manifest-e2e-integration`
```json
