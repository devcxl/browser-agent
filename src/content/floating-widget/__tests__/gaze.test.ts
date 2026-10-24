import { describe, it, expect } from 'vitest';
import { computeGaze, type GazeInput } from '../gaze';

/**
 * 常用基准：1000×600 视口，按钮中心 (500, 300)。
 *
 * 契约：gaze 是「指针方向 + 沿射线到视口边界的进度」：
 * - 中心 → (0, 0)
 * - 指针落在视口边界（射线出口）→ 单位长度，方向与指针一致
 * - 越界 → 钳制为单位方向
 * - 不再有固定 240px 满偏距离，整块视口都是有效行程
 */
const base: GazeInput = {
  pointerX: 500,
  pointerY: 300,
  centerX: 500,
  centerY: 300,
  viewportWidth: 1000,
  viewportHeight: 600,
};

function gaze(overrides: Partial<GazeInput> = {}) {
  return computeGaze({ ...base, ...overrides });
}

function magnitude(v: { x: number; y: number }): number {
  return Math.hypot(v.x, v.y);
}

describe('computeGaze', () => {
  it('指针位于按钮中心时 gaze 为原点', () => {
    expect(gaze()).toEqual({ x: 0, y: 0 });
  });

  it('指针在视口边界时为单位向量且方向正确', () => {
    expect(gaze({ pointerX: 1000 })).toEqual({ x: 1, y: 0 });
    expect(gaze({ pointerX: 0 })).toEqual({ x: -1, y: 0 });
    expect(gaze({ pointerY: 0 })).toEqual({ x: 0, y: -1 });
    expect(gaze({ pointerY: 600 })).toEqual({ x: 0, y: 1 });
  });

  it('对角边界保持真实方向（不是 (1,1)）', () => {
    // 右下角：偏移 (500, 300)，方向 (5, 3) / √34，长度 1
    const corner = gaze({ pointerX: 1000, pointerY: 600 });
    expect(magnitude(corner)).toBeCloseTo(1, 5);
    expect(corner.x / corner.y).toBeCloseTo(500 / 300, 5);
  });

  it('沿同一射线移动时 gaze 方向始终一致', () => {
    const points = [
      { pointerX: 620, pointerY: 360 },
      { pointerX: 740, pointerY: 420 },
      { pointerX: 860, pointerY: 480 },
    ];
    for (const p of points) {
      const g = gaze(p);
      expect(g.x / g.y).toBeCloseTo(120 / 60, 5);
    }
  });

  it('右侧停靠时，指针继续向页面内移动 240px 之后 gaze 仍单调变化', () => {
    const at240 = gaze({ centerX: 980, pointerX: 740, pointerY: 300 });
    const at480 = gaze({ centerX: 980, pointerX: 500, pointerY: 300 });
    const at720 = gaze({ centerX: 980, pointerX: 260, pointerY: 300 });

    // 240px 处不再已经满偏
    expect(at240.x).toBeGreaterThan(-1);
    expect(at240.x).toBeLessThan(-0.2);
    // 越过 240px 后继续单调加深
    expect(at480.x).toBeLessThan(at240.x);
    expect(at720.x).toBeLessThan(at480.x);
    expect(at720.x).toBeGreaterThanOrEqual(-1);
  });

  it('左侧停靠时同样没有固定满偏距离', () => {
    const at240 = gaze({ centerX: 20, pointerX: 260, pointerY: 300 });
    const at480 = gaze({ centerX: 20, pointerX: 500, pointerY: 300 });
    const at720 = gaze({ centerX: 20, pointerX: 740, pointerY: 300 });

    expect(at240.x).toBeLessThan(1);
    expect(at240.x).toBeGreaterThan(0.2);
    expect(at480.x).toBeGreaterThan(at240.x);
    expect(at720.x).toBeGreaterThan(at480.x);
    expect(at720.x).toBeLessThanOrEqual(1);
  });

  it('大视口下 300px 与 600px 的偏移给出不同结果（无 240px 硬饱和）', () => {
    const near = gaze({ centerX: 1000, centerY: 600, viewportWidth: 2000, viewportHeight: 1200, pointerX: 1300, pointerY: 600 });
    const far = gaze({ centerX: 1000, centerY: 600, viewportWidth: 2000, viewportHeight: 1200, pointerX: 1600, pointerY: 600 });

    expect(near.x).toBeLessThan(far.x);
    expect(far.x).toBeLessThan(1);
  });

  it('停靠顶部时纵向移动到 240px 之外仍有响应', () => {
    const near = gaze({ centerX: 500, centerY: 40, pointerX: 500, pointerY: 300 });
    const far = gaze({ centerX: 500, centerY: 40, pointerX: 500, pointerY: 400 });

    expect(near.y).toBeGreaterThan(0.5);
    expect(far.y).toBeGreaterThan(near.y);
    expect(far.y).toBeLessThanOrEqual(1);
  });

  it('沿射线扫过整块视口时单调且无跳变', () => {
    let previous = 0;
    for (let x = 500; x <= 1000; x += 1) {
      const current = gaze({ pointerX: x }).x;
      expect(current).toBeGreaterThanOrEqual(previous);
      expect(current - previous).toBeLessThan(0.02);
      previous = current;
    }
  });

  it('近指针仍有可用的偏转行程', () => {
    // 120px 对角偏移：沿射线到边界的参数 t = min(500/120, 300/120) = 2.5
    // r = 1/t = 0.4，缓动 m = r(2-r) = 0.64，方向 (1,-1)/√2
    const g = gaze({ pointerX: 620, pointerY: 180 });
    expect(g.x).toBeCloseTo(0.4525, 4);
    expect(g.y).toBeCloseTo(-0.4525, 4);
  });

  it('小视口按整块视口分配行程', () => {
    // 300×300、中心 (150,150)、偏移 75：r = 75/150 = 0.5，m = 0.75
    const g = gaze({ viewportWidth: 300, viewportHeight: 300, centerX: 150, centerY: 150, pointerX: 225, pointerY: 150 });
    expect(g).toEqual({ x: 0.75, y: 0 });
  });

  it('越界坐标钳制为单位方向，保持有限且有界', () => {
    const g = gaze({ pointerX: 5000, pointerY: -5000 });
    expect(Number.isFinite(g.x)).toBe(true);
    expect(Number.isFinite(g.y)).toBe(true);
    expect(Math.abs(g.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.y)).toBeLessThanOrEqual(1);
    expect(magnitude(g)).toBeCloseTo(1, 5);
    expect(g.x).toBeGreaterThan(0);
    expect(g.y).toBeLessThan(0);
  });

  it('视口尺寸为 0 时 gaze 归零', () => {
    expect(gaze({ pointerX: 900, pointerY: 600, viewportWidth: 0 })).toEqual({ x: 0, y: 0 });
    expect(gaze({ pointerX: 900, pointerY: 600, viewportHeight: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('负尺寸视口按非法处理，gaze 归零', () => {
    expect(gaze({ pointerX: 900, pointerY: 0, viewportWidth: -1000, viewportHeight: -600 })).toEqual({ x: 0, y: 0 });
  });

  it('NaN / Infinity 等非法输入不产生 NaN', () => {
    expect(gaze({ pointerX: Number.NaN })).toEqual({ x: 0, y: 0 });
    expect(gaze({ pointerY: Number.NaN })).toEqual({ x: 0, y: 0 });
    expect(gaze({ centerX: Number.POSITIVE_INFINITY })).toEqual({ x: 0, y: 0 });
    expect(gaze({ viewportWidth: Number.NaN, viewportHeight: Number.POSITIVE_INFINITY })).toEqual({ x: 0, y: 0 });
  });

  it('超长视口不产生 Infinity 之外的异常值', () => {
    const result = gaze({ pointerX: 1e12, viewportWidth: Number.MAX_VALUE });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});
