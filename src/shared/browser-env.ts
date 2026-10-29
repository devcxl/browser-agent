/**
 * 浏览器运行环境采集：只取不易变的低敏属性，供 system prompt 识别环境。
 * 均为浏览器进程级信息，不含页面内容与用户行为数据。
 */
import type { BrowserEnv } from './types';

export async function collectBrowserEnv(): Promise<BrowserEnv> {
  const [uiLanguage, platform] = await Promise.all([
    (async () => {
      try {
        return await browser.i18n.getUILanguage();
      } catch {
        return navigator.language;
      }
    })(),
    (async () => {
      try {
        // chrome 类型缺 getPlatformInfo 声明，走标准 WebExtension API
        const info = await (browser.runtime as unknown as {
          getPlatformInfo?: () => Promise<{ os: string; arch: string }>;
        }).getPlatformInfo?.();
        if (!info) return navigator.platform || 'unknown';
        const os = info.os.charAt(0).toUpperCase() + info.os.slice(1);
        return `${os} ${info.arch}`;
      } catch {
        return navigator.platform || 'unknown';
      }
    })(),
  ]);

  const ua = navigator.userAgent;
  const browserName = ua.includes('Firefox')
    ? 'Firefox'
    : ua.includes('Edg/')
      ? 'Edge'
      : 'Chrome';
  const versionMatch = ua.match(/(?:Firefox|Edg|Chrome)\/(\d+[^\s)]*)/);

  return {
    browser: `${browserName} ${versionMatch?.[1] ?? ''}`.trim(),
    uiLanguage,
    language: navigator.languages?.[0] ?? navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform,
  };
}
