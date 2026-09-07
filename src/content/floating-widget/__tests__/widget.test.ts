import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FloatingWidget } from '../widget';
import { ConfigStore } from '@/shared/storage/config-store';
import { createI18nMock } from '@/test/i18n-mock';
import type { FloatingButtonSettings } from '@/shared/types/storage';

// ChatPanel 通过动态 import 延迟加载；用 mock 隔离 iframe 依赖并记录调用。
const { toggleMock, ctorMock, destroyMock } = vi.hoisted(() => ({
  toggleMock: vi.fn(),
  ctorMock: vi.fn(),
  destroyMock: vi.fn(),
}));

vi.mock('../panel', () => ({
  ChatPanel: class {
    constructor(container: HTMLElement, side: 'left' | 'right') {
      ctorMock(container, side);
    }
    toggle(): void {
      toggleMock();
    }
    destroy(): void {
      destroyMock();
    }
  },
}));

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
    local,
    storage,
  };
}

let currentBrowser: ReturnType<typeof createBrowserStub>;
let widget: FloatingWidget | null = null;

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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

describe('FloatingWidget', () => {
  beforeEach(() => {
    toggleMock.mockClear();
    ctorMock.mockClear();
    destroyMock.mockClear();
    widget = null;
    currentBrowser = createBrowserStub();
    vi.stubGlobal('browser', currentBrowser.browser);
    ConfigStore.resetInstance();
    document.documentElement.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    widget?.destroy();
    widget = null;
    ConfigStore.resetInstance();
    vi.useRealTimers();
  });

  describe('mount / DOM 构建', () => {
    it('mount 建立 shadow host 并渲染按钮/菜单/面板容器', () => {
      const shadow = mountWithShadow();

      const host = document.getElementById('ba-floating-host');
      expect(host).not.toBeNull();
      expect(host?.shadowRoot).toBeNull(); // closed shadow

      expect(shadow.querySelector('style')).not.toBeNull();
      expect(shadow.querySelector('button.float-btn')).not.toBeNull();
      expect(shadow.querySelector('div.context-menu')).not.toBeNull();
      expect(shadow.querySelector('div.panel-container')).not.toBeNull();
    });

    it('mount 幂等：重复调用不重复注入 host', () => {
      mountWithShadow();
      widget?.mount();

      expect(document.querySelectorAll('#ba-floating-host').length).toBe(1);
    });

    it('按钮包含 aria-label / title 与 logo 图片', () => {
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      expect(btn.getAttribute('aria-label')).toBe('打开聊天');
      expect(btn.getAttribute('title')).toBe('打开聊天');
      expect(btn.querySelector('img')).not.toBeNull();
      expect(currentBrowser.browser.runtime.getURL).toHaveBeenCalledWith('logo-48.png');
    });

    it('图片加载失败时降级为文字 BA', () => {
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      const img = btn.querySelector('img') as HTMLImageElement;
      img.dispatchEvent(new Event('error'));
      expect(btn.querySelector('span')?.textContent).toBe('BA');
      expect(btn.querySelector('img')).toBeNull();
    });

    it('runtime.getURL 抛错时图片回退到占位 SVG（扩展上下文失效场景）', () => {
      currentBrowser.browser.runtime.getURL.mockImplementation(() => {
        throw new Error('extension context invalidated');
      });
      const shadow = mountWithShadow();
      const img = shadow.querySelector('button.float-btn img') as HTMLImageElement;
      expect(img.src.startsWith('data:image/svg+xml')).toBe(true);
    });

    it('阻止按钮 dragstart 默认行为', () => {
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      const notPrevented = btn.dispatchEvent(new Event('dragstart', { cancelable: true }));
      expect(notPrevented).toBe(false);
    });
  });

  describe('初始定位 / apply', () => {
    it('settings.position 为 null 时使用默认值（右侧、top=200）', () => {
      const shadow = mountWithShadow(baseSettings);
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      expect(btn.style.right).toBe('0px'); // jsdom 将 0 序列化为 0px
      expect(btn.style.left).toBe('auto');
      expect(btn.style.top).toBe('200px');
    });

    it('settings.position 指定时应用保存的位置', () => {
      const shadow = mountWithShadow({
        ...baseSettings,
        position: { side: 'left', top: 120 },
      });
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      expect(btn.style.left).toBe('0px');
      expect(btn.style.right).toBe('auto');
      expect(btn.style.top).toBe('120px');
    });

    it('apply 更新位置并返回 true', () => {
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      const alive = widget?.apply({
        ...baseSettings,
        position: { side: 'left', top: 88 },
      });
      expect(alive).toBe(true);
      expect(btn.style.left).toBe('0px');
      expect(btn.style.top).toBe('88px');
    });

    it('apply 位置为 null（清除保存位置）时保持当前定位返回 true', () => {
      const shadow = mountWithShadow({
        ...baseSettings,
        position: { side: 'left', top: 120 },
      });
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      const alive = widget?.apply(baseSettings);
      expect(alive).toBe(true);
      expect(btn.style.left).toBe('0px'); // 未重置，仍为上次定位
    });

    it('apply 禁用/命中黑名单时销毁 widget 并返回 false', () => {
      mountWithShadow();
      expect(document.getElementById('ba-floating-host')).not.toBeNull();

      const alive = widget?.apply({ ...baseSettings, enabled: false });
      expect(alive).toBe(false);
      expect(document.getElementById('ba-floating-host')).toBeNull();
    });
  });

  describe('destroy', () => {
    it('destroy 移除 host 并清理已创建的 ChatPanel', async () => {
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      // 先创建面板（handleTogglePanel 内部动态 import，需等待微任务）
      firePointer(btn, 'pointerdown', 100, 100);
      firePointer(btn, 'pointerup', 100, 100);
      await flush();

      widget?.destroy();
      expect(document.getElementById('ba-floating-host')).toBeNull();
      expect(destroyMock).toHaveBeenCalledTimes(1);

      // 可重复调用
      widget?.destroy();
    });

    it('destroy 清除进行中的长按定时器', () => {
      vi.useFakeTimers();
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      firePointer(btn, 'pointerdown', 100, 100);
      widget?.destroy();
      // 若定时器未清理，此处会执行 showMenuAtButton（menu 已随 host 移除）
      expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    });
  });

  describe('点击切换面板', () => {
    it('单击按钮切换面板：懒创建 ChatPanel 并 toggle', async () => {
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      firePointer(btn, 'pointerdown', 100, 100);
      firePointer(btn, 'pointerup', 100, 100);
      await flush();

      expect(ctorMock).toHaveBeenCalledTimes(1);
      const [container, side] = ctorMock.mock.calls[0] as [HTMLDivElement, 'left' | 'right'];
      expect(container.className).toBe('panel-container');
      expect(side).toBe('right');
      expect(toggleMock).toHaveBeenCalledTimes(1);

      // 再次单击 → 关闭
      firePointer(btn, 'pointerdown', 100, 100);
      firePointer(btn, 'pointerup', 100, 100);
      await flush();
      expect(ctorMock).toHaveBeenCalledTimes(1); // 复用实例
      expect(toggleMock).toHaveBeenCalledTimes(2);
    });

    it('面板按当前吸附侧创建（左侧）', async () => {
      const shadow = mountWithShadow({
        ...baseSettings,
        position: { side: 'left', top: 100 },
      });
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      firePointer(btn, 'pointerdown', 100, 100);
      firePointer(btn, 'pointerup', 100, 100);
      await flush();

      const [, side] = ctorMock.mock.calls[0] as [HTMLDivElement, 'left' | 'right'];
      expect(side).toBe('left');
    });

    it('销毁后再次挂载可重新创建面板', async () => {
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      firePointer(btn, 'pointerdown', 100, 100);
      firePointer(btn, 'pointerup', 100, 100);
      await flush();
      expect(ctorMock).toHaveBeenCalledTimes(1);

      widget?.destroy();
      toggleMock.mockClear();
      ctorMock.mockClear();
      destroyMock.mockClear();

      const shadow2 = mountWithShadow();
      const btn2 = shadow2.querySelector('button.float-btn') as HTMLButtonElement;
      firePointer(btn2, 'pointerdown', 100, 100);
      firePointer(btn2, 'pointerup', 100, 100);
      await flush();
      expect(ctorMock).toHaveBeenCalledTimes(1);
      expect(toggleMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('拖拽吸附', () => {
    it('拖拽到右侧松手 → 计算吸附位置并触发 onPositionChange', async () => {
      const onPositionChange = vi.fn();
      const shadow = mountWithShadow();
      widget?.setOnPositionChange(onPositionChange);
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      firePointer(btn, 'pointerdown', 200, 100);
      expect(btn.classList.contains('dragging')).toBe(true);
      // 移动超过点击阈值 → 取消长按，进入拖拽
      firePointer(btn, 'pointermove', 900, 400);
      firePointer(btn, 'pointerup', 900, 400);
      await flush();

      expect(onPositionChange).toHaveBeenCalledWith({ side: 'right', top: 376 });
      expect(btn.style.right).toBe('0px');
      expect(btn.style.top).toBe('376px');
      expect(toggleMock).not.toHaveBeenCalled();
    });

    it('拖拽到左侧松手 → 吸附左侧并触发 onPositionChange', () => {
      const onPositionChange = vi.fn();
      const shadow = mountWithShadow();
      widget?.setOnPositionChange(onPositionChange);
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      firePointer(btn, 'pointerdown', 900, 100);
      firePointer(btn, 'pointermove', 100, 400);
      firePointer(btn, 'pointerup', 100, 400);

      expect(onPositionChange).toHaveBeenCalledWith({ side: 'left', top: 376 });
      expect(btn.style.left).toBe('0px');
      expect(btn.style.top).toBe('376px');
      expect(btn.classList.contains('dragging')).toBe(false);
      expect(toggleMock).not.toHaveBeenCalled();
    });

    it('左侧吸附时拖拽过程应用瞬时 translate（transform 含偏移量）', () => {
      const shadow = mountWithShadow({
        ...baseSettings,
        position: { side: 'left', top: 200 },
      });
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      firePointer(btn, 'pointerdown', 100, 100);
      firePointer(btn, 'pointermove', 150, 130);
      expect(btn.style.left).toBe('0px');
      expect(btn.style.top).toBe('200px');
      expect(btn.style.transform).toBe('translate(50px, 30px)');

      // 拖拽结束切回吸附态（左侧 → left=0）
      firePointer(btn, 'pointerup', 150, 130);
      expect(btn.style.left).toBe('0px');
      expect(btn.style.transform).toBe('none');
    });
  });

  describe('长按 / 右键菜单', () => {
    it('长按 500ms 弹出菜单（未超过位移阈值）', () => {
      vi.useFakeTimers();
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      const menu = shadow.querySelector('div.context-menu') as HTMLDivElement;

      firePointer(btn, 'pointerdown', 100, 100);
      expect(menu.classList.contains('visible')).toBe(false);

      vi.advanceTimersByTime(499);
      expect(menu.classList.contains('visible')).toBe(false);

      vi.advanceTimersByTime(1);
      expect(menu.classList.contains('visible')).toBe(true);
    });

    it('移动超过阈值后长按被取消', () => {
      vi.useFakeTimers();
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      const menu = shadow.querySelector('div.context-menu') as HTMLDivElement;

      firePointer(btn, 'pointerdown', 100, 100);
      // 500ms 内产生位移 → isClick=false 取消长按定时器
      firePointer(btn, 'pointermove', 200, 100);
      vi.advanceTimersByTime(1000);
      expect(menu.classList.contains('visible')).toBe(false);
    });

    it('右键 contextmenu 弹出菜单并 preventDefault', () => {
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      const menu = shadow.querySelector('div.context-menu') as HTMLDivElement;

      const ev = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
      btn.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      expect(menu.classList.contains('visible')).toBe(true);
    });

    it('菜单位置：左侧吸附时显示在按钮右侧', () => {
      const shadow = mountWithShadow({
        ...baseSettings,
        position: { side: 'left', top: 200 },
      });
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      const menu = shadow.querySelector('div.context-menu') as HTMLDivElement;

      btn.dispatchEvent(new MouseEvent('contextmenu', { cancelable: true }));
      // getBoundingClientRect 在 jsdom 返回全 0 → left = 0 + 8
      expect(menu.style.left).toBe('8px');
      expect(menu.style.right).toBe('auto');
      expect(menu.style.top).toBe('8px');
    });

    it('点击菜单外部（document capture click）隐藏菜单', () => {
      const outside = document.createElement('div');
      document.body.appendChild(outside);

      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      const menu = shadow.querySelector('div.context-menu') as HTMLDivElement;

      btn.dispatchEvent(new MouseEvent('contextmenu', { cancelable: true }));
      expect(menu.classList.contains('visible')).toBe(true);

      outside.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      expect(menu.classList.contains('visible')).toBe(false);
    });
  });

  describe('在此站点隐藏（handleHide）', () => {
    it('点击菜单项 → 写入黑名单并销毁 widget', async () => {
      // 预置存储，验证 read-modify-write 不被覆盖（直接写 backing store，绕开 mock 的 1 参 API）
      currentBrowser.storage.floatingButtonSettings = {
        enabled: true,
        position: { side: 'right', top: 100 },
        blacklist: ['already.com'],
      };

      const shadow = mountWithShadow();
      const item = shadow.querySelector('button.context-menu-item') as HTMLButtonElement;
      item.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
      await flush();

      expect(currentBrowser.local.set).toHaveBeenLastCalledWith({
        floatingButtonSettings: {
          enabled: true,
          position: { side: 'right', top: 100 },
          blacklist: ['already.com', HOSTNAME],
        },
      });
      expect(document.getElementById('ba-floating-host')).toBeNull();
    });
  });
});
