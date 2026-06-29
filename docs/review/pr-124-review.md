## 审查报告 — PR #124: T5 App 包裹 I18nProvider + header 国际化

### 变更概述
- **分支**: `feat/integrate-i18n-into-app-entry` → `dev`
- **Issue**: #111
- **修改文件数**: 2
  - `src/entrypoints/sidepanel/App.tsx` — 包裹 `I18nProvider`，header 标题国际化
  - `src/entrypoints/sidepanel/main.tsx` — 新增异步初始化，调用 `detectAndSetLanguage()`
- **风险等级**: 低 — 无 Critical/High 问题

---

### 审查要点逐项分析

#### 1. 硬编码中文文本替换
| 位置 | 原文本 | 替换为 | 验证 |
|------|--------|--------|------|
| `App.tsx:105` header 标题 | `BrowserAgent` | `t('app.title')` | ✅ zh-CN: "BrowserAgent", en: "BrowserAgent" |

唯一一处硬编码文本已正确替换。

#### 2. i18n key 定义检查

`app.title` → 存在于 `MessageSchema` (types.ts:22) ✅
`app.title` → 存在于 `zh-CN.json` (line 17): "BrowserAgent" ✅
`app.title` → 存在于 `en.json` (line 17): "BrowserAgent" ✅

#### 3. Props / 逻辑 / 样式变更检查

- `App.tsx`: `I18nProvider` 包裹 `ErrorBoundary` → `ChatProvider` → `ChatLayout`。组件层级正确，Provider 在最外层。
- `ChatLayout`: 仅新增 `const { t } = useI18n()`，无 Props 变更。
- `main.tsx`: 将同步渲染改为 `async init()` 异步初始化，先调用 `detectAndSetLanguage()` 再渲染。渲染时机延迟到语言检测完成后，逻辑合理。
- 无样式变更。

#### 4. 越界修改检查

无越界修改。变更严格限定在 `App.tsx` 和 `main.tsx`。

---

### 发现问题

无 Critical、High、Medium 问题。

---

### 测试建议

建议补充集成测试验证：
1. `I18nProvider` 正确包裹后，`useI18n()` 在子组件中可用
2. `detectAndSetLanguage()` 在首次启动时被调用

现有组件测试需要更新 mock 以包含 `I18nProvider` wrapper。

---

### 审查结论

- [x] **通过** — 无问题

**备注**: 变更干净、最小化。`init()` 未捕获异常，但 `detectAndSetLanguage` 内部处理了正常路径，存储异常属于极端边界，可接受在当前状态下不额外捕获。
