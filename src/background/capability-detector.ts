import type { IBrowserAdapter } from '@/adapters/types';
import type { Capabilities } from '@/shared/types';

/**
 * 浏览器能力检测器
 *
 * 检测当前浏览器可用的扩展 API 能力，覆盖 22 个能力域。
 * 检测结果缓存，扩展生命周期内不改变。
 */
export class CapabilityDetector {
  private cache: Capabilities | null = null;

  constructor(private adapter: IBrowserAdapter) {}

  /**
   * 检测当前浏览器所有扩展 API 能力。
   * 结果缓存，后续调用直接返回缓存。
   * 需强制刷新时先调用 invalidateCache()。
   */
  detect(): Capabilities {
    if (this.cache) return { ...this.cache };

    const isChrome = this.adapter.browserType === 'chrome';

    this.cache = {
      // 核心能力 — 双浏览器必备
      tabs: true,
      windows: true,
      tabGroups: this.checkApi('tabGroups'),
      bookmarks: true,
      history: true,
      downloads: true,
      cookies: true,
      // 运行时检测
      sessions: this.checkApi('sessions'),
      scripting: this.checkApi('scripting'),
      clipboard: isChrome,
      notifications: this.checkApi('notifications'),
      contextMenus: this.checkApi('contextMenus'),
      sidePanel: isChrome,
      alarms: this.checkApi('alarms'),
      // Expert 能力
      proxy: this.checkApi('proxy'),
      privacy: this.checkApi('privacy'),
      management: this.checkApi('management'),
      debugger: this.checkApi('debugger'),
      webRequest: this.checkApi('webRequest'),
      declarativeNetRequest: this.checkApi('declarativeNetRequest'),
      nativeMessaging:
        this.checkApi('runtime') &&
        typeof (browser as any).runtime?.connectNative !== 'undefined',
      identity: this.checkApi('identity'),
    };

    return { ...this.cache };
  }

  /** 清除缓存，下次 detect() 重新检测 */
  invalidateCache(): void {
    this.cache = null;
  }

  /** 检查全局 browser 对象上是否存在某 API 命名空间 */
  private checkApi(namespace: string): boolean {
    return typeof (browser as any)?.[namespace] !== 'undefined';
  }
}
