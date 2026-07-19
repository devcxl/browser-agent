import { describe, it, expect } from 'vitest';
import { isClick, resolveSide, clampTop } from '../drag';

describe('isClick', () => {
  it('当移动距离小于默认阈值(5px)时，返回 true', () => {
    expect(isClick(0)).toBe(true);
    expect(isClick(1)).toBe(true);
    expect(isClick(4)).toBe(true);
  });

  it('当移动距离等于默认阈值时，返回 false', () => {
    expect(isClick(5)).toBe(false);
  });

  it('当移动距离大于默认阈值时，返回 false', () => {
    expect(isClick(6)).toBe(false);
    expect(isClick(100)).toBe(false);
  });

  it('可接受自定义阈值', () => {
    expect(isClick(9, 10)).toBe(true);
    expect(isClick(10, 10)).toBe(false);
    expect(isClick(11, 10)).toBe(false);
  });

  it('阈值默认为 5', () => {
    expect(isClick(4)).toBe(true);
    expect(isClick(5)).toBe(false);
  });

  it('负值移动距离也正确判定', () => {
    expect(isClick(-1)).toBe(true);
    // Math.abs(-6) = 6 > 5
    expect(isClick(-6)).toBe(false);
  });
});

describe('resolveSide', () => {
  it('当 clientX 小于视口宽度一半时，返回 "left"', () => {
    expect(resolveSide(100, 500)).toBe('left');
    expect(resolveSide(0, 500)).toBe('left');
    expect(resolveSide(249, 500)).toBe('left');
  });

  it('当 clientX 等于或大于视口宽度一半时，返回 "right"', () => {
    expect(resolveSide(250, 500)).toBe('right');
    expect(resolveSide(400, 500)).toBe('right');
    expect(resolveSide(500, 500)).toBe('right');
  });

  it('边界值：中点判定', () => {
    expect(resolveSide(250, 500)).toBe('right');
    expect(resolveSide(249, 500)).toBe('left');
  });

  it('奇数值视口宽度时也能正确判定', () => {
    // vw = 375, 中点 = 187.5, clientX < 187.5 → left
    expect(resolveSide(187, 375)).toBe('left');
    expect(resolveSide(188, 375)).toBe('right');
  });
});

describe('clampTop', () => {
  const minTop = 8;

  it('当 pointerY 在有效范围内，返回原始值', () => {
    const result = clampTop(200, 48, 800);
    // vh - buttonSize - 8 = 800 - 48 - 8 = 744
    expect(result).toBe(200);
  });

  it('当 pointerY 小于下界(8px)时，clamp 到 8', () => {
    expect(clampTop(0, 48, 800)).toBe(8);
    expect(clampTop(-10, 48, 800)).toBe(8);
    expect(clampTop(7, 48, 800)).toBe(8);
  });

  it('当 pointerY 大于上界时，clamp 到 vh - buttonSize - 8', () => {
    // vh=800, buttonSize=48 → 800-48-8=744
    expect(clampTop(800, 48, 800)).toBe(744);
    expect(clampTop(1000, 48, 800)).toBe(744);
    expect(clampTop(745, 48, 800)).toBe(744);
  });

  it('上边界刚好等于 pointerY 时，返回 pointerY', () => {
    expect(clampTop(744, 48, 800)).toBe(744);
  });

  it('下边界刚好等于 pointerY 时，返回 pointerY', () => {
    expect(clampTop(8, 48, 800)).toBe(8);
  });

  it('不同 buttonSize 和 vh 的边界计算', () => {
    // vh=600, buttonSize=32 → 600-32-8=560
    expect(clampTop(0, 32, 600)).toBe(8);
    expect(clampTop(600, 32, 600)).toBe(560);
    expect(clampTop(300, 32, 600)).toBe(300);
  });
});
