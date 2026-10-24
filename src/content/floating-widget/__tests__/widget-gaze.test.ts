import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FloatingWidget } from '../widget';
import { GrokBot } from '../grokbot';
import type { GrokBotInit, Vec2 } from '../grokbot';
import {
  FACE_CENTER,
  calculateTargetPitch,
  clampSafePitch,
  mapNormalizedGaze,
  projectEye,
  ringCentroid,
} from '../grokbot/geometry';
import { expressionRings } from '../grokbot/data/expressions';
import { ConfigStore } from '@/shared/storage/config-store';
import type { FloatingButtonSettings } from '@/shared/types/storage';
import {
  baseSettings,
  createBrowserStub,
  createCanvasContextStub,
  firePointer,
  mountWidget,
  patchPointerCapture,
} from './helpers/widget-harness';

/** 按钮矩形：中心 (500, 300)，与下面的 1000×600 视口配合 */
const BUTTON_RECT = {
  x: 470,
  y: 270,
  left: 470,
  top: 270,
  width: 60,
  height: 60,
  right: 530,
  bottom: 330,
  toJSON: () => ({}),
} as DOMRect;

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 600;

let widget: FloatingWidget | null = null;
let frames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let rafSpy: ReturnType<typeof vi.fn>;
let cafSpy: ReturnType<typeof vi.fn>;

patchPointerCapture();

/** 可控 rAF：事件只排队，测试显式 flush 一帧 */
function installRafStub(): void {
  frames = new Map();
  nextFrameId = 1;
  rafSpy = vi.fn((cb: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.set(id, cb);
    return id;
  });
  cafSpy = vi.fn((id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', rafSpy);
  vi.stubGlobal('cancelAnimationFrame', cafSpy);
}

/** 当前已排队的 rAF 调用数（引擎自身动画循环也会占用 rAF，故用增量断言） */
function rafCallCount(): number {
  return rafSpy.mock.calls.length;
}

/** 取第 count 次 rAF 调用返回的帧 id */
function rafIdAt(count: number): number {
  return rafSpy.mock.results[count]?.value as number;
}

/** 执行所有排队中的帧回调（模拟浏览器下一帧） */
function flushFrame(): void {
  const pending = [...frames.values()];
  frames.clear();
  for (const cb of pending) cb(16);
}

function mountWithGaze(
  settings: FloatingButtonSettings = baseSettings,
): { widget: FloatingWidget; btn: HTMLButtonElement } {
  const mounted = mountWidget(settings);
  widget = mounted.widget;
  const btn = mounted.shadow.querySelector('button.float-btn') as HTMLButtonElement;
  vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue(BUTTON_RECT);
  return { widget: mounted.widget, btn };
}

function movePointer(x: number, y: number): void {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));
}

/** 只挑出带 gaze 的 update 调用，避免状态机等其他 patch 干扰断言 */
function gazeUpdates(spy: { mock: { calls: unknown[][] } }): Vec2[] {
  return spy.mock.calls
    .map(([patch]) => (patch as GrokBotInit).gaze)
    .filter((gaze): gaze is Vec2 => gaze !== undefined);
}

