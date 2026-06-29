# 开发文档: T2 - 实现首次语言检测逻辑

**Project:** i18n-国际化支持
**Task ID:** T2
**Slug:** implement-language-detector
**Issue:** #109
**类型:** frontend
**Batch:** 2
**依赖:** T1 (create-i18n-types-and-locales #106)

## 1. 目标

实现 `detectAndSetLanguage()` 函数，在浏览器插件首次启动时自动检测用户浏览器语言并写入 `ConfigStore.preferences.language`，后续启动跳过检测。

## 2. 前置条件

- 已完成 T1：`i18n/types.ts`（`Locale` 类型）、`locales/zh-CN.json`、`locales/en.json`
- 了解 `ConfigStore` API：`get('preferences')` → `UserPreferences`，`set('preferences', {..., language})` → 持久化
- 了解 `UserPreferences.language` 类型为 `'zh-CN' | 'en'`
- 了解 `ConfigStore.DEFAULTS.preferences.language` 默认为 `'zh-CN'`

## 3. 实现步骤

### 3.1 创建 `i18n/language-detector.ts`

- **文件：** `src/entrypoints/sidepanel/i18n/language-detector.ts`

关键逻辑：

```typescript
import { ConfigStore } from '@/shared/storage';
import type { Locale } from './types';

/**
 * 首次语言检测：检查 ConfigStore 中是否已有语言偏好，
 * 如果没有，则根据 navigator.language 自动匹配并写入。
 * 
 * 应在 main.tsx 渲染前同步调用，避免首次渲染语言闪烁。
 */
export async function detectAndSetLanguage(): Promise<void> {
  const store = ConfigStore.getInstance();
  const preferences = await store.get<{ language: Locale }>('preferences');
  
  // 已有偏好则跳过
  if (preferences && preferences.language) {
    return;
  }
  
  const detected = detectLanguage();
  await store.set('preferences', {
    ...(preferences || { theme: 'system', sidebarExpanded: true }),
    language: detected,
  });
}

/** 从 navigator.language 匹配支持的语言 */
function detectLanguage(): Locale {
  if (typeof navigator === 'undefined') return 'zh-CN';
  
  const lang = navigator.language || '';
  
  // zh-* → zh-CN
  if (lang.toLowerCase().startsWith('zh')) {
    return 'zh-CN';
  }
  
  // en-* → en
  if (lang.toLowerCase().startsWith('en')) {
    return 'en';
  }
  
  // 其他语言默认回退到 zh-CN
  return 'zh-CN';
}
```

**匹配规则：**
| navigator.language | 结果 |
|---|---|
| `'zh-CN'` | `'zh-CN'` |
| `'zh'` | `'zh-CN'` |
| `'zh-TW'` | `'zh-CN'` |
| `'zh-HK'` | `'zh-CN'` |
| `'en'` | `'en'` |
| `'en-US'` | `'en'` |
| `'en-GB'` | `'en'` |
| `'ja'`, `'ko'`, `'fr'` 等 | `'zh-CN'`（回退） |
| 空字符串/undefined | `'zh-CN'`（回退） |

### 3.2 在 `main.tsx` 渲染前调用

- **文件：** `src/entrypoints/sidepanel/main.tsx`

在 `createRoot` 之前插入异步调用：

```typescript
import { detectAndSetLanguage } from './i18n/language-detector';

// 在渲染前同步等待语言检测完成
(async () => {
  await detectAndSetLanguage();
  
  // ... 原有的 createRoot 代码 ...
})();
```

**关键点：**
- 必须在 `ReactDOM.createRoot` 之前 `await detectAndSetLanguage()`
- 这样 I18nProvider 初始化时能从 ConfigStore 读取到正确的 language 值
- 由于是首次启动时执行，此 async 开销极小（几十毫秒），不会影响用户体验

## 4. 接口/契约

### 4.1 新增接口

| 导出 | 类型 | 描述 |
|---|---|---|
| `detectAndSetLanguage()` | `() => Promise<void>` | 检测语言并持久化（如有必要） |

### 4.2 数据模型变更

无 Schema 变更。利用已有 `UserPreferences.language` 字段。

## 5. 测试指引

### 5.1 单元测试

- **场景 1：已有偏好则跳过**
  - 前置：ConfigStore 中 `preferences.language = 'en'`
  - 调用 `detectAndSetLanguage()`
  - 预期结果：`preferences.language` 保持 `'en'`，不覆盖

- **场景 2：无偏好 + 浏览器语言 zh-CN**
  - 前置：ConfigStore 中无 `preferences` 或 `preferences.language` 为 undefined；`navigator.language` 为 `'zh-CN'`
  - 预期结果：`preferences.language` 被设为 `'zh-CN'`

- **场景 3：无偏好 + 浏览器语言 en**
  - 前置：`navigator.language` 为 `'en'`
  - 预期结果：`preferences.language` 被设为 `'en'`

- **场景 4：无偏好 + 浏览器语言 en-US**
  - 前置：`navigator.language` 为 `'en-US'`
  - 预期结果：`preferences.language` 被设为 `'en'`

- **场景 5：无偏好 + 浏览器语言 zh-TW**
  - 前置：`navigator.language` 为 `'zh-TW'`
  - 预期结果：`preferences.language` 被设为 `'zh-CN'`

- **场景 6：无偏好 + 不支持的语言（如 ja）**
  - 前置：`navigator.language` 为 `'ja'`
  - 预期结果：回退到 `'zh-CN'`

- **场景 7：服务端（无 navigator）**
  - 前置：`typeof navigator === 'undefined'`
  - 预期结果：回退到 `'zh-CN'`

### 5.2 集成测试

- 清理浏览器 storage.local，首次打开 sidepanel
- 预期结果：语言根据浏览器设置正确显示（中文浏览器 → 中文界面，英文浏览器 → 英文界面）
- 第二次打开 sidepanel
- 预期结果：语言保持首次检测结果，不再重新检测

## 6. 验收标准

- [ ] 首次启动（无偏好记录）时自动检测浏览器语言并写入 ConfigStore
- [ ] 浏览器语言为 `zh-CN` / `zh` / `zh-TW` 时设置为 `'zh-CN'`
- [ ] 浏览器语言为 `en` / `en-US` / `en-GB` 时设置为 `'en'`
- [ ] 其他语言默认回退到 `'zh-CN'`
- [ ] `navigator` 不存在时（SSR 场景）回退到 `'zh-CN'`，不崩溃
- [ ] 已有偏好时跳过检测（不覆盖用户手动选择）
- [ ] 检测结果正确持久化到 ConfigStore（即可被 I18nProvider 读取）
- [ ] `detectAndSetLanguage()` 在 `main.tsx` 渲染前完成（无语言闪烁）

## 7. 注意事项

- **时序问题**：`detectAndSetLanguage()` 必须在 `main.tsx` 中 `createRoot` 之前 `await` 完成。否则 I18nProvider 首次渲染时可能读取不到语言设置。
- **ConfigStore.get 返回默认值**：`ConfigStore.get('preferences')` 在无数据时会返回 `DEFAULTS.preferences`（其中 `language: 'zh-CN'`）。因此需要用 `preferences && preferences.language` 判断而非 `!preferences.language`。实际上，由于默认值已有 `language: 'zh-CN'`，`get` 总是返回带 language 的对象。**关键判断逻辑**：需要区分"用户从未设置过"和"用户显式设置了 zh-CN"。解决方案是直接用 `browser.storage.local.get('preferences')` 而非 `store.get()` 来判断是否已有持久化值，或者修改 `detectLanguage` 逻辑。
  
  **推荐方案**：直接使用 `browser.storage.local.get('preferences')` 检查原始存储是否有数据：
  ```typescript
  const result = await browser.storage.local.get('preferences');
  if (result.preferences?.language) return; // 已有持久化值，跳过
  ```
  然后用 `store.get('preferences')` 获取完整的默认值对象，只修改 `language` 字段后再 `store.set()` 写回。

- **跨标签页同步**：语言检测只在首次启动时执行一次，无需考虑跨标签页同步。后续语言切换通过 `setLanguage()` 触发（T3）。
- **测试中 mock navigator**：单元测试中需要 mock `navigator.language`，可使用 `Object.defineProperty(navigator, 'language', { value: 'en', configurable: true })`。
