import { describe, it, expect } from 'vitest';
import { isBlacklisted, addToBlacklist, shouldMount } from '../blacklist';
import type { FloatingButtonSettings } from '../blacklist';

describe('isBlacklisted', () => {
  it('精确匹配：host 与 blacklist 中某一项完全一致，返回 true', () => {
    const blacklist = ['example.com'];
    expect(isBlacklisted(blacklist, 'example.com')).toBe(true);
  });

  it('精确匹配：大小写不敏感', () => {
    const blacklist = ['example.com'];
    expect(isBlacklisted(blacklist, 'EXAMPLE.COM')).toBe(true);
    expect(isBlacklisted(blacklist, 'Example.Com')).toBe(true);
  });

  it('子域名后缀匹配：sub.example.com 匹配 .example.com', () => {
    const blacklist = ['example.com'];
    expect(isBlacklisted(blacklist, 'sub.example.com')).toBe(true);
    expect(isBlacklisted(blacklist, 'deep.sub.example.com')).toBe(true);
  });

  it('blacklist 中带点前缀时也能精确匹配', () => {
    const blacklist = ['example.com', 'test.org'];
    // 'ample.com' 不以 '.example.com' 结尾，也不是精确匹配
    expect(isBlacklisted(blacklist, 'ample.com')).toBe(false);
  });

  it('避免部分字符串匹配：myexample.com 不匹配 example.com', () => {
    const blacklist = ['example.com'];
    expect(isBlacklisted(blacklist, 'myexample.com')).toBe(false);
  });

  it('当 blacklist 为空时，返回 false', () => {
    expect(isBlacklisted([], 'example.com')).toBe(false);
  });

  it('当 host 不在 blacklist 中时，返回 false', () => {
    const blacklist = ['blocked.com', 'evil.org'];
    expect(isBlacklisted(blacklist, 'safe.com')).toBe(false);
    expect(isBlacklisted(blacklist, 'example.com')).toBe(false);
  });

  it('多个 blacklist 条目时正确匹配', () => {
    const blacklist = ['blocked.com', 'evil.org', 'spam.net'];
    expect(isBlacklisted(blacklist, 'blocked.com')).toBe(true);
    expect(isBlacklisted(blacklist, 'sub.evil.org')).toBe(true);
    expect(isBlacklisted(blacklist, 'spam.net')).toBe(true);
    expect(isBlacklisted(blacklist, 'safe.com')).toBe(false);
  });

  it('blacklist 中的条目自身的子域名也仅精确匹配自己', () => {
    const blacklist = ['sub.example.com'];
    // 'example.com' 既不是精确匹配，也不是 'sub.example.com' 的子域名
    expect(isBlacklisted(blacklist, 'example.com')).toBe(false);
    // 'sub.example.com' 是精确匹配
    expect(isBlacklisted(blacklist, 'sub.example.com')).toBe(true);
    // 'deep.sub.example.com' 是子域名
    expect(isBlacklisted(blacklist, 'deep.sub.example.com')).toBe(true);
  });
});

describe('addToBlacklist', () => {
  it('添加新 host 到空 blacklist', () => {
    expect(addToBlacklist([], 'example.com')).toEqual(['example.com']);
  });

  it('不重复添加已存在的 host（大小写不敏感去重）', () => {
    expect(addToBlacklist(['example.com'], 'EXAMPLE.COM')).toEqual(['example.com']);
    expect(addToBlacklist(['Example.Com'], 'example.com')).toEqual(['Example.Com']);
  });

  it('添加新 host 到已有列表，返回新数组', () => {
    const original = ['blocked.com'];
    const result = addToBlacklist(original, 'evil.org');
    expect(result).toEqual(['blocked.com', 'evil.org']);
    // 不修改原数组
    expect(original).toEqual(['blocked.com']);
  });

  it('返回全新数组（不可变性）', () => {
    const original = ['blocked.com'];
    const result = addToBlacklist(original, 'blocked.com');
    expect(result).not.toBe(original);
  });
});

describe('shouldMount', () => {
  it('当 enabled 为 true 且 host 不在黑名单中时，返回 true', () => {
    const settings: FloatingButtonSettings = {
      blacklist: ['blocked.com'],
      enabled: true,
    };
    expect(shouldMount(settings, 'safe.com')).toBe(true);
  });

  it('当 enabled 为 false 时，无论黑名单如何都返回 false', () => {
    const settings: FloatingButtonSettings = {
      blacklist: [],
      enabled: false,
    };
    expect(shouldMount(settings, 'safe.com')).toBe(false);
  });

  it('当 host 在黑名单中时，返回 false', () => {
    const settings: FloatingButtonSettings = {
      blacklist: ['blocked.com'],
      enabled: true,
    };
    expect(shouldMount(settings, 'blocked.com')).toBe(false);
  });

  it('当 enabled 为 false 且 host 在黑名单中，返回 false', () => {
    const settings: FloatingButtonSettings = {
      blacklist: ['blocked.com'],
      enabled: false,
    };
    expect(shouldMount(settings, 'blocked.com')).toBe(false);
  });
});
