import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../token-estimate';

describe('estimateTokens', () => {
  it('空字符串返回 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('英文短文本', () => {
    const result = estimateTokens('hello world');
    // 11 chars * 0.5 = 5.5 → ceil = 6
    expect(result).toBe(6);
  });

  it('中文短文本', () => {
    const result = estimateTokens('你好世界');
    // 4 chars * 0.5 = 2
    expect(result).toBe(2);
  });

  it('长文本', () => {
    const text = 'a'.repeat(1000);
    expect(estimateTokens(text)).toBe(500);
  });

  it('混合中英文', () => {
    const text = 'hello你好world世界';
    // 14 chars * 0.5 = 7
    expect(estimateTokens(text)).toBe(7);
  });
});
