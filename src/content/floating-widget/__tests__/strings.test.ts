import { describe, it, expect } from 'vitest';
import { getStrings } from '../strings';

describe('getStrings', () => {
  it('lang="zh-CN" 返回中文文案', () => {
    const s = getStrings('zh-CN');
    expect(s.buttonAriaLabel).toBeTruthy();
    expect(s.hideOnThisSite).toBe('在此站点隐藏');
    expect(s.closePanel).toBe('关闭面板');
    expect(s.loadError).toBeTruthy();
  });

  it('lang="en" 返回英文文案', () => {
    const s = getStrings('en');
    expect(s.buttonAriaLabel).toBeTruthy();
    expect(s.hideOnThisSite).toBe('Hide on this site');
    expect(s.closePanel).toBe('Close panel');
    expect(s.loadError).toBeTruthy();
  });

  it('两种语言都返回满足 FloatingWidgetStrings 接口的对象', () => {
    const zh = getStrings('zh-CN');
    const en = getStrings('en');

    // 结构一致性：两语言键名相同
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    expect(zhKeys).toEqual(enKeys);

    // 所有值都是非空字符串
    for (const key of zhKeys) {
      expect(typeof (zh as Record<string, unknown>)[key]).toBe('string');
      expect(((zh as Record<string, unknown>)[key] as string).length).toBeGreaterThan(0);
      expect(typeof (en as Record<string, unknown>)[key]).toBe('string');
      expect(((en as Record<string, unknown>)[key] as string).length).toBeGreaterThan(0);
    }
  });

  it('返回的是字面量对象，每次调用返回新引用', () => {
    const a = getStrings('zh-CN');
    const b = getStrings('zh-CN');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
