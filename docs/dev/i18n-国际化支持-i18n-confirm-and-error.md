# 开发文档: T10 - ConfirmDialog + ErrorBoundary 国际化

**Project:** i18n-国际化支持
**Task ID:** T10
**Slug:** i18n-confirm-and-error
**Issue:** #116
**类型:** frontend
**Batch:** 3
**依赖:** T3 (I18nProvider + useI18n)

## 1. 目标

将 `ConfirmDialog` 组件的确认对话框文本（标题、表头、警告标签、按钮）和 `ErrorBoundary` 组件的错误提示文本替换为 `t()` 调用。

## 2. 前置条件

- [ ] T3 完成 — `useI18n` hook 可用
- [ ] T1 完成 — 语言包中 `dialog.*`、`error.*` 全部 key 已定义

## 3. 实现步骤

### 3.1 ConfirmDialog.tsx

**文件：** `src/entrypoints/sidepanel/components/ConfirmDialog.tsx`

#### 3.1.1 增加导入和 hook 调用

```typescript
import { useI18n } from '../i18n/useI18n';
```

在 `ConfirmDialog` 函数体顶部：
```typescript
const { t } = useI18n();
```

#### 3.1.2 替换清单

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 18 | `确认操作` | `{t('dialog.confirmTitle')}` | `dialog.confirmTitle` |
| 20 | `工具:` | `{t('dialog.tool')}:` | `dialog.tool` |
| 28 | `影响对象` | `{t('dialog.affectedObjects')}` | `dialog.affectedObjects` |
| 33 | `类型` | `{t('dialog.type')}` | `dialog.type` |
| 34 | `标题` | `{t('dialog.title')}` | `dialog.title` |
| 35 | `原因` | `{t('dialog.reason')}` | `dialog.reason` |
| 55 | `警告` | `{t('dialog.warnings')}` | `dialog.warnings` |
| 76 | `取消` | `{t('dialog.cancel')}` | `dialog.cancel` |
| 84 | `确认` | `{t('dialog.confirm')}` | `dialog.confirm` |

#### 3.1.3 完整替换代码片段

**标题区域（第 17-22 行）：**
```tsx
<h3 className="text-base font-semibold text-ink">{t('dialog.confirmTitle')}</h3>
<p className="text-sm text-mute mt-0.5">
  {t('dialog.tool')}: <code className="bg-surface-soft px-1 rounded-md">{request.toolName}</code>
</p>
```

**表头（第 31-37 行）：**
```tsx
<tr className="text-left text-mute border-b border-hairline">
  <th className="pb-1 pr-2">{t('dialog.type')}</th>
  <th className="pb-1 pr-2">{t('dialog.title')}</th>
  <th className="pb-1">{t('dialog.reason')}</th>
</tr>
```

**受影响对象区域（第 28 行）：**
```tsx
<p className="text-xs font-medium text-mute mb-1.5 uppercase tracking-wide">
  {t('dialog.affectedObjects')}
</p>
```

**警告区域（第 55 行）：**
```tsx
<p className="text-xs font-medium text-orange-600 mb-1.5 uppercase tracking-wide">
  {t('dialog.warnings')}
</p>
```

**按钮区域（第 69-86 行）：**
```tsx
<button ...>
  {t('dialog.cancel')}
</button>
<button ...>
  {t('dialog.confirm')}
</button>
```

#### 3.1.4 注意事项

- `request.toolName`、`obj.type`、`obj.title`、`obj.reason`、`w` 是用户/后端数据，不通过 i18n 翻译
- 表格行中的 `'-'` 是占位符（表示无数据），不需要国际化
- ⚠ 符号保留，不翻译

### 3.2 ErrorBoundary.tsx

**文件：** `src/entrypoints/sidepanel/ErrorBoundary.tsx`

#### 3.2.1 特殊处理：Class 组件

`ErrorBoundary` 是一个 React Class 组件，不能直接使用 `useI18n()` hook。

**解决方案：** 有两种选择：

