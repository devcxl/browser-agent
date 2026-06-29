## 审查报告 — PR #122

### 变更概述
- **分支**：`feat/i18n-markdown-viewer` → `dev`
- **修改文件数**：1
- **代码变更**：+30 / −3 行
- **新增**：`MarkdownMessages` 类型、`getMarkdownMessages()` 函数
- **风险等级**：**低**

### 变更内容

在 `src/entrypoints/markdown-viewer/index.ts` 中：

1. 新增 `getMarkdownMessages()` — 从 `browser.storage.local.get('preferences')` 读取 `language` 字段
2. 根据 `language` 值动态 `import()` 对应的 locale JSON 文件（`en.json` 或 `zh-CN.json`）
3. 无 `preferences` 或 `language !== 'en'` 时默认使用 `zh-CN`
4. 将 `main()` 中原先硬编码的 3 处中文字符串替换为 locale 消息

---

### 审查逐项检查

#### ✅ 审查重点验证

| 检查项 | 结果 | 说明 |
|--------|------|------|
| `getMarkdownMessages()` 正确从 storage 读取 preferences | ✅ | `browser.storage.local.get('preferences')` 返回 `{ preferences?: UserPreferences }`，`language` 字段类型为 `'zh-CN' \| 'en'` |
| 动态 import 按语言加载正确 | ✅ | `language === 'en'` 时加载 `en.json`，否则加载 `zh-CN.json`，路径 `../sidepanel/locales/` 正确 |
| 无 preferences 时默认中文 | ✅ | `preferences?.language` 为 `undefined` 时，`=== 'en'` 为 `false`，走 `zh-CN` 分支 |
| 语言包 key 存在且匹配 | ✅ | `en.json` 和 `zh-CN.json` 均包含 `markdown.invalidLink`、`markdown.contentExpired`、`markdown.previewTitle` |
| 保留所有原有功能 | ✅ | `STYLE`、`marked()`、`browser.storage.local.remove(key)` 全部保留，未修改 |

#### ✅ 正确性

- `UserPreferences.language` 类型为 `'zh-CN' | 'en'`（`src/shared/types/storage.ts:51`），与代码逻辑一致
- `i18n/types.ts` 中的 `MessageSchema.markdown` 接口与 locale JSON 结构一致
- TypeScript 编译通过（`tsc --noEmit` 无错误）
- `import` 路径 `../sidepanel/locales/en.json` → `src/entrypoints/sidepanel/locales/en.json` 正确

#### ⚠️ 边界情况

- `language` 为其他非法值（如运行时 corrupted data）：逻辑正确回退到 `zh-CN`
- `preferences` 为 `undefined`：`?.` 可选链安全返回 `undefined`，回退到 `zh-CN`
- locale JSON 缺少 `markdown` key：无编译时安全保护，但 locale 文件由同一 repo 管理，维护风险可控

---

### 发现问题

#### [MEDIUM] 缺少错误处理 — `getMarkdownMessages()` 无 try/catch

- **文件**：`src/entrypoints/markdown-viewer/index.ts:10`
- **问题**：`getMarkdownMessages()` 中调用了 `browser.storage.local.get()` 和动态 `import()`，未包裹 try/catch。如果 storage 访问或模块加载失败，`main()` 中的 `await getMarkdownMessages()` 会抛出未捕获的 rejected promise，页面静默崩溃（显示空白 `<div id="root">`）。
- **影响**：理论上 storage API 和本地 JSON import 在生产环境中失败概率极低，但与防御性编码最佳实践不符。
- **注意**：该 entry point 原有代码同样无错误处理（`browser.storage.local.get(key)` 和 `.remove(key)` 也未包裹 try/catch），因此此问题属于**已有模式的一致性缺陷**，而非本次 PR 引入的回归。
- **修复建议**（可选）：

```typescript
async function getMarkdownMessages(): Promise<MarkdownMessages> {
  try {
    const { preferences } = await browser.storage.local.get('preferences');
    if (preferences?.language === 'en') {
      const mod = await import('../sidepanel/locales/en.json');
      return {
        invalidLink: mod.markdown.invalidLink,
        contentExpired: mod.markdown.contentExpired,
        previewTitle: mod.markdown.previewTitle,
      };
    }
    // 默认 zh-CN
    const mod = await import('../sidepanel/locales/zh-CN.json');
    return {
      invalidLink: mod.markdown.invalidLink,
      contentExpired: mod.markdown.contentExpired,
      previewTitle: mod.markdown.previewTitle,
    };
  } catch {
    // 硬编码 fallback，确保页面不会完全空白
    return {
      invalidLink: '无效链接',
      contentExpired: '内容已过期或不存在',
      previewTitle: '预览',
    };
  }
}
```

#### [LOW] 导入路径使用相对路径而非项目别名

- **文件**：`src/entrypoints/markdown-viewer/index.ts:14,21`
- **问题**：使用 `../sidepanel/locales/en.json` 相对路径。项目已在 `wxt.config.ts:78` 中配置 `@` → `/src` 别名，且 `index.html:7` 中已使用 `@/assets/tailwind.css`。
- **建议**：改为 `@/entrypoints/sidepanel/locales/en.json`，与项目现有风格一致，且对文件移动更健壮。

#### [LOW] 冗余变量 `lang`

- **文件**：`src/entrypoints/markdown-viewer/index.ts:13`
- **问题**：`const lang` 变量声明后仅在一处 `if` 判断中使用，可直接内联：

```typescript
// 现状：
const lang = preferences?.language === 'en' ? 'en' : 'zh-CN';
if (lang === 'en') { ... }

// 可简化为：
if (preferences?.language === 'en') { ... }
```

---

### 测试建议

markdown-viewer entry point 无现有测试覆盖。建议补充：

| 优先级 | 测试用例 | 描述 |
|--------|----------|------|
| 高 | `getMarkdownMessages()` preferences 为 `undefined` | 验证返回中文消息 |
| 高 | `getMarkdownMessages()` `language: 'en'` | 验证返回英文消息 |
| 高 | `getMarkdownMessages()` `language: 'zh-CN'` | 验证返回中文消息 |
| 中 | `getMarkdownMessages()` `language` 为非法值 | 验证回退到中文 |
| 低 | `main()` 缺少 `viewId` 参数 | 验证显示国际化错误消息 |
| 低 | `main()` storage 中无对应 content | 验证显示国际化"已过期"消息 |

---

### 审查结论

- [x] 有条件通过 — 仅 Medium 及以下问题

**通过。** 变更逻辑正确，符合方案设计要求（函数式读取 storage + 动态 import 语言包），无安全风险，无性能问题，TypeScript 编译通过。Medium 问题为已有代码模式的一致性缺陷，不阻塞合并。

---

*审查人：@reviewer*
*审查时间：2026-06-29*
