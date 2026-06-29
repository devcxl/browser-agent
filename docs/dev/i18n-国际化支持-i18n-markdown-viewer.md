# 开发文档: T13 - markdown-viewer 独立入口国际化

**Project:** i18n-国际化支持
**Task ID:** T13
**Slug:** i18n-markdown-viewer
**Issue:** #110
**类型:** frontend
**Batch:** 2
**依赖:** T1 (create-i18n-types-and-locales #106)

## 1. 目标

对 `src/entrypoints/markdown-viewer/index.ts` 进行国际化改造。由于 markdown-viewer 是独立 HTML 页面（非 React 树），采用函数式方式：从 `chrome.storage.local` 读取语言偏好，动态 `import()` 对应语言包，替换硬编码中文文本。

## 2. 前置条件

- 已完成 T1：`locales/zh-CN.json` 中定义了 `markdown` 命名空间（`invalidLink`、`contentExpired`、`previewTitle`）
- 了解 `chrome.storage.local` API
- 了解动态 `import()` 语法

## 3. 实现步骤

### 3.1 改造 `markdown-viewer/index.ts`

- **文件：** `src/entrypoints/markdown-viewer/index.ts`

**改造要点：**

1. 在 `main()` 函数开头增加语言包加载逻辑
2. 替换三处硬编码文本：
   - `'无效链接'`（第 142 行）→ `msg.invalidLink`
   - `'内容已过期或不存在'`（第 149 行）→ `msg.contentExpired`
   - `'Markdown Preview'`（第 153 行）→ `msg.previewTitle`

**关键逻辑：**

```typescript
import { marked } from 'marked';

// ... STYLE 常量保持不变 ...

/** 从 storage 读取语言并用动态 import 加载对应的 markdown 翻译 */
async function loadMarkdownMessages(): Promise<{
  invalidLink: string;
  contentExpired: string;
  previewTitle: string;
}> {
  try {
    const result = await browser.storage.local.get('preferences');
    const lang = result.preferences?.language ?? 'zh-CN';

    if (lang === 'en') {
      const enModule = await import('../sidepanel/locales/en.json');
      return enModule.markdown;
    }
    // 默认 zh-CN
    const zhModule = await import('../sidepanel/locales/zh-CN.json');
    return zhModule.markdown;
  } catch {
    // 语言包加载失败时的 fallback（英文）
    return {
      invalidLink: 'Invalid link',
      contentExpired: 'Content expired or does not exist',
      previewTitle: 'Markdown Preview',
    };
  }
}

async function main() {
  const msg = await loadMarkdownMessages();

  const params = new URLSearchParams(location.search);
  const viewId = params.get('viewId');
  if (!viewId) {
    document.getElementById('root')!.textContent = msg.invalidLink;
    return;
  }

  const key = `markdown:${viewId}`;
  const { [key]: content } = await browser.storage.local.get(key);
  if (!content) {
    document.getElementById('root')!.textContent = msg.contentExpired;
    return;
  }

  document.title = msg.previewTitle;

  // ... 其余渲染逻辑保持不变 ...
}
```

### 3.2 实现说明

#### 3.2.1 语言优先检测

- 从 `chrome.storage.local.get('preferences')` 读取 `result.preferences?.language`
- 如果不存在则默认 `'zh-CN'`
- 由于 markdown-viewer 是独立入口，不能通过 React Context 或 `ConfigStore`（`ConfigStore` 依赖 sidepanel 上下文），因此直接用 `browser.storage.local` 原始 API

#### 3.2.2 动态 import 语言包

- 使用动态 `import()` 而非静态 `import`
- 原因：markdown-viewer 是独立 entry，静态 import 会将两个语言包的完整内容都打包进来（约 8KB），动态 import 可以按需加载（但实际 Vite 可能仍会打包两个，因为无法静态分析动态路径）
- `import('../sidepanel/locales/zh-CN.json')` 和 `import('../sidepanel/locales/en.json')` 是确定的路径，Vite 可以进行 code splitting

#### 3.2.3 错误处理

- 如果 `browser.storage.local.get` 或 `import()` 失败（例如在非扩展环境），使用硬编码的英文 fallback 文本
- 这确保了 markdown-viewer 在任何环境下都能正常显示基本文本

## 4. 接口/契约

### 4.1 新增接口

无外部 API。内部函数：

| 函数 | 签名 | 描述 |
|---|---|---|
| `loadMarkdownMessages()` | `() => Promise<{ invalidLink, contentExpired, previewTitle }>` | 按需加载 markdown 翻译 |

### 4.2 数据模型变更

无。

## 5. 测试指引

### 5.1 手动测试

- **场景 1：中文环境**
  - 前置：`chrome.storage.local` 中 `preferences.language = 'zh-CN'`
  - 打开 markdown-viewer URL 无 viewId 参数 → 页面显示 `"无效链接"`
  - 打开 markdown-viewer URL 带无效 viewId → 页面显示 `"内容已过期或不存在"`
  - 打开有效 markdown 内容 → `document.title` 为 `"Markdown Preview"`

- **场景 2：英文环境**
  - 前置：`preferences.language = 'en'`
  - 同上操作 → 页面显示 `"Invalid link"` / `"Content expired or does not exist"` / `"Markdown Preview"`

- **场景 3：无偏好记录**
  - 前置：`chrome.storage.local` 中无 `preferences` key
  - 同上操作 → 默认显示中文（zh-CN）

- **场景 4：语言包加载失败**
  - 在非扩展环境或模拟 import 失败 → 显示英文 fallback 文本

### 5.2 代码审查要点

- 确认三处硬编码文本全部替换为 `msg.xxx` 引用
- 确认 `loadMarkdownMessages()` 调用在 `main()` 开头，在首次文本使用之前
- 确认 STYLE 常量保持不变（CSS 不包含待翻译文本）

## 6. 验收标准

- [ ] markdown-viewer 根据 `preferences.language` 选择正确的语言包
- [ ] `viewId` 缺失时显示翻译后的 "无效链接" / "Invalid link"
- [ ] `content` 不存在时显示翻译后的 "内容已过期或不存在" / "Content expired or does not exist"
- [ ] `document.title` 显示翻译后的标题
- [ ] 无 `preferences` 记录时默认显示中文
- [ ] 语言包通过动态 `import()` 加载
- [ ] 异常情况下有英文 fallback，不会崩溃
- [ ] `npx tsc --noEmit` 无类型错误

## 7. 注意事项

- **动态 import 路径**：`../sidepanel/locales/zh-CN.json` 是相对路径，需要确认 markdown-viewer 的 `index.ts` 和 sidepanel 的 `locales/` 目录之间的相对位置正确：
  - markdown-viewer: `src/entrypoints/markdown-viewer/index.ts`
  - sidepanel locales: `src/entrypoints/sidepanel/locales/zh-CN.json`
  - 相对路径：`../sidepanel/locales/zh-CN.json` ✓
- **Chunk 共享**：由于 sidepanel 入口也静态 import 了相同的 JSON 文件，Vite 在构建时应当能够自动 de-duplicate，两个 entry 共享同一个 chunk。但此优化对正确性无影响。
- **不要复用 ConfigStore**：markdown-viewer 是独立 entry，不应引入 `ConfigStore`（会引入不必要的依赖链）。直接用 `browser.storage.local` 是最简方案。
- **仅翻译 markdown 命名空间**：动态 import 整个语言包 JSON 后只取 `.markdown` 属性。Vite 的 tree-shaking 对 JSON 不生效，但 `loadMarkdownMessages` 返回类型只包含 `markdown` 的三个字段，运行时只使用这三个字段。
- **STYLE 常量不翻译**：CSS 内容不包含面向用户的文本，保持原样。
