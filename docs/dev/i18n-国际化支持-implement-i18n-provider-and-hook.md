# 开发文档: T3 - 实现 I18nProvider + useI18n hook

**Project:** i18n-国际化支持
**Task ID:** T3
**Slug:** implement-i18n-provider-and-hook
**Issue:** #108
**类型:** frontend
**Batch:** 2
**依赖:** T1 (create-i18n-types-and-locales #106)

## 1. 目标

实现核心 i18n 基础设施：React Context Provider（`I18nProvider`）+ `useI18n` hook + `t()` 翻译函数，提供 `{ locale, t, setLanguage }` context 供所有组件消费。

## 2. 前置条件

- 已完成 T1：`i18n/types.ts`（`Locale`、`MessageSchema`、`I18nContextValue`）、`locales/zh-CN.json`、`locales/en.json`
- 了解 `ConfigStore` API：`get('preferences')`、`set('preferences', ...)`、`onChange()`
- 了解 React Context 创建和使用模式

## 3. 实现步骤

### 3.1 实现 `I18nProvider.tsx`

- **文件：** `src/entrypoints/sidepanel/i18n/I18nProvider.tsx`

关键逻辑：

```typescript
import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Locale, MessageSchema, I18nContextValue } from './types';
import { ConfigStore } from '@/shared/storage';
import zhCN from '../locales/zh-CN.json';
import en from '../locales/en.json';

// 创建 Context（不导出给外部直接使用）
export const I18nContext = createContext<I18nContextValue | null>(null);

const store = ConfigStore.getInstance();

/** 按语言静态加载语言包 */
function getMessages(locale: Locale): MessageSchema {
  return locale === 'en' ? (en as MessageSchema) : (zhCN as MessageSchema);
}

/** 点分隔路径取值 + 模板变量替换 */
function resolveMessage(
  messages: MessageSchema,
  key: string,
  vars?: Record<string, string | number>
): string {
  const parts = key.split('.');
  let value: unknown = messages;
  
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      console.warn(`[i18n] Missing translation key: "${key}"`);
      return key;
    }
  }
  
  if (typeof value !== 'string') {
    console.warn(`[i18n] Translation key "${key}" is not a string:`, value);
    return key;
  }
  
  return applyVariables(value, vars);
}

/** 替换模板变量 {{varName}} */
function applyVariables(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
    if (varName in vars) return String(vars[varName]);
    console.warn(`[i18n] Missing variable "${varName}" in template: "${template}"`);
    return `{{${varName}}}`;
  });
}

interface I18nProviderProps {
  children: React.ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocale] = useState<Locale>('zh-CN');

  // 初始化：从 ConfigStore 读取语言
  useEffect(() => {
    (async () => {
      const prefs = await store.get<{ language: Locale }>('preferences');
      if (prefs?.language) {
        setLocale(prefs.language);
      }
    })();
  }, []);

  // 监听跨标签页语言变更
  useEffect(() => {
    const unsubscribe = store.onChange((changes) => {
      if (changes.preferences) {
        const prefs = changes.preferences as { language?: Locale };
        if (prefs.language) {
          setLocale(prefs.language);
        }
      }
    });
    return unsubscribe;
  }, []);

  const messages = useMemo(() => getMessages(locale), [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      return resolveMessage(messages, key, vars);
    },
    [messages],
  );

  const setLanguage = useCallback(async (lang: Locale) => {
    const prefs = await store.get<{ language?: Locale; theme?: string; sidebarExpanded?: boolean }>('preferences');
    await store.set('preferences', { ...prefs, language: lang });
    // setLocale 会在 store.onChange 中自动触发，无需手动调用
    // 但为了即时性，在这里也更新本地状态
    setLocale(lang);
  }, []);

  const contextValue = useMemo<I18nContextValue>(
    () => ({ locale, t, setLanguage }),
    [locale, t, setLanguage],
  );

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  );
}
```

### 3.2 实现 `useI18n.ts`

- **文件：** `src/entrypoints/sidepanel/i18n/useI18n.ts`

关键逻辑：

```typescript
import { useContext } from 'react';
import { I18nContext } from './I18nProvider';
import type { I18nContextValue } from './types';

/** 
 * 获取 i18n context。
 * 必须在 I18nProvider 内使用，否则抛出错误。
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error(
      'useI18n() must be used within an <I18nProvider>. ' +
      'Wrap your component tree with <I18nProvider>.'
    );
  }
  return ctx;
}
```

### 3.3 核心实现细节

#### 3.3.1 `resolveMessage` — 路径解析

- 支持深层嵌套：`t('settings.provider.placeholder.name')` → 逐层访问 `messages.settings.provider.placeholder.name`
- Key 不存在时：`console.warn` 并返回 key 字符串本身（不崩溃，方便调试缺失翻译）
- 路径值类型非 string 时：同样 `console.warn` 并返回 key

#### 3.3.2 `applyVariables` — 模板变量替换

- 语法：`{{varName}}` 双大括号
- 示例：`t('settings.skills.syncComplete', { count: 5 })` → `"同步完成，共 5 个技能"`
- 变量不存在时：`console.warn` 并保留原始占位符 `{{varName}}`，不崩溃

#### 3.3.3 `setLanguage` — 语言切换

- 更新 `ConfigStore.set('preferences', {..., language})` 持久化
- 同时调用 `setLocale(lang)` 更新本地状态（即时切换）
- `ConfigStore.onChange` 也会触发 `setLocale`（处理跨标签页同步 + 重复调用的幂等性由 React 保证）

#### 3.3.4 语言包加载

- 通过静态 `import` 加载 JSON 文件，构建时由 Vite 内联处理
- `getMessages(locale)` 按需返回对应语言包
- 两个语言包都在构建时打包，无需运行时 fetch
- 语言切换时 `messages` 对象通过 `useMemo` 重新计算，触发所有消费者重渲染

## 4. 接口/契约

### 4.1 导出接口

| 模块 | 导出 | 类型 | 描述 |
|---|---|---|---|
| `i18n/I18nProvider.tsx` | `I18nProvider` | `React.FC<{ children: ReactNode }>` | Context Provider |
| `i18n/I18nProvider.tsx` | `I18nContext` | `React.Context<I18nContextValue \| null>` | Context 对象（供 useI18n 内部使用） |
| `i18n/useI18n.ts` | `useI18n` | `() => I18nContextValue` | Hook |

### 4.2 I18nContextValue 接口

```typescript
export interface I18nContextValue {
  locale: Locale;                                                    // 当前语言
  t: (key: string, vars?: Record<string, string | number>) => string; // 翻译函数
  setLanguage: (lang: Locale) => Promise<void>;                      // 切换语言
}
```

### 4.3 数据模型变更

无。

## 5. 测试指引

### 5.1 单元测试 — `t()` 函数

- **场景 1：简单 key 翻译**
  - `t('common.send')` → `"发送"`（zh-CN） / `"Send"`（en）
- **场景 2：深层嵌套 key**
  - `t('chat.input.placeholder')` → 正确返回对应文本
- **场景 3：模板变量**
  - `t('settings.skills.skillsCount', { count: 3 })` → `"3 个技能"`
- **场景 4：key 不存在**
  - `t('non.existent.key')` → 返回 `"non.existent.key"`，不崩溃，console.warn 有输出
- **场景 5：key 路径指向非字符串值**
  - `t('chat.input')`（这是一个对象） → 返回 `"chat.input"`，console.warn 有输出
- **场景 6：模板变量缺失**
  - `t('settings.skills.syncComplete')`（不传 `{ count }`） → `"同步完成，共 {{count}} 个技能"`，console.warn 有输出

### 5.2 单元测试 — `useI18n` hook

- **场景 7：在 Provider 内调用**
  - 渲染被 I18nProvider 包裹的测试组件 → `useI18n()` 返回有效的 context 值
- **场景 8：在 Provider 外调用**
  - 渲染未被 I18nProvider 包裹的测试组件 → 抛出 Error，消息包含 `"must be used within an <I18nProvider>"`

### 5.3 集成测试 — 语言切换

- **场景 9：调用 setLanguage('en')**
  - 所有使用 `t()` 的组件文本变为英文
  - ConfigStore 中 `preferences.language` 更新为 `'en'`
- **场景 10：跨标签页同步**
  - 在标签页 A 切换到英文，标签页 B 中的 I18nProvider 通过 store.onChange 自动更新为英文

### 5.4 编译检查

- 运行 `npx tsc --noEmit` 确保类型正确
- 语言包 JSON import 的类型与 `MessageSchema` 兼容

## 6. 验收标准

- [ ] `I18nProvider` 正确包裹子组件并提供 context（`{ locale, t, setLanguage }`）
- [ ] `t()` 支持点分隔路径解析（如 `t('sidebar.status.running')`）
- [ ] `t()` 支持模板变量替换（如 `t('token.total', { total: 100 })`）
- [ ] `t()` key 不存在时打印 warning 并返回 key 字符串（不崩溃）
- [ ] `setLanguage('en')` 更新 ConfigStore 并触发子树重渲染
- [ ] ConfigStore.onChange 触发语言自动更新（跨标签页同步）
- [ ] `useI18n()` 在 Provider 外调用时抛出明确错误
- [ ] 语言包通过静态 import 加载，无运行时 fetch 请求
- [ ] `npx tsc --noEmit` 无类型错误
- [ ] Provider 初始化时正确从 ConfigStore 读取已有语言设置

## 7. 注意事项

- **Context 分离原则**：`I18nContext` 不应被外部组件直接 `useContext(I18nContext)`，只通过 `useI18n()` hook 访问。这样可以集中处理"在 Provider 外使用"的错误提示。
- **静态 Import vs 动态 Import**：设计文档明确要求静态 import。两个语言包都在构建时打包，虽然包体积增加约 8KB（gzip 前），但满足 PRD 要求的 < 5KB gzip 后限制，且无运行时延迟。
- **`setLocale` 重复调用**：`setLanguage()` 中手动调用 `setLocale(lang)` 同时 store.onChange 也会触发 `setLocale`。由于 React 的批量更新机制，组件不会因重复 setState 而多次渲染（同一个值）。
- **性能考虑**：
  - `t()` 函数用 `useCallback` 包裹，依赖 `messages`（仅在语言切换时变化）
  - `contextValue` 用 `useMemo` 包裹
  - 翻译查找是简单的属性访问 + 正则替换，性能开销可忽略（< 0.1ms）
- **JSON import 的 TypeScript 类型**：需要确保 `tsconfig.json` 中 `resolveJsonModule: true`（通常默认开启），否则 `import zhCN from '../locales/zh-CN.json'` 会报类型错误。
- **标记外部消费接口**：虽然 `I18nContext` 被导出，但应在注释中标记 `@internal`，外部只使用 `useI18n` 和 `I18nProvider`。