**方案 A（推荐 — 无依赖函数调用）：**
从 i18n 模块导出一个非 hook 的函数 `getLocaleMessages(lang?)`，Class 组件直接调用。但这要求 Class 组件知道当前语言。

**方案 B（推荐 — 通过 props 传入 t 函数）：**
将 `t` 函数通过 props 传给 `ErrorBoundary`，由父组件 `App.tsx` 传入。

```tsx
// ErrorBoundary.tsx
import type { MessageSchema } from '../i18n/types';

interface Props {
  children: React.ReactNode;
  /** 翻译函数，由父组件通过 I18nProvider 提供 */
  t: (key: string, vars?: Record<string, string | number>) => string;
}
```

在 `App.tsx` 中传入：
```tsx
function AppWrapper() {
  const { t } = useI18n();
  return (
    <ErrorBoundary t={t}>
      <ChatProvider>
        <ChatLayout />
      </ChatProvider>
    </ErrorBoundary>
  );
}
```

**方案 C（最简单 — 使用静态字符串，通过全局变量）：**
在 `I18nProvider` 中将当前语言存到全局变量，ErrorBoundary 读取全局变量 import 对应 JSON。

**推荐方案 B**，最符合 React 数据流。

#### 3.2.2 Props 改造

```typescript
interface Props {
  children: React.ReactNode;
  t: (key: string, vars?: Record<string, string | number>) => string;
}
```

#### 3.2.3 替换清单

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 23 | `渲染出错` | `{this.props.t('error.renderError')}` | `error.renderError` |

#### 3.2.4 完整替换代码

```tsx
render() {
  if (this.state.hasError) {
    return (
      <div className="p-4 text-sm text-danger">
        <p className="font-semibold mb-2">{this.props.t('error.renderError')}</p>
        <pre className="whitespace-pre-wrap break-all text-xs text-mute">
          {this.state.error?.message}
        </pre>
      </div>
    );
  }
  return this.props.children;
}
```

#### 3.2.5 App.tsx 适配

在 `App.tsx` 中，`ErrorBoundary` 现在需要 `t` prop：

```tsx
export default function App() {
  return (
    <I18nProvider>
      <AppWithI18n />
    </I18nProvider>
  );
}

function AppWithI18n() {
  const { t } = useI18n();
  return (
    <ErrorBoundary t={t}>
      <ChatProvider>
        <ChatLayout />
      </ChatProvider>
    </ErrorBoundary>
  );
}
```

**注意：** 这导致 `ErrorBoundary` 和 `I18nProvider` 的嵌套顺序发生变化——`I18nProvider` 必须在 `ErrorBoundary` 外层，以便 `t` 函数可用。这与 T5 的设计文档略有不同。需要权衡：

- **外层 ErrorBoundary（原 T5 设计）：** 能捕获 I18nProvider 的错误，但 ErrorBoundary 自身无法使用 i18n
- **外层 I18nProvider（本方案）：** ErrorBoundary 能用 i18n，但 I18nProvider 初始化失败时错误无法被捕获

**折中方案：** 双层 ErrorBoundary——外层无 i18n（硬编码中文作为 fallback），内层有 i18n。
```tsx
<ErrorBoundaryFallback>      {/* 硬编码 "渲染出错" */}
  <I18nProvider>
    <ErrorBoundary t={t}>     {/* t('error.renderError') */}
      <ChatProvider>
        <ChatLayout />
      </ChatProvider>
    </ErrorBoundary>
  </I18nProvider>
</ErrorBoundaryFallback>
```

但这样增加了复杂度。**最终建议：保持原 T5 布局（ErrorBoundary 在外），ErrorBoundary 的文本暂时硬编码或用方案 C（全局变量）。**