describe('FloatingWidget 眼睛追踪（gaze）', () => {
  beforeEach(() => {
    widget = null;
    ConfigStore.resetInstance();
    vi.stubGlobal('browser', createBrowserStub().browser);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createCanvasContextStub());
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: VIEWPORT_WIDTH,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: VIEWPORT_HEIGHT,
    });
    installRafStub();
  });

  afterEach(() => {
    widget?.destroy();
    widget = null;
    ConfigStore.resetInstance();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('接线与归一化', () => {
    it('window 上以 passive 方式监听 pointermove', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      mountWithGaze();

      const gazeListener = addSpy.mock.calls.find(([type]) => type === 'pointermove');
      expect(gazeListener).toBeDefined();
      expect(gazeListener?.[2]).toMatchObject({ passive: true });
    });

    it('指针移到视口右下角 → 引擎收到对应方向上的单位注视向量', () => {
      mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      movePointer(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      flushFrame();

      const [gaze] = gazeUpdates(updateSpy);
      expect(gaze).toBeDefined();
      expect(Math.hypot(gaze.x, gaze.y)).toBeCloseTo(1, 5);
      expect(gaze.x / gaze.y).toBeCloseTo(500 / 300, 5);
      expect(gaze.x).toBeCloseTo(500 / Math.hypot(500, 300), 5);
      expect(gaze.y).toBeCloseTo(300 / Math.hypot(500, 300), 5);
    });

    it('指针在按钮中心 → gaze 归零且不更新（初始态一致）', () => {
      mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      movePointer(500, 300);
      flushFrame();

      expect(gazeUpdates(updateSpy)).toEqual([]);
    });
  });

  describe('rAF 合并与阈值', () => {
    it('同一帧内多次 pointermove 只计算一次，采用最后一个坐标', () => {
      mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      const rafBefore = rafCallCount();
      movePointer(600, 300);
      movePointer(700, 400);
      movePointer(620, 420);

      expect(rafCallCount() - rafBefore).toBe(1);
      expect(gazeUpdates(updateSpy)).toEqual([]);

      flushFrame();

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const [gaze] = gazeUpdates(updateSpy);
      expect(gaze).toBeDefined();
      expect(gaze.x).toBeCloseTo(0.64 / Math.SQRT2, 4);
      expect(gaze.y).toBeCloseTo(0.64 / Math.SQRT2, 4);
      expect(gaze.x).toBeCloseTo(gaze.y, 5);
    });

    it('坐标变化低于阈值时跳过更新', () => {
      mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      movePointer(620, 300);
      flushFrame();
      const [gaze] = gazeUpdates(updateSpy);
      expect(gaze.x).toBeCloseTo(0.4224, 4);
      expect(gaze.y).toBe(0);

      // 1px ≈ 0.003 归一化偏移，低于 0.01 阈值：仍排帧，但帧内跳过更新
      const rafBefore = rafCallCount();
      movePointer(621, 300);
      expect(rafCallCount()).toBe(rafBefore + 1);
      flushFrame();
      expect(gazeUpdates(updateSpy)).toHaveLength(1);
    });
  });

  describe('回正', () => {
    it('document pointerleave → gaze 回正并取消待执行帧', () => {
      mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      const rafBefore = rafCallCount();
      movePointer(1000, 600);
      expect(rafCallCount() - rafBefore).toBe(1);
      const gazeFrameId = rafIdAt(rafBefore);

      document.dispatchEvent(new PointerEvent('pointerleave'));

      expect(cafSpy).toHaveBeenCalledWith(gazeFrameId);
      expect(frames.has(gazeFrameId)).toBe(false);
      expect(gazeUpdates(updateSpy)).toEqual([{ x: 0, y: 0 }]);

      // 已取消的帧不再执行 → 不会把 gaze 覆盖回角落值
      flushFrame();
      expect(gazeUpdates(updateSpy)).toEqual([{ x: 0, y: 0 }]);
    });

    it('window blur → gaze 回正并取消待执行帧', () => {
      mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      const rafBefore = rafCallCount();
      movePointer(1000, 600);
      const gazeFrameId = rafIdAt(rafBefore);
      window.dispatchEvent(new Event('blur'));

      expect(cafSpy).toHaveBeenCalledWith(gazeFrameId);
      expect(gazeUpdates(updateSpy)).toEqual([{ x: 0, y: 0 }]);
      flushFrame();
      expect(gazeUpdates(updateSpy)).toHaveLength(1);
    });

    it('回正后再次 move 仍可正常追踪', () => {
      mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      document.dispatchEvent(new PointerEvent('pointerleave'));
      movePointer(0, 0);
      flushFrame();

      const updates = gazeUpdates(updateSpy);
      expect(updates).toHaveLength(2);
      expect(updates[0]).toEqual({ x: 0, y: 0 });
      expect(updates[1].x).toBeCloseTo(-500 / Math.hypot(500, 300), 5);
      expect(updates[1].y).toBeCloseTo(-300 / Math.hypot(500, 300), 5);
      expect(Math.hypot(updates[1].x, updates[1].y)).toBeCloseTo(1, 5);
    });
  });

  describe('停靠朝向与转头（turn）', () => {
    /**
     * 基于 GrokBot 几何与 idle 首个表情（expression 0）投影计算双眼可见性与中心偏向。
     * 验证真实 Canvas 渲染模型下双眼均可见（visible: true 且无顶点越过圆轮廓被裁切），
     * 并断言双眼中心偏向给定的内侧方向。
     */
    function checkRestingEyes(turn: number, gaze: Vec2 = { x: 0, y: 0 }) {
      const origin: Vec2 = { x: FACE_CENTER, y: FACE_CENTER };
      const radius = 105;
      const rings = expressionRings[0];
      const mappedGaze = mapNormalizedGaze(gaze);

      const eyes = rings.map((ring) => {
        const center = ringCentroid(ring);
        const proj = projectEye({
          centroid: center,
          origin,
          radius,
          turn,
          gaze: mappedGaze,
          scale: 1,
          blinkScale: 1,
        });
        let maxDist = 0;
        for (let i = 0; i < ring.length; i += 2) {
          const vx = proj.center.x + (ring[i] - center.x) * proj.scaleX;
          const vy = proj.center.y + (ring[i + 1] - center.y) * proj.scaleY;
          maxDist = Math.max(maxDist, Math.hypot(vx - origin.x, vy - origin.y));
        }
        return { ...proj, maxDist };
      });

      const midX = (eyes[0].center.x + eyes[1].center.x) / 2;
      const allVisible = eyes.every((e) => e.visible);
      const anyClipped = eyes.some((e) => e.maxDist > radius);

      return { midX, allVisible, anyClipped };
    }

    it('右停靠默认朝内静止：双眼均可见且中心偏向左侧（内侧），无任何边缘裁切', () => {
      mountWithGaze({ ...baseSettings, position: { side: 'right', top: 300 } });
      const bot = (widget as unknown as { bot: GrokBot }).bot;
      const { midX, allVisible, anyClipped } = checkRestingEyes(bot.options.turn);

      expect(midX).toBeLessThan(FACE_CENTER);
      expect(allVisible).toBe(true);
      expect(anyClipped).toBe(false);
    });

    it('左停靠默认朝内静止：双眼均可见且中心偏向右侧（内侧），无任何边缘裁切', () => {
      mountWithGaze({ ...baseSettings, position: { side: 'left', top: 300 } });
      const bot = (widget as unknown as { bot: GrokBot }).bot;
      const { midX, allVisible, anyClipped } = checkRestingEyes(bot.options.turn);

      expect(midX).toBeGreaterThan(FACE_CENTER);
      expect(allVisible).toBe(true);
      expect(anyClipped).toBe(false);
    });

    it('配置变更切换侧边时，调用 bot.update 同步更新 turn，且双眼偏向正确反转', () => {
      const { widget: instance } = mountWithGaze({
        ...baseSettings,
        position: { side: 'right', top: 300 },
      });
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      instance.apply({
        ...baseSettings,
        position: { side: 'left', top: 300 },
      });

      const turnCalls = updateSpy.mock.calls
        .map(([patch]) => (patch as GrokBotInit).turn)
        .filter((turn): turn is number => typeof turn === 'number');

      expect(turnCalls.length).toBeGreaterThanOrEqual(1);
      const newTurn = turnCalls[turnCalls.length - 1];
      const { midX, allVisible, anyClipped } = checkRestingEyes(newTurn);
      expect(midX).toBeGreaterThan(FACE_CENTER);
      expect(allVisible).toBe(true);
      expect(anyClipped).toBe(false);
    });

    it('拖拽吸附到另一侧时，同步更新 turn 朝向，且双眼偏向正确反转', () => {
      const { btn } = mountWithGaze({
        ...baseSettings,
        position: { side: 'right', top: 300 },
      });
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      // 拖拽到左半屏并释放
      firePointer(btn, 'pointerdown', 980, 300);
      firePointer(btn, 'pointermove', 100, 300);
      firePointer(btn, 'pointerup', 100, 300);

      const turnCalls = updateSpy.mock.calls
        .map(([patch]) => (patch as GrokBotInit).turn)
        .filter((turn): turn is number => typeof turn === 'number');

      expect(turnCalls.length).toBeGreaterThanOrEqual(1);
      const newTurn = turnCalls[turnCalls.length - 1];
      const { midX, allVisible, anyClipped } = checkRestingEyes(newTurn);
      expect(midX).toBeGreaterThan(FACE_CENTER);
      expect(allVisible).toBe(true);
      expect(anyClipped).toBe(false);
    });

    it('全视口注视网格回归测试：在左右停靠角度下，视口内所有方位注视均不发生双眼裁切且双眼均可见', () => {
      // 检验左右两侧在全方位 gaze 极限行程下无裁切
      const turns = [-0.65, -0.30];
      for (const turn of turns) {
        for (let gx = -1; gx <= 1; gx += 0.5) {
          for (let gy = -1; gy <= 1; gy += 0.5) {
            if (Math.hypot(gx, gy) > 1.01) continue;
            const { allVisible, anyClipped } = checkRestingEyes(turn, { x: gx, y: gy });
            expect(allVisible).toBe(true);
            expect(anyClipped).toBe(false);
          }
        }
      }
    });
  });

  describe('纵向满程与垂直视野（Vertical Maximum）', () => {
    it('指针在按钮正上方视口边缘 → 垂直方向达到最大值 -1', () => {
      mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      movePointer(500, 0); // 正上方顶部边界
      flushFrame();

      const [gaze] = gazeUpdates(updateSpy);
      expect(gaze).toEqual({ x: 0, y: -1 });
    });

    it('指针在按钮正下方视口边缘 → 垂直方向达到最大值 1', () => {
      mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      movePointer(500, VIEWPORT_HEIGHT); // 正下方底部边界
      flushFrame();

      const [gaze] = gazeUpdates(updateSpy);
      expect(gaze).toEqual({ x: 0, y: 1 });
    });

    it('geometry 映射中 y 增益达到 ~13.2，垂直与水平具备等幅视觉行程', () => {
      const fullVertical = mapNormalizedGaze({ x: 0, y: 1 });
      const fullHorizontal = mapNormalizedGaze({ x: 1, y: 0 });

      expect(fullVertical.y).toBeCloseTo(13.2, 1);
      expect(fullHorizontal.x).toBeCloseTo(13.2, 1);
      expect(Math.abs(fullVertical.y)).toBeCloseTo(Math.abs(fullHorizontal.x), 1);
    });
  });

  describe('真实球面俯仰投影（Spherical Pitch & Latitude Projection）', () => {
    const origin: Vec2 = { x: FACE_CENTER, y: FACE_CENTER };
    const radius = 105;

    it('pitch = 0 必须与旧 projectEye 逐位一致（backward compat）', () => {
      const ring = expressionRings[0][0];
      const centroid = ringCentroid(ring);
      const gaze = { x: 0.3, y: 0.5 };
      const baseResult = projectEye({
        centroid,
        origin,
        radius,
        turn: -0.4,
        gaze,
        scale: 1.2,
        blinkScale: 0.8,
      });
      const pitchZeroResult = projectEye({
        centroid,
        origin,
        radius,
        turn: -0.4,
        pitch: 0,
        gaze,
        scale: 1.2,
        blinkScale: 0.8,
      });

      expect(pitchZeroResult.center.x).toBe(baseResult.center.x);
      expect(pitchZeroResult.center.y).toBe(baseResult.center.y);
      expect(pitchZeroResult.scaleX).toBe(baseResult.scaleX);
      expect(pitchZeroResult.scaleY).toBe(baseResult.scaleY);
      expect(pitchZeroResult.visible).toBe(baseResult.visible);
    });

    it('俯仰映射曲线：向下注视产生约 0.95 rad * y*(2-y) 的偏置缓动，向上注视温和约 0.15 rad * y', () => {
      expect(calculateTargetPitch(0)).toBe(0);
      expect(calculateTargetPitch(1)).toBeCloseTo(0.95, 2);
      expect(calculateTargetPitch(0.4)).toBeCloseTo(0.95 * 0.4 * 1.6, 2);
      expect(calculateTargetPitch(-1)).toBeCloseTo(-0.15, 2);
      expect(calculateTargetPitch(-0.5)).toBeCloseTo(-0.075, 2);
    });

    it('真实用户症状回归：idle (expression 0) 在 bottom-center (0, 1) 时双眼中心越过 FACE_CENTER 移至下半球', () => {
      const targetPitch = calculateTargetPitch(1);
      const mappedGaze = mapNormalizedGaze({ x: 0, y: 1 });
      const rings = expressionRings[0];
      const centers = rings.map((ring) => {
        const center = ringCentroid(ring);
        const proj = projectEye({
          centroid: center,
          origin,
          radius,
          turn: -0.475,
          pitch: targetPitch,
          gaze: mappedGaze,
          scale: 1,
          blinkScale: 1,
        });
        return proj.center;
      });
      const midY = (centers[0].y + centers[1].y) / 2;
      expect(midY).toBeGreaterThan(FACE_CENTER);
    });

    it('真实用户症状回归：idle (expression 0) 在右停靠向 bottom-left (gaze.y ≈ 0.4) 视线追踪时，双眼中心仍越过 FACE_CENTER', () => {
      const targetPitch = calculateTargetPitch(0.4);
      const mappedGaze = mapNormalizedGaze({ x: -0.85, y: 0.4 });
      const rings = expressionRings[0];
      const centers = rings.map((ring) => {
        const center = ringCentroid(ring);
        const proj = projectEye({
          centroid: center,
          origin,
          radius,
          turn: -0.65,
          pitch: targetPitch,
          gaze: mappedGaze,
          scale: 1,
          blinkScale: 1,
        });
        return proj.center;
      });
      const midY = (centers[0].y + centers[1].y) / 2;
      expect(midY).toBeGreaterThan(FACE_CENTER);
    });

    it('安全俯仰钳制：expression 0 在最大向下俯仰时不发生圆轮廓裁切，且完整保留目标俯仰角', () => {
      const targetPitch = calculateTargetPitch(1);
      const mappedGaze = mapNormalizedGaze({ x: 0, y: 1 });
      const safePitch = clampSafePitch({
        rings: expressionRings[0],
        origin,
        radius,
        turn: -0.65,
        gaze: mappedGaze,
        scale: 1,
        targetPitch,
      });

      expect(safePitch).toBeCloseTo(0.95, 2);
    });

    it('安全俯仰钳制：全 25 种表情及插值形态下，计算出的共享 safe pitch 均不发生额外圆轮廓裁切', () => {
      for (let e = 0; e < 25; e++) {
        for (const turn of [-0.65, -0.30]) {
          for (const gy of [-1, 0, 0.4, 1]) {
            const targetPitch = calculateTargetPitch(gy);
            const mappedGaze = mapNormalizedGaze({ x: 0, y: gy });
            const safePitch = clampSafePitch({
              rings: expressionRings[e],
              origin,
              radius,
              turn,
              gaze: mappedGaze,
              scale: 1,
              targetPitch,
            });

            // 无论 targetPitch 如何，clamped safePitch 必须保证不超出允许半径范围
            for (const ring of expressionRings[e]) {
              const center = ringCentroid(ring);
              // 计算 pitch=0 时的基准最大距离
              const baseProj = projectEye({
                centroid: center,
                origin,
                radius,
                turn,
                pitch: 0,
                gaze: mappedGaze,
                scale: 1,
                blinkScale: 1,
              });
              let baseMax = 0;
              for (let i = 0; i < ring.length; i += 2) {
                const vx = baseProj.center.x + (ring[i] - center.x) * baseProj.scaleX;
                const vy = baseProj.center.y + (ring[i + 1] - center.y) * baseProj.scaleY;
                baseMax = Math.max(baseMax, Math.hypot(vx - origin.x, vy - origin.y));
              }
              const maxAllowed = Math.max(radius, baseMax);

              const proj = projectEye({
                centroid: center,
                origin,
                radius,
                turn,
                pitch: safePitch,
                gaze: mappedGaze,
                scale: 1,
                blinkScale: 1,
              });
              for (let i = 0; i < ring.length; i += 2) {
                const vx = proj.center.x + (ring[i] - center.x) * proj.scaleX;
                const vy = proj.center.y + (ring[i + 1] - center.y) * proj.scaleY;
                const dist = Math.hypot(vx - origin.x, vy - origin.y);
                expect(dist).toBeLessThanOrEqual(maxAllowed + 0.1);
              }
            }
          }
        }
      }
    });
  });

  describe('降级与销毁', () => {
    it('Canvas 不可用（无 bot）时不监听全局指针、不排帧', () => {
      vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
      const addSpy = vi.spyOn(window, 'addEventListener');
      mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      movePointer(1000, 600);
      document.dispatchEvent(new PointerEvent('pointerleave'));
      window.dispatchEvent(new Event('blur'));

      expect(rafSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
      expect(addSpy.mock.calls.some(([type]) => type === 'pointermove')).toBe(false);
    });

    it('destroy 取消待执行帧并移除监听，之后事件不再更新引擎', () => {
      const { widget: instance } = mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      const rafBefore = rafCallCount();
      movePointer(1000, 600);
      const gazeFrameId = rafIdAt(rafBefore);
      expect(frames.has(gazeFrameId)).toBe(true);

      instance.destroy();

      expect(cafSpy).toHaveBeenCalledWith(gazeFrameId);
      expect(frames.has(gazeFrameId)).toBe(false);
      expect(frames.size).toBe(0);

      movePointer(0, 0);
      document.dispatchEvent(new PointerEvent('pointerleave'));
      window.dispatchEvent(new Event('blur'));
      flushFrame();

      expect(rafCallCount()).toBe(rafBefore + 1); // 仅销毁前那次
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
});
