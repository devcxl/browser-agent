import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FloatingWidget } from '../widget';
import { GrokBot } from '../grokbot';
import type { GrokBotInit, Vec2 } from '../grokbot';
import { ConfigStore } from '@/shared/storage/config-store';
import type { FloatingButtonSettings } from '@/shared/types/storage';
import {
  baseSettings,
  createBrowserStub,
  createCanvasContextStub,
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

    it('指针移到视口右下角 → 引擎收到 (1, 1)', () => {
      mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      movePointer(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      flushFrame();

      expect(gazeUpdates(updateSpy)).toEqual([{ x: 1, y: 1 }]);
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
      expect(gazeUpdates(updateSpy)).toEqual([{ x: 0.5, y: 0.5 }]);
    });

    it('坐标变化低于阈值时跳过更新', () => {
      mountWithGaze();
      const updateSpy = vi.spyOn(GrokBot.prototype, 'update');

      movePointer(620, 300);
      flushFrame();
      expect(gazeUpdates(updateSpy)).toEqual([{ x: 0.5, y: 0 }]);

      // 1px ≈ 0.004 归一化偏移，低于 0.01 阈值：仍排帧，但帧内跳过更新
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

      expect(gazeUpdates(updateSpy)).toEqual([
        { x: 0, y: 0 },
        { x: -1, y: -1 },
      ]);
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
