import { translate, getLocale, type Locale } from '@/shared/i18n';

export type { Locale };

/**
 * 标准 i18n（_locales + browser.i18n）的 React 接入点。
 *
 * 语言跟随浏览器 UI 语言，浏览器标准行为，无 Provider、无运行时切换。
 * 保留与旧实现一致的 `{ t, locale }` 返回结构，组件调用方式不变。
 */
export function useI18n(): { locale: Locale; t: (key: string, vars?: Record<string, string | number>) => string } {
  return { locale: getLocale(), t: translate };
}
