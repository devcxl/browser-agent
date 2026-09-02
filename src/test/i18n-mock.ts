import zhCN from '../../public/_locales/zh_CN/messages.json';
import en from '../../public/_locales/en/messages.json';

function extract(mod: Record<string, { message: string }>): Record<string, string> {
  return Object.fromEntries(Object.entries(mod).map(([k, v]) => [k, v.message]));
}

/** 从 messages.json 提取的 zh-CN 文案表（message name -> 文案） */
export const zhMessages: Record<string, string> = extract(zhCN);
/** 从 messages.json 提取的 en 文案表（message name -> 文案） */
export const enMessages: Record<string, string> = extract(en);

/**
 * 构造 browser.i18n mock（供 vitest 全局 setup 与 mockBrowserStorage 使用）。
 * 与浏览器一致：按 getUILanguage 对应的语言表返回文案，未命中返回空串。
 */
export function createI18nMock(uiLanguage = 'zh-CN') {
  const table = /^zh/i.test(uiLanguage) ? zhMessages : enMessages;
  return {
    getMessage: (messageName: string): string => table[messageName] ?? '',
    getUILanguage: (): string => uiLanguage,
  };
}
