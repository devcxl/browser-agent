import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAdapter, resetAdapter } from '../index';
import { ChromeAdapter } from '../chrome-adapter';
import { FirefoxAdapter } from '../firefox-adapter';

describe('getAdapter 工厂函数', () => {
  beforeEach(() => {
    resetAdapter();
  });

  afterEach(() => {
    resetAdapter();
  });

  it('Chrome UA 返回 ChromeAdapter 实例', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });

    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(ChromeAdapter);
    expect(adapter.browserType).toBe('chrome');
  });

  it('Firefox UA 返回 FirefoxAdapter 实例', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
      configurable: true,
    });

    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(FirefoxAdapter);
    expect(adapter.browserType).toBe('firefox');
  });

  it('Edge UA 返回 ChromeAdapter（Chromium 内核）', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      configurable: true,
    });

    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(ChromeAdapter);
  });

  it('单例模式：连续两次调用返回同一个实例', () => {
    const a = getAdapter();
    const b = getAdapter();
    expect(a).toBe(b);
  });

  it('resetAdapter 后 getAdapter 返回新实例', () => {
    const a = getAdapter();
    resetAdapter();
    const b = getAdapter();
    expect(a).not.toBe(b);
  });
});
