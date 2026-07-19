---
name: "drag-blacklist-pure-logic"
depends_on: []
labels: ["backend"]
worktree_root: ".worktree/drag-blacklist-pure-logic/"
---

## 目标

实现拖拽吸附、黑名单匹配的纯函数逻辑（无 DOM 依赖），带完整单测。

## 实现要点

1. 新建 `src/content/floating-widget/drag.ts`：
   - `isClick(movePx: number, threshold?: number): boolean` — 位移阈值判定，默认 5px
   - `resolveSide(clientX: number, vw: number): 'left' | 'right'` — 中位线判定
   - `clampTop(pointerY: number, buttonSize: number, vh: number): number` — 垂直 clamp 到 [8, vh - buttonSize - 8]

2. 新建 `src/content/floating-widget/blacklist.ts`：
   - `isBlacklisted(blacklist: string[], hostname: string): boolean` — 主机名精确匹配 + 子域名后缀匹配（`host === blocked \|\| host.endsWith('.' + blocked)`）
   - 大小写不敏感
   - `addToBlacklist(blacklist: string[], hostname: string): string[]` — 去重后返回新数组

3. 新建 `src/content/floating-widget/strings.ts`：
   - 内置 zh-CN / en 两份文案（按钮 aria-label、菜单项"在此站点隐藏"/"Hide on this site"等，约 5-8 条）
   - `getStrings(lang: 'zh-CN' | 'en'): FloatingWidgetStrings`

4. `shouldMount(settings: FloatingButtonSettings, hostname: string): boolean` — 早退判定（转发到 `isBlacklisted`）

## 验收标准

- [ ] `drag.ts` 所有函数单测，覆盖：click 阈值边界、side 判定（left/right/mid）、垂直 clamp 边界（贴顶/贴底/范围内）
- [ ] `blacklist.ts` 单测覆盖：精确匹配、子域名匹配、大小写、空列表
- [ ] `strings.ts` 两语言返回正确文案，类型安全
- [ ] 零 DOM / browser API 依赖，所有函数可在 Node.js 单测环境运行

## Worktree
- 路径: `.worktree/drag-blacklist-pure-logic/`
- 分支: `feat/drag-blacklist-pure-logic`
```json
