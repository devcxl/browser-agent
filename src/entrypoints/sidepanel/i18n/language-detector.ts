import { ConfigStore } from '@/shared/storage';

/** 根据浏览器语言匹配支持的 locale */
export function detectLanguage(): 'zh-CN' | 'en' {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('zh')) return 'zh-CN';
  if (lang.startsWith('en')) return 'en';
  return 'zh-CN';
}

/**
 * 首次启动时检测并设置语言。
 * 如果已有偏好则跳过，不覆盖用户选择。
 *
 * 注意：直接用 browser.storage.local 检查是否已有存储值，
 * 避免 ConfigStore 返回默认值 `'zh-CN'`（truthy）导致检测被跳过。
 */
export async function detectAndSetLanguage(): Promise<void> {
  // 直接用 raw storage 检查是否已有存储值（避免 ConfigStore 默认值干扰）
  const raw = await browser.storage.local.get('preferences');
  if (raw.preferences?.language) return;

  const store = ConfigStore.getInstance();
  const language = detectLanguage();
  const prefs = await store.get('preferences');
  await store.set('preferences', { ...prefs, language });
}
