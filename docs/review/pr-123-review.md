## 审查报告 — PR #123

**PR**: T3: 实现 I18nProvider + useI18n hook (closes #108)
**分支**: feat/implement-i18n-provider-and-hook → dev
**审查时间**: 2026-06-29

---

### 变更概述
- 修改文件数：3（全部新增）
- 新增组件/函数：
  - `I18nProvider` — React Context Provider，负责加载语言包、响应跨标签同步
  - `useI18n()` — hook，返回 `{ locale, t, setLanguage }`
  - `resolveMessage()` — 点分隔路径解析
  - `applyVars()` — `{var}` 模板变量替换
- 新增测试：`i18n.test.tsx` — 7 个测试用例，全部通过（766/766 全绿）
- 风险等级：**中**

### 变更范围检查
✅ 仅新增 `src/entrypoints/sidepanel/i18n/` 和对应测试文件，未修改任何现有文件，符合方案范围，无越界修改。

---

### 发现问题

#### [MEDIUM] `setLanguage` 缺少错误处理 — 存储写入失败导致静默失败

- **文件**：`src/entrypoints/sidepanel/i18n/I18nProvider.tsx:83-88`
- **问题**：`setLanguage` 中 `await store.set(...)` 如果因存储满了或其他原因失败，异常会传播给调用方。如果 UI 组件调用 `setLanguage` 未 try/catch，会导致未捕获的 Promise rejection。目前没有任何一层进行错误处理。
- **现状分析**：由于 `setLocaleState` / `setMessages` 在 `store.set` 之后执行，如果写入失败，UI 状态不会错误更新（这是正确的）。但调用方需要知道写入失败了。
- **修复建议**：在 `setLanguage` 内部 catch 错误，至少有日志记录：

```typescript
const setLanguage = useCallback(async (lang: Locale) => {
  const store = ConfigStore.getInstance();
  const prefs = await store.get('preferences');
  try {
    await store.set('preferences', { ...prefs, language: lang });
    setLocaleState(lang);
    setMessages(messagesMap[lang]);
  } catch (err) {
    console.error('[i18n] Failed to persist language preference:', err);
  }
}, []);
```

- **测试遗漏**：当前测试未覆盖 `store.set` 失败的场景。

---

#### [MEDIUM] locale 有效性校验逻辑重复 3 次

- **文件**：`src/entrypoints/sidepanel/i18n/I18nProvider.tsx:58, 75, 82`
- **问题**：`lang === 'zh-CN' || lang === 'en'` 这个条件出现在三个地方。虽然 TypeScript 类型约束了 `Locale` 类型，但运行时对 storage 中读取的值仍需校验。
- **修复建议**：提取为 type guard 函数：

```typescript
function isSupportedLocale(value: string): value is Locale {
  return value === 'zh-CN' || value === 'en';
}
```

---

#### [MEDIUM] 初始 useEffect 中 `ConfigStore.get` 失败无任何反馈

- **文件**：`src/entrypoints/sidepanel/i18n/I18nProvider.tsx:56-64`
- **问题**：如果 `ConfigStore.getInstance().get('preferences')` 因任何原因抛出异常，组件会静默使用初始状态 `'zh-CN'`（useState 默认值），用户无法感知初始化失败。
- **修复建议**：添加 `.catch()` 记录错误日志，或考虑暴露 error state 到 context。

---

#### [MEDIUM] `resolveMessage` 对 `Record<string, string>` 叶子节点的行为与 MessageSchema 设计不完全匹配

- **文件**：`src/entrypoints/sidepanel/i18n/I18nProvider.tsx:25-28`
- **问题**：`resolvMessage` 最终检查 `typeof current !== 'string'` 会拒绝所有非 string 叶子节点。`MessageSchema` 中存在 `settings.provider.audioFormats: Record<string, string>` 类型的字段。当调用 `t('settings.provider.audioFormats')` 时会返回 key 本身而非正确的值。
- **实际影响**：低。`audioFormats` 通常作为枚举对象直接在组件中使用，不会通过 `t()` 获取。运行时行为安全（返回 key fallback）。
- **建议**：后续考虑在类型层面约束，将非 string 叶子从 `t()` 的 key 参数中排除。

---

#### [LOW] 生产环境 `console.warn` 噪音

- **文件**：`src/entrypoints/sidepanel/i18n/I18nProvider.tsx:23, 28, 36`
- **问题**：缺失 key 或变量时的 `console.warn` 在开发中有用，但生产环境中会输出噪音。
- **建议**：后续考虑使用环境变量控制日志级别，或构建时剔除。

---

#### [LOW] `I18nContext` 直接导出打破封装

- **文件**：`src/entrypoints/sidepanel/i18n/I18nProvider.tsx:17`
- **问题**：`export const I18nContext` 允许其他组件绕过 `useI18n` hook 直接消费 context。当前无此需求。
- **建议**：如果不需要拆分订阅，考虑不导出 context，仅通过 `useI18n` 访问。

---

### 逐项验证结果

| 审查项 | 状态 | 说明 |
|--------|------|------|
| I18nProvider 正确加载语言包、提供 context | ✅ | 静态 import + useEffect 读取 ConfigStore，正确 |
| t() 路径解析 | ✅ | 点分隔递归查找，未找到回退到 key，正确 |
| t() 模板变量 | ✅ | `{varName}` 正则替换，未提供变量保留原样，正确 |
| t() 缺失 key 回退 | ✅ | 返回原始 key，有 warn 日志 |
| setLanguage 更新 ConfigStore | ⚠️ | 功能正确，但缺少错误处理（见 MEDIUM #1） |
| ConfigStore.onChange 跨标签同步 | ✅ | 正确注册/取消监听，符合 Chrome extension 规范 |
| useI18n 在 Provider 外抛错 | ✅ | null check 抛错，测试覆盖 |

---

### 测试覆盖分析

**已覆盖（7 个用例）：**
- ✅ zh-CN 渲染正确
- ✅ en 渲染正确
- ✅ 模板变量替换（`{count}` 插值）
- ✅ 缺失 key 回退到 key 本身
- ✅ `setLanguage` 切换语言
- ✅ 跨标签同步（模拟 `onChanged` 外部变更）
- ✅ Provider 外使用抛错

**建议补充的测试用例：**

1. **无效语言回退** — 当 `preferences.language` 为不支持的 locale（如 `'fr'`）时，预期回退到默认 `'zh-CN'`
2. **preferences 完全不存在** — `storage.local.get('preferences')` 返回 `undefined` 时
3. **深层嵌套 key** — 如 `t('settings.provider.placeholder.apiKey')` → `'API Key'`
4. **store.set 失败** — 模拟 `set` rejection，验证异常传播或错误处理
5. **初始加载失败** — 模拟 `ConfigStore.get` rejection

---

### 审查结论

- [ ] 通过 — 无 Critical/High 问题
- [x] **有条件通过** — 仅 Medium 及以下问题

**总体评价**：
代码整体质量良好，逻辑正确，测试覆盖基本全面（766/766 全绿），符合 PR 描述的 5 个验收点。3 个 MEDIUM 问题建议在后续迭代中修复，不影响核心功能正确性。`setLanguage` 缺少错误处理是最值得关注的问题，但当前不阻塞合并。

**建议**：Approve with comments。MEDIUM 问题不强制在当前 PR 修复，建议在下个迭代中处理。
