import { describe, it, expect } from 'vitest';
import { computeGaze } from '../gaze';

/**
 * 常用基准：1000×600 视口，按钮中心 (500, 300)。
 * 满偏参考距离 = min(240, 短边一半) = 240px。
 */
const base = {
  pointerX: 500,
  pointerY: 300,
  centerX: 500,
  centerY: 300,
  viewportWidth: 1000,
  viewportHeight: 600,
};

describe('computeGaze', () => {
  it('指针位于按钮中心时 gaze 为原点', () => {
    expect(computeGaze(base)).toEqual({ x: 0, y: 0 });
  });

  it('右下角 → (1, 1)', () => {
    expect(computeGaze({ ...base, pointerX: 1000, pointerY: 600 })).toEqual({ x: 1, y: 1 });
  });

  it('左上角 → (-1, -1)', () => {
    expect(computeGaze({ ...base, pointerX: 0, pointerY: 0 })).toEqual({ x: -1, y: -1 });
  });

  it('右上角 → (1, -1)', () => {
    expect(computeGaze({ ...base, pointerX: 1000, pointerY: 0 })).toEqual({ x: 1, y: -1 });
  });

  it('左下角 → (-1, 1)', () => {
    expect(computeGaze({ ...base, pointerX: 0, pointerY: 600 })).toEqual({ x: -1, y: 1 });
  });

  it('参考距离内按偏移线性归一化', () => {
    // 偏移 +120 / -120，参考距离 240 → ±0.5
    expect(computeGaze({ ...base, pointerX: 620, pointerY: 180 })).toEqual({ x: 0.5, y: -0.5 });
  });

  it('靠近按钮时仍有可用的偏转行程（不被半视口稀释）', () => {
    // 贴右边缘的按钮：光标再向右 48px 应明显偏转，而不是接近 0
    const gaze = computeGaze({
      ...base,
      centerX: 980,
      pointerX: 1028,
    });
    expect(gaze.x).toBeCloseTo(0.2, 5);
  });

  it('大视口下参考距离封顶 240px', () => {
    // 2000×1200：短边一半 600，但受上限约束仍为 240
    expect(
      computeGaze({
        ...base,
        centerX: 1000,
        centerY: 600,
        viewportWidth: 2000,
        viewportHeight: 1200,
        pointerX: 1120,
        pointerY: 600,
      }),
    ).toEqual({ x: 0.5, y: 0 });
  });

  it('小视口按短边一半缩放，不会过早饱和', () => {
    // 300×300：参考距离 150，偏移 75 → 0.5
    expect(
      computeGaze({
        ...base,
        viewportWidth: 300,
        viewportHeight: 300,
        centerX: 150,
        centerY: 150,
        pointerX: 225,
        pointerY: 150,
      }),
    ).toEqual({ x: 0.5, y: 0 });
  });

  it('越界坐标钳制在 [-1, 1]', () => {
    expect(computeGaze({ ...base, pointerX: 5000, pointerY: -5000 })).toEqual({ x: 1, y: -1 });
  });

  it('视口尺寸为 0 时无参考距离，gaze 归零', () => {
    expect(
      computeGaze({ ...base, pointerX: 900, pointerY: 600, viewportWidth: 0 }),
    ).toEqual({ x: 0, y: 0 });
    expect(
      computeGaze({ ...base, pointerX: 900, pointerY: 600, viewportHeight: 0 }),
    ).toEqual({ x: 0, y: 0 });
  });

  it('负尺寸视口按非法处理，gaze 归零', () => {
    expect(
      computeGaze({ ...base, pointerX: 900, pointerY: 0, viewportWidth: -1000, viewportHeight: -600 }),
    ).toEqual({ x: 0, y: 0 });
  });

  it('NaN / Infinity 等非法输入不产生 NaN', () => {
    expect(computeGaze({ ...base, pointerX: Number.NaN })).toEqual({ x: 0, y: 0 });
    expect(computeGaze({ ...base, pointerY: Number.NaN })).toEqual({ x: 0, y: 0 });
    expect(computeGaze({ ...base, centerX: Number.POSITIVE_INFINITY })).toEqual({ x: 0, y: 0 });
    expect(
      computeGaze({ ...base, viewportWidth: Number.NaN, viewportHeight: Number.POSITIVE_INFINITY }),
    ).toEqual({ x: 0, y: 0 });
  });

  it('超长视口不产生 Infinity 之外的异常值', () => {
    const result = computeGaze({ ...base, pointerX: 1e12, viewportWidth: Number.MAX_VALUE });
    expect(Number.isFinite(result.x)).toBe(true);
  });
});