如果选择方案 C：
```typescript
// ErrorBoundary.tsx — 改造后
import React from 'react';
import { getStaticT } from '../i18n/static-t';  // T3 需导出的辅助函数

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const t = getStaticT();  // 同步获取当前语言的 t 函数
      return (
        <div className="p-4 text-sm text-danger">
          <p className="font-semibold mb-2">{t('error.renderError')}</p>
          <pre className="whitespace-pre-wrap break-all text-xs text-mute">
            {this.state.error?.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
```

其中 `getStaticT()` 是 T3 在 `i18n/static-t.ts` 中导出的一个函数，它读取模块级变量（I18nProvider 挂载时写入），返回 `t` 函数。这种方案零侵入，不改变组件嵌套顺序。

## 4. 接口/契约

### 4.1 使用的语言包 Key

| Key | 中文 | 英文 |
|-----|------|------|
| `dialog.confirmTitle` | 确认操作 | Confirm action |
| `dialog.tool` | 工具 | Tool |
| `dialog.affectedObjects` | 影响对象 | Affected objects |
| `dialog.type` | 类型 | Type |
| `dialog.title` | 标题 | Title |
| `dialog.reason` | 原因 | Reason |
| `dialog.warnings` | 警告 | Warnings |
| `dialog.confirm` | 确认 | Confirm |
| `dialog.cancel` | 取消 | Cancel |
| `error.renderError` | 渲染出错 | Render error |

### 4.2 ErrorBoundary 改造方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| A: 函数式调用 | 无需改 props | Class 组件中获取语言状态困难 |
| B: Props 传入 t | 标准 React 数据流 | 需调整嵌套顺序 |
| C: 全局 getStaticT() | 零侵入，不改变嵌套 | 引入模块级可变状态，非纯函数 |

**推荐方案 C** 用于 ErrorBoundary。

## 5. 测试指引

### 5.1 现有测试

- `src/entrypoints/sidepanel/__tests__/ConfirmDialog.test.tsx`

需更新：
- Mock `useI18n` 返回 `{ t: (key) => key }`
- 验证"确认操作"、"工具:"、"影响对象"、"类型"、"标题"、"原因"、"警告"、"确认"、"取消"均使用 `t()` 调用

### 5.2 手动验证

**ConfirmDialog:**
1. 触发需确认的操作（高风险工具调用）→ 对话框显示
2. 中文环境：标题"确认操作"，表头"类型/标题/原因"，按钮"取消/确认"
3. 英文环境：标题"Confirm action"，表头"Type/Title/Reason"，按钮"Cancel/Confirm"

**ErrorBoundary:**
1. 刻意触发渲染错误（如修改代码抛异常）
2. 中文环境：显示"渲染出错" + 错误详情
3. 英文环境：显示"Render error" + 错误详情

## 6. 验收标准

- [ ] `ConfirmDialog` 标题"确认操作"可切换
- [ ] `ConfirmDialog` 表头"影响对象"/"类型"/"标题"/"原因"可切换
- [ ] `ConfirmDialog` 警告标签"警告"可切换
- [ ] `ConfirmDialog` 按钮"取消"/"确认"可切换
- [ ] `ErrorBoundary` 错误提示"渲染出错"可切换
- [ ] `npx tsc --noEmit` 零错误
- [ ] 现有测试全部通过

## 7. 注意事项

### 7.1 ConfirmDialog 与 common 命名空间

按钮"取消"/"确认"使用了 `dialog.cancel` / `dialog.confirm`，与 `common.cancel` / `common.confirm` 重复。如果设计文档中 `common` 命名空间已被其他组件使用，可以考虑统一用 `common.cancel` / `common.confirm`。当前代码使用 `dialog.*` 以保持语义清晰。

若需统一，改为使用 `common.cancel` / `common.confirm`。

### 7.2 ErrorBoundary 方案选择的依赖

最终方案取决于 T3 是否实现 `getStaticT()` 函数。如果 T3 未实现，ErrorBoundary 的回退方案是保留硬编码中文（改动最小），在后续迭代中再改造。

### 7.3 ⚠ 符号不要翻译

警告列表中每条警告前有 ⚠ 符号，属于视觉装饰元素，不需要国际化。
