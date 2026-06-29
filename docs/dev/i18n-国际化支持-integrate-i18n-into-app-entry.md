# 开发文档: T5 - App 包裹 I18nProvider + header 国际化

**Project:** i18n-国际化支持
**Task ID:** T5
**Slug:** integrate-i18n-into-app-entry
**Issue:** #111
**类型:** frontend
**Batch:** 3
**依赖:** T3 (I18nProvider + useI18n 实现)

## 1. 目标

在 `main.tsx` 渲染前调用 `detectAndSetLanguage()`，在 `App.tsx` 中用 `I18nProvider` 包裹整个组件树，并将 header 中的硬编码标题 `"BrowserAgent"` 替换为 `t('app.title')`。

## 2. 前置条件

- [ ] T3 完成 — `I18nProvider` 组件和 `useI18n` hook 已实现，可从 `@/entrypoints/sidepanel/i18n` 导入
- [ ] T1 完成 — `locales/zh-CN.json` 和 `locales/en.json` 语言包已创建，包含 `app.title` 等 key
- [ ] T2 完成 — `language-detector.ts` 的 `detectAndSetLanguage()` 函数可导入

## 3. 实现步骤

### 3.1 改造 main.tsx — 渲染前调用语言检测

**文件：** `src/entrypoints/sidepanel/main.tsx`

当前代码：
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
```

改造后：
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { detectAndSetLanguage } from './i18n/language-detector';

(async () => {
  // 渲染前同步/异步执行语言检测，确保首次渲染时语言已就绪
  await detectAndSetLanguage();

  const root = document.getElementById('root');
  if (root) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
})();
```

**关键逻辑：**
- 用 IIFE async 包裹，确保 `detectAndSetLanguage()` 在 `ReactDOM.createRoot` 之前完成
- `detectAndSetLanguage()` 内部逻辑（T2 实现）：如果 `ConfigStore` 中已有语言偏好则跳过，否则根据 `navigator.language` 检测并写入
- 此顺序确保 `I18nProvider` 挂载时 `ConfigStore.get('preferences').language` 已有正确值

### 3.2 改造 App.tsx — 包裹 I18nProvider

**文件：** `src/entrypoints/sidepanel/App.tsx`

改造点：

#### 3.2.1 增加导入

```typescript
import { I18nProvider } from './i18n/I18nProvider';
import { useI18n } from './i18n/useI18n';
import { detectAndSetLanguage } from './i18n/language-detector';
```

#### 3.2.2 改造默认导出 `App()` 函数

当前：
```tsx
export default function App() {
  return (
    <ErrorBoundary>
      <ChatProvider>
        <ChatLayout />
      </ChatProvider>
    </ErrorBoundary>
  );
}
```

改造后：
```tsx
export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ChatProvider>
          <ChatLayout />
        </ChatProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
```

**关键决策：** `I18nProvider` 放在 `ErrorBoundary` 之内、`ChatProvider` 之外。这样错误边界能捕获 i18n 初始化错误，同时所有子组件通过 Context 获取翻译能力。

#### 3.2.3 改造 header 文本

在 `ChatLayout` 函数内部，添加 `useI18n()` 调用：

```typescript
function ChatLayout() {
  const { t } = useI18n();
  // ... 其余 state 和逻辑保持不变
```

将第 102 行的 header 标题从硬编码：
```tsx
<span className="text-sm font-semibold text-ink tracking-wide">BrowserAgent</span>
```
改为：
```tsx
<span className="text-sm font-semibold text-ink tracking-wide">{t('app.title')}</span>
```

#### 3.2.4 改造加载/错误提示（可选，但建议一并处理）

当前有两处硬编码中文：

1. 第 129 行 — 消息加载中提示：
```tsx
加载消息中...
```
改为：
```tsx
{t('app.loadingMessages')}
```

2. 第 134 行 — 消息加载失败提示：
```tsx
加载失败: {messagesError}
```
改为：
```tsx
{t('app.loadFailed')}: {messagesError}
```

**注意：** 此处 `messagesError` 是动态错误文本（来自后端），不通过 i18n 翻译。

### 3.3 main.tsx 中移除冗余的语言检测调用

如果 T2 的 `detectAndSetLanguage()` 已经在 `main.tsx` 调用，则 `App.tsx` 的 `ChatLayout` 中无需再次调用。T2 的实现规范已经规定 `detectAndSetLanguage` 在 `ConfigStore` 已有语言时跳过检测。

**最终保障：** 确保 `detectAndSetLanguage()` 不产生重复写入或竞态。

## 4. 接口/契约

### 4.1 依赖的 i18n 模块接口

```typescript
// i18n/language-detector.ts
export async function detectAndSetLanguage(): Promise<void>;

// i18n/I18nProvider.tsx
export function I18nProvider(props: { children: React.ReactNode }): JSX.Element;

// i18n/useI18n.ts
export function useI18n(): I18nContextValue;

interface I18nContextValue {
  locale: 'zh-CN' | 'en';
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLanguage: (lang: 'zh-CN' | 'en') => Promise<void>;
}
```

### 4.2 使用的语言包 Key

| Key | 中文 | 英文 |
|-----|------|------|
| `app.title` | BrowserAgent | BrowserAgent |
| `app.loadingMessages` | 加载消息中... | Loading messages... |
| `app.loadFailed` | 加载失败 | Load failed |

## 5. 测试指引

### 5.1 单元测试

当前 `App.tsx` 和 `main.tsx` 已有测试覆盖吗？检查 `src/entrypoints/sidepanel/__tests__/` 目录。如有，需要：

- Mock `I18nProvider` 和 `useI18n`
- 验证 header 渲染 `t('app.title')` 的返回值而非硬编码字符串

### 5.2 手动验证

1. 清除浏览器 storage，首次打开 sidepanel → header 应显示 `"BrowserAgent"`（中文/英文取决于浏览器语言）
2. 在 Settings 面板（T9 完成后）切换语言 → header 应立即更新
3. 打开多个 sidepanel 标签页，在其中一个切换语言 → 其他标签页的 header 应同步更新

## 6. 验收标准

- [ ] `main.tsx` 在 `ReactDOM.createRoot` 之前调用了 `detectAndSetLanguage()`
- [ ] `App.tsx` 用 `I18nProvider` 包裹了 `ChatProvider`
- [ ] header 标题使用 `t('app.title')` 而非硬编码字符串
- [ ] 消息加载中/加载失败提示使用 `t('app.loadingMessages')` / `t('app.loadFailed')`
- [ ] `npx tsc --noEmit` 零错误
- [ ] 现有测试全部通过
- [ ] 手动验证：header 文本可随语言切换而变化

## 7. 注意事项

### 7.1 边界情况

| 场景 | 处理方式 |
|------|---------|
| `detectAndSetLanguage()` 执行失败 | 使用 `ConfigStore` 默认值 `'zh-CN'`，不应阻塞渲染 |
| `I18nProvider` 未正确加载语言包 | `t()` 内置 fallback 机制（T3 实现），返回 key 本身并 console.warn |
| `root` 元素不存在 | 与当前行为一致，跳过渲染 |

### 7.2 执行顺序保证

`main.tsx` 的 IIFE async 模式是关键的防御性设计：
- `detectAndSetLanguage()` 在渲染之前完成
- 避免首次渲染时 `I18nProvider` 拿到 undefined 语言导致的闪烁
- 如果 `detectAndSetLanguage` 是同步函数（如只检查 storage），await 不会产生额外延迟

### 7.3 编码规范

- 不添加 JSDoc 注释（除非必要）
- 保持现有导入顺序和代码风格
- `ErrorBoundary` 位置不变（最外层）
