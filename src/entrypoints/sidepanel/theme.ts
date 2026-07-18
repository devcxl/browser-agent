import type { UserPreferences } from '@/shared/types';

/**
 * 应用主题到文档根元素。
 * - light：强制亮色（.light 类，屏蔽系统暗色媒体查询）
 * - dark：强制暗色（.dark 类，直接覆盖 token）
 * - system：不施加类，由 prefers-color-scheme 决定
 */
export function applyTheme(theme: UserPreferences['theme']): void {
  const el = document.documentElement;
  el.classList.toggle('dark', theme === 'dark');
  el.classList.toggle('light', theme === 'light');
}
