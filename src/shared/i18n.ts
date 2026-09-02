/**
 * 基于浏览器扩展标准 i18n（_locales + browser.i18n）的轻量翻译工具。
 *
 * - 文案存放在 public/_locales/<lang>/messages.json，由浏览器按 UI 语言选取；
 * - 代码中的点号 key（如 `settings.tabs.appearance`）映射为 message name
 *   `settings_tabs_appearance`；
 * - 插值沿用 `{var}` 字面量占位符，由本模块替换（不依赖 Chrome placeholders）。
 */

export type Locale = 'zh-CN' | 'en';

/** 点号 key -> Chrome message name */
export function toMessageName(key: string): string {
  return key.replace(/\./g, '_');
}

/** 替换文案中的 {var} 占位符；缺少变量时保留占位符原样 */
function applyVars(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (vars[name] === undefined) {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] variable "{${name}}" not provided`);
      return `{${name}}`;
    }
    return String(vars[name]);
  });
}

/**
 * 翻译指定 key。key 缺失时返回 key 本身（与旧实现行为一致）。
 * browser.i18n.getMessage 在未命中时返回空串。
 */
export function translate(key: string, vars?: Record<string, string | number>): string {
  let raw = '';
  try {
    raw = browser.i18n.getMessage(toMessageName(key)) || '';
  } catch {
    raw = '';
  }
  if (!raw) {
    // eslint-disable-next-line no-console
    console.warn(`[i18n] key "${key}" not found`);
    return applyVars(key, vars);
  }
  return applyVars(raw, vars);
}

/** 浏览器 UI 语言归一化为受支持的 Locale（标准 i18n 跟随浏览器语言，不可运行时切换） */
export function getLocale(): Locale {
  try {
    return /^zh/i.test(browser.i18n.getUILanguage()) ? 'zh-CN' : 'en';
  } catch {
    return 'en';
  }
}
