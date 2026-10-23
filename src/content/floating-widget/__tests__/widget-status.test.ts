import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FloatingWidget } from '../widget';
import { GrokBot } from '../grokbot';
import { DEFAULT_CELEBRATE_MS, DEFAULT_DEBOUNCE_MS } from '../bot-state-controller';
import { ConfigStore } from '@/shared/storage/config-store';
import { createI18nMock } from '@/test/i18n-mock';
import type { FloatingButtonSettings } from '@/shared/types/storage';

/**
 * 端到端接线测试：真实 ChatPanel + 真实 iframe 消息通道。
 * widget.test.ts 用 mock 隔离 ChatPanel，本文件补齐「iframe status 消息 → 引擎状态」链路，
 * 并锁定去抖 / 庆祝 / 面板关闭复位 / error·abort 跳过庆祝的行为。
 */

const HOSTNAME = 'example.com';

const baseSettings: FloatingButtonSettings = {
  enabled: true,
  position: null,
  blacklist: [],
};

// jsdom 未实现 Pointer Capture；补 no-op 以便事件流完整执行
if (typeof Element.prototype.setPointerCapture !== 'function') {
  (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== 'function') {
  (Element.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
}

/** jsdom 不实现 Canvas 2D；记录型 stub 让 GrokBot 可以真实构造 */
function createCanvasContextStub(): CanvasRenderingContext2D {
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

function createBrowserStub() {
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
  };
}

let widget: FloatingWidget | null = null;

/** 挂载 widget 并返回其 closed shadow root（attachShadow 包装捕获引用） */
function mountWithShadow(settings: FloatingButtonSettings = baseSettings): ShadowRoot {
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
    widget = new FloatingWidget(settings, HOSTNAME);
    widget.mount();
  } finally {
    Element.prototype.attachShadow = origAttach;
  }
  return captured as ShadowRoot;
}

function firePointer(el: Element, type: string, clientX: number, clientY: number): void {
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

/** 单击按钮打开面板（内部动态 import 真实 ChatPanel，需等待其解析完成） */
async function openPanel(shadow: ShadowRoot): Promise<HTMLIFrameElement> {
  const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
  firePointer(btn, 'pointerdown', 100, 100);
  firePointer(btn, 'pointerup', 100, 100);
  await vi.waitFor(() => {
    expect(shadow.querySelector('.panel-container iframe')).not.toBeNull();
  });
  return shadow.querySelector('.panel-container iframe') as HTMLIFrameElement;
}

/** 派发来自 iframe 的协议消息 */
function dispatchFromIframe(
  iframe: HTMLIFrameElement,
  data: Record<string, unknown>,
  source: Window = iframe.contentWindow as unknown as Window,
): void {
  window.dispatchEvent(new MessageEvent('message', { data, source }));
}

/** 发一条 status 并推进去抖窗口 */
function sendStatus(
  iframe: HTMLIFrameElement,
  state: string,
  reason?: 'complete' | 'error' | 'abort',
): void {
  dispatchFromIframe(iframe, {
    source: 'ba-floating-widget',
    type: 'status',
    state,
    ...(reason ? { reason } : {}),
  });
}

function advanceDebounce(): void {
  vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
}

describe('FloatingWidget 状态接线', () => {
  beforeEach(() => {
    widget = null;
    vi.stubGlobal('browser', createBrowserStub().browser);
    ConfigStore.resetInstance();
    document.documentElement.innerHTML = '';
    document.body.innerHTML = '';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      createCanvasContextStub(),
    );
  });

  afterEach(() => {
    // 先恢复真实定时器，确保 ChatPanel 的动画/加载定时器能被正常清理
    vi.useRealTimers();
    widget?.destroy();
    widget = null;
    ConfigStore.resetInstance();
    vi.restoreAllMocks();
  });

  it('状态经去抖后按映射更新引擎，且首次状态不超过 500ms', async () => {
    const updateSpy = vi.spyOn(GrokBot.prototype, 'update');
    const shadow = mountWithShadow();
    const iframe = await openPanel(shadow);
    updateSpy.mockClear();
    vi.useFakeTimers();

    sendStatus(iframe, 'running');
    expect(updateSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS - 1);
    expect(updateSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(updateSpy).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledWith({ state: 'working' });

    sendStatus(iframe, 'streaming');
    advanceDebounce();
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'thinking' });

    sendStatus(iframe, 'waitingConfirmation');
    advanceDebounce();
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'listening' });
  });

  it('连续快速切换只呈现最终状态', async () => {
    const updateSpy = vi.spyOn(GrokBot.prototype, 'update');
    const shadow = mountWithShadow();
    const iframe = await openPanel(shadow);
    updateSpy.mockClear();
    vi.useFakeTimers();

    sendStatus(iframe, 'running');
    vi.advanceTimersByTime(100);
    sendStatus(iframe, 'streaming');
    vi.advanceTimersByTime(100);
    sendStatus(iframe, 'waitingConfirmation');
    vi.advanceTimersByTime(100);

    expect(updateSpy).not.toHaveBeenCalled();

    advanceDebounce();
    expect(updateSpy).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledWith({ state: 'listening' });
  });

  it('任务从活跃状态回到 idle：先 celebrate，2 秒后回落 idle', async () => {
    const updateSpy = vi.spyOn(GrokBot.prototype, 'update');
    const shadow = mountWithShadow();
    const iframe = await openPanel(shadow);
    updateSpy.mockClear();
    vi.useFakeTimers();

    sendStatus(iframe, 'streaming');
    advanceDebounce();
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'thinking' });

    sendStatus(iframe, 'idle');
    advanceDebounce();
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'celebrate' });

    vi.advanceTimersByTime(DEFAULT_CELEBRATE_MS - 1);
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'celebrate' });

    vi.advanceTimersByTime(1);
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'idle' });
  });

  it('庆祝期间新状态立即中断庆祝', async () => {
    const updateSpy = vi.spyOn(GrokBot.prototype, 'update');
    const shadow = mountWithShadow();
    const iframe = await openPanel(shadow);
    updateSpy.mockClear();
    vi.useFakeTimers();

    sendStatus(iframe, 'streaming');
    advanceDebounce();
    sendStatus(iframe, 'idle');
    advanceDebounce();
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'celebrate' });

    sendStatus(iframe, 'running');
    // 立即切走，不等去抖
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'working' });

    vi.advanceTimersByTime(DEFAULT_CELEBRATE_MS * 2);
    expect(updateSpy).not.toHaveBeenCalledWith({ state: 'idle' });
  });

  it('close-request 关闭面板：立即回 idle、取消庆祝与待生效去抖', async () => {
    const updateSpy = vi.spyOn(GrokBot.prototype, 'update');
    const shadow = mountWithShadow();
    const iframe = await openPanel(shadow);
    updateSpy.mockClear();
    vi.useFakeTimers();

    sendStatus(iframe, 'streaming');
    advanceDebounce();
    sendStatus(iframe, 'idle');
    advanceDebounce();
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'celebrate' });

    // 庆祝中切到新状态后关闭：必须同时取消庆祝，避免 2 秒后又被拉回 idle
    sendStatus(iframe, 'running');
    dispatchFromIframe(iframe, { source: 'ba-floating-widget', type: 'close-request' });

    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'idle' });

    const callsAtClose = updateSpy.mock.calls.length;
    vi.advanceTimersByTime(DEFAULT_CELEBRATE_MS * 2);
    expect(updateSpy).toHaveBeenCalledTimes(callsAtClose);
  });

  it('再次点击按钮关闭面板：立即回 idle，并取消待生效的去抖', async () => {
    const updateSpy = vi.spyOn(GrokBot.prototype, 'update');
    const shadow = mountWithShadow();
    await openPanel(shadow);
    updateSpy.mockClear();
    vi.useFakeTimers();

    const iframe = shadow.querySelector('.panel-container iframe') as HTMLIFrameElement;
    sendStatus(iframe, 'running');
    advanceDebounce();
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'working' });

    // 去抖窗口内收到下一个状态，随后立即关闭面板
    sendStatus(iframe, 'streaming');

    const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
    firePointer(btn, 'pointerdown', 100, 100);
    firePointer(btn, 'pointerup', 100, 100);

    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'idle' });

    advanceDebounce();
    expect(updateSpy).not.toHaveBeenCalledWith({ state: 'thinking' });
  });

  it('error 结束不庆祝，立即回 idle', async () => {
    const updateSpy = vi.spyOn(GrokBot.prototype, 'update');
    const shadow = mountWithShadow();
    const iframe = await openPanel(shadow);
    updateSpy.mockClear();
    vi.useFakeTimers();

    sendStatus(iframe, 'running');
    advanceDebounce();
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'working' });

    sendStatus(iframe, 'idle', 'error');
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'idle' });

    const callsAtError = updateSpy.mock.calls.length;
    vi.advanceTimersByTime(DEFAULT_CELEBRATE_MS * 2);
    expect(updateSpy).toHaveBeenCalledTimes(callsAtError);
    expect(updateSpy).not.toHaveBeenCalledWith({ state: 'celebrate' });
  });

  it('abort 结束不庆祝，立即回 idle', async () => {
    const updateSpy = vi.spyOn(GrokBot.prototype, 'update');
    const shadow = mountWithShadow();
    const iframe = await openPanel(shadow);
    updateSpy.mockClear();
    vi.useFakeTimers();

    sendStatus(iframe, 'streaming');
    advanceDebounce();
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'thinking' });

    sendStatus(iframe, 'idle', 'abort');
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'idle' });
    expect(updateSpy).not.toHaveBeenCalledWith({ state: 'celebrate' });
  });

  it('伪造来源的 status 消息不改变引擎状态', async () => {
    const updateSpy = vi.spyOn(GrokBot.prototype, 'update');
    const shadow = mountWithShadow();
    const iframe = await openPanel(shadow);
    updateSpy.mockClear();
    vi.useFakeTimers();

    dispatchFromIframe(
      iframe,
      { source: 'ba-floating-widget', type: 'status', state: 'running' },
      window as unknown as Window,
    );
    advanceDebounce();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('未知 agent 状态回退为 idle（从活跃状态进入时按完成处理）', async () => {
    const updateSpy = vi.spyOn(GrokBot.prototype, 'update');
    const shadow = mountWithShadow();
    const iframe = await openPanel(shadow);
    updateSpy.mockClear();
    vi.useFakeTimers();

    sendStatus(iframe, 'running');
    advanceDebounce();

    sendStatus(iframe, 'somethingElse');
    advanceDebounce();
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'celebrate' });

    vi.advanceTimersByTime(DEFAULT_CELEBRATE_MS);
    expect(updateSpy).toHaveBeenLastCalledWith({ state: 'idle' });
  });

  it('Canvas 不可用（引擎为 null）时收到 status 消息不会抛错', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const shadow = mountWithShadow();
    const iframe = await openPanel(shadow);
    vi.useFakeTimers();

    expect(() => {
      sendStatus(iframe, 'running');
      advanceDebounce();
      sendStatus(iframe, 'idle', 'error');
    }).not.toThrow();
  });
});
