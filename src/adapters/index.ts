import type { IBrowserAdapter } from './types';
import { ChromeAdapter } from './chrome-adapter';
import { FirefoxAdapter } from './firefox-adapter';

export type { IBrowserAdapter } from './types';
export { BrowserEvent } from './types';
export { ChromeAdapter } from './chrome-adapter';
export { FirefoxAdapter } from './firefox-adapter';

/**
 * 根据 userAgent 自动选择浏览器适配器
 * 单例模式：同一运行时只创建一个实例
 */
let _adapter: IBrowserAdapter | null = null;

export function getAdapter(): IBrowserAdapter {
  if (_adapter) return _adapter;

  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes('firefox')) {
    _adapter = new FirefoxAdapter();
  } else {
    // Chrome / Edge / Opera / Brave 等都使用 Chromium 内核
    _adapter = new ChromeAdapter();
  }

  return _adapter;
}

/**
 * 重置适配器（仅用于测试）
 */
export function resetAdapter(): void {
  _adapter = null;
}
