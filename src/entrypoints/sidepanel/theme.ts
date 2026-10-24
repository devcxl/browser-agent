import type { UserPreferences } from '@/shared/types';
import {
  DEFAULT_ACCENT_COLOR,
  deriveAccentPalette,
  normalizeAccentColor,
  type AccentTheme,
} from '@/shared/accent-palette';

/** 当前实际生效的明暗（system 解析后的结果） */
export function resolveEffectiveTheme(theme: UserPreferences['theme']): AccentTheme {
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';

  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  } catch {
    // jsdom / 受限宿主没有 matchMedia：按浅色处理
  }
  return 'light';
}

/** 最近一次应用的外观，供系统主题变化时按原主色重新派生 */
let activeAppearance: { theme: UserPreferences['theme']; accentColor: string } | null = null;
let systemListenerWired = false;

/**
 * 应用主题到文档根元素。
 * - light：强制亮色（.light 类，屏蔽系统暗色媒体查询）
 * - dark：强制暗色（.dark 类，直接覆盖 token）
 * - system：不施加类，由 prefers-color-scheme 决定
 *
 * 同时把主色派生值写入 CSS 变量；`theme === 'system'` 时按当前系统明暗取色，
 * 并在系统主题变化时自动重算。
 */
export function applyTheme(
  theme: UserPreferences['theme'],
  accentColor: string = DEFAULT_ACCENT_COLOR,
): void {
  const el = document.documentElement;
  el.classList.toggle('dark', theme === 'dark');
  el.classList.toggle('light', theme === 'light');

  const normalized = normalizeAccentColor(accentColor);
  const palette = deriveAccentPalette(normalized, resolveEffectiveTheme(theme));
  el.style.setProperty('--accent', palette.accent);
  el.style.setProperty('--accent-hover', palette.accentHover);
  el.style.setProperty('--accent-soft', palette.accentSoft);
  el.style.setProperty('--on-accent', palette.onAccent);

  activeAppearance = { theme, accentColor: normalized };
  wireSystemThemeListener();
}

/** 只在首次应用时挂一次系统主题监听，避免重复订阅 */
function wireSystemThemeListener(): void {
  if (systemListenerWired) return;
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    if (typeof query.addEventListener !== 'function') return;

    systemListenerWired = true;
    query.addEventListener('change', () => {
      if (activeAppearance?.theme === 'system') {
        applyTheme(activeAppearance.theme, activeAppearance.accentColor);
      }
    });
  } catch {
    // 无 matchMedia 的宿主：跳过监听
  }
}
