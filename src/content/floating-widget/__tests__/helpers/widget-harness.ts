/**
 * 悬浮球单测共享夹具。
 *
 * jsdom 缺 Pointer Capture 与 Canvas 2D，且 widget 需要扩展 storage mock 才能挂载；
 * 这两份逻辑在多个测试文件里重复过一遍，统一收口在这里，避免桩实现漂移。
 */

import { vi } from 'vitest';
import { FloatingWidget } from '../../widget';
import { createI18nMock } from '@/test/i18n-mock';
import type { FloatingButtonSettings } from '@/shared/types/storage';

export const HOSTNAME = 'example.com';

export const baseSettings: FloatingButtonSettings = {
  enabled: true,
  position: null,
  blacklist: [],
};

/** jsdom 未实现 Pointer Capture；补 no-op 以便事件流完整执行 */
export function patchPointerCapture(): void {
  if (typeof Element.prototype.setPointerCapture !== 'function') {
    (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
  }
  if (typeof Element.prototype.releasePointerCapture !== 'function') {
    (Element.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture =
      () => {};
  }
}

/** jsdom 不实现 Canvas 2D；记录型 stub 让 GrokBot 引擎可以真实构造 */
export function createCanvasContextStub(): CanvasRenderingContext2D {
  const stub = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
  return stub as unknown as CanvasRenderingContext2D;
}

/** browser.* 最小桩：local storage 有真实读写语义，便于断言持久化 */
export function createBrowserStub() {
  const storage: Record<string, unknown> = {};
  const local = {
    get: vi.fn(async (keys: string | string[] | Record<string, unknown> | null) => {
      if (keys === null) return { ...storage };
      const keysArr = (Array.isArray(keys) ? keys : [keys]) as string[];
      const result: Record<string, unknown> = {};
      for (const key of keysArr) {
        if (key in storage) result[key] = storage[key];
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(storage, items);
    }),
    remove: vi.fn(),
    clear: vi.fn(),
  };
  const onChanged = { addListener: vi.fn(), removeListener: vi.fn() };
  return {
    browser: {
      storage: { local, onChanged },
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      },
      i18n: createI18nMock(),
    },
    local,
    storage,
  };
}

/** 挂载 widget 并返回实例与其 closed shadow root（attachShadow 包装捕获引用） */
export function mountWidget(
  settings: FloatingButtonSettings = baseSettings,
  hostname: string = HOSTNAME,
): { widget: FloatingWidget; shadow: ShadowRoot } {
  const origAttach = Element.prototype.attachShadow;
  let captured: ShadowRoot | null = null;
  Element.prototype.attachShadow = function (
    this: Element,
    init: ShadowRootInit,
  ): ShadowRoot {
    const sr = origAttach.call(this, init);
    captured = sr;
    return sr;
  };
  try {
    const widget = new FloatingWidget(settings, hostname);
    widget.mount();
    return { widget, shadow: captured as unknown as ShadowRoot };
  } finally {
    Element.prototype.attachShadow = origAttach;
  }
}

export function firePointer(el: Element, type: string, clientX: number, clientY: number): void {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      clientX,
      clientY,
    }),
  );
}
