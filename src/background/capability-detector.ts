import type { IBrowserAdapter } from '@/adapters/types';
import type { Capabilities } from '@/shared/types';

/**
 * 浏览器能力检测器
 *
 * 检测当前浏览器支持哪些扩展 API。
 */
export class CapabilityDetector {
  constructor(private adapter: IBrowserAdapter) {}

  async detect(): Promise<Capabilities> {
    const isChrome = this.adapter.browserType === 'chrome';

    return {
      tabs: true,
      windows: true,
      tabGroups: isChrome,
      bookmarks: isChrome && !!chrome.bookmarks,
      history: isChrome && !!chrome.history,
      downloads: isChrome && !!chrome.downloads,
      cookies: isChrome && !!chrome.cookies,
      sessions: isChrome && !!chrome.sessions,
      scripting: isChrome && !!chrome.scripting,
      clipboard: isChrome && !!(chrome as any).clipboard,
      notifications: !!browser.notifications,
      contextMenus: !!browser.contextMenus,
      sidePanel: isChrome && !!chrome.sidePanel,
      alarms: !!browser.alarms,
      proxy: isChrome && !!chrome.proxy,
      privacy: isChrome && !!chrome.privacy,
      management: isChrome && !!chrome.management,
      debugger: isChrome && !!chrome.debugger,
      webRequest: !!browser.webRequest,
      declarativeNetRequest: isChrome && !!chrome.declarativeNetRequest,
      nativeMessaging: !!(browser.runtime as any)?.connectNative,
      identity: isChrome && !!chrome.identity,
    };
  }
}
