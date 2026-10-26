import { describe, it, expect } from 'vitest';
import {
  DuplicateCallGuard,
  duplicateBlockResult,
  DUPLICATE_BLOCK_THRESHOLD,
  DUPLICATE_BLOCK_MESSAGE,
  isDuplicateBlocked,
} from '../duplicate-call-guard';
import { DUPLICATE_TRIP_THRESHOLD } from '../circuit-breaker';

describe('DuplicateCallGuard', () => {
  it('拦截阈值为 3，且早于熔断终止阈值 6', () => {
    expect(DUPLICATE_BLOCK_THRESHOLD).toBe(3);
    expect(DUPLICATE_BLOCK_THRESHOLD).toBeLessThan(DUPLICATE_TRIP_THRESHOLD);
  });

  it('连续第 3 次相同工具 + 相同参数起返回拦截', () => {
    const guard = new DuplicateCallGuard();

    expect(guard.shouldBlock('tabs_click', { id: 1 })).toBe(false);
    expect(guard.shouldBlock('tabs_click', { id: 1 })).toBe(false);
    expect(guard.shouldBlock('tabs_click', { id: 1 })).toBe(true);
    // 之后的重复调用持续拦截（真正终止交给熔断器在第 6 次兜底）
    expect(guard.shouldBlock('tabs_click', { id: 1 })).toBe(true);
  });

  it('参数键顺序不同视为同一调用', () => {
    const guard = new DuplicateCallGuard();

    guard.shouldBlock('tabs_click', { a: 1, b: 2 });
    guard.shouldBlock('tabs_click', { b: 2, a: 1 });
    expect(guard.shouldBlock('tabs_click', { b: 2, a: 1 })).toBe(true);
  });

  it('参数变化或换工具打断计数', () => {
    const guard = new DuplicateCallGuard();

    guard.shouldBlock('tabs_click', { id: 1 });
    guard.shouldBlock('tabs_click', { id: 1 });
    expect(guard.shouldBlock('tabs_click', { id: 2 })).toBe(false);
    expect(guard.shouldBlock('tabs_remove', { id: 1 })).toBe(false);
  });

  it('reset 后计数归零', () => {
    const guard = new DuplicateCallGuard();

    guard.shouldBlock('tabs_click', { id: 1 });
    guard.shouldBlock('tabs_click', { id: 1 });
    guard.reset();
    expect(guard.shouldBlock('tabs_click', { id: 1 })).toBe(false);
  });
});

describe('duplicateBlockResult', () => {
  it('构造带 duplicateBlocked 标记的失败结果，熔断器据此跳过失败计数', () => {
    const result = duplicateBlockResult();

    expect(result.success).toBe(false);
    expect(result.error).toBe(DUPLICATE_BLOCK_MESSAGE);
    expect(isDuplicateBlocked(result)).toBe(true);
    expect(isDuplicateBlocked({ success: false, error: '真实失败' })).toBe(false);
    expect(isDuplicateBlocked(null)).toBe(false);
  });
});
