import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FloatingWidget } from '../widget';
import { GrokBot } from '../grokbot';
import { ConfigStore } from '@/shared/storage/config-store';
import type { FloatingButtonSettings } from '@/shared/types/storage';
import {
  HOSTNAME,
  baseSettings,
  createBrowserStub,
  createCanvasContextStub,
  firePointer,
  mountWidget,
  patchPointerCapture,
} from './helpers/widget-harness';

// ChatPanel 通过动态 import 延迟加载；用 mock 隔离 iframe 依赖并记录调用。
const { toggleMock, ctorMock, destroyMock, setWidthMock } = vi.hoisted(() => ({
  toggleMock: vi.fn(),
  ctorMock: vi.fn(),
  destroyMock: vi.fn(),
  setWidthMock: vi.fn(),
}));

vi.mock('../panel', () => ({
  ChatPanel: class {
    constructor(
      container: HTMLElement,
      side: 'left' | 'right',
      _onStatus?: unknown,
      _onClose?: unknown,
      width?: number,
    ) {
      ctorMock(container, side, width);
    }
    toggle(): void {
      toggleMock();
    }
    setWidth(width: number): void {
      setWidthMock(width);
    }
    destroy(): void {
      destroyMock();
    }
  },
}));

let currentBrowser: ReturnType<typeof createBrowserStub>;
let widget: FloatingWidget | null = null;

patchPointerCapture();

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** 兼容既有调用点：挂载后更新模块级 widget，便于 afterEach 统一销毁 */
function mountWithShadow(settings: FloatingButtonSettings = baseSettings): ShadowRoot {
  const mounted = mountWidget(settings);
  widget = mounted.widget;
  return mounted.shadow;
}

describe('FloatingWidget', () => {
  beforeEach(() => {
    toggleMock.mockClear();
    ctorMock.mockClear();
    destroyMock.mockClear();
    setWidthMock.mockClear();
    widget = null;
    currentBrowser = createBrowserStub();
    vi.stubGlobal('browser', currentBrowser.browser);
    ConfigStore.resetInstance();
    document.documentElement.innerHTML = '';
    document.body.innerHTML = '';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      createCanvasContextStub(),
    );
  });

  afterEach(() => {
    widget?.destroy();
    widget = null;
    ConfigStore.resetInstance();
    vi.useRealTimers();
    vi.restoreAllMocks();
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

    it('按钮 z-index 严格大于面板，保证「再点按钮关闭面板」可达', () => {
      const shadow = mountWithShadow();

      // 面板全高且与按钮同侧；若同级或更高会覆盖按钮区域，
      // 使第二次点击落在面板上（spec §7.3 要求再点按钮可关闭）
      const css = shadow.querySelector('style')?.textContent ?? '';
      const btnZ = Number(/\.float-btn\s*\{[^}]*z-index:\s*(\d+)/s.exec(css)?.[1]);
      const panelZ = Number(/\.panel-container\s*\{[^}]*z-index:\s*(\d+)/s.exec(css)?.[1]);

      expect(Number.isFinite(btnZ)).toBe(true);
      expect(Number.isFinite(panelZ)).toBe(true);
      expect(btnZ).toBeGreaterThan(panelZ);
    });

    it('mount 幂等：重复调用不重复注入 host', () => {
      mountWithShadow();
      widget?.mount();

      expect(document.querySelectorAll('#ba-floating-host').length).toBe(1);
    });

    it('按钮包含 aria-label / title 与 60px canvas 头像', () => {
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      expect(btn.getAttribute('aria-label')).toBe('打开聊天');
      expect(btn.getAttribute('title')).toBe('打开聊天');

      // 不再使用 logo 图片，头像由 canvas 上的 GrokBot 引擎绘制
      expect(btn.querySelector('img')).toBeNull();
      const canvas = btn.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas).not.toBeNull();
      expect(canvas.getAttribute('aria-label')).toBe('打开聊天');
      expect(canvas.width).toBe(60);
      expect(canvas.height).toBe(60);
      expect(canvas.style.width).toBe('60px');
      expect(canvas.style.height).toBe('60px');
    });

    it('CSS 中按钮与 canvas 的尺寸均为 60px', () => {
      const shadow = mountWithShadow();
      const css = shadow.querySelector('style')?.textContent ?? '';
      const btnRule = /\.float-btn\s*\{([^}]*)\}/s.exec(css)?.[1] ?? '';
      const canvasRule = /\.float-btn canvas\s*\{([^}]*)\}/s.exec(css)?.[1] ?? '';

      expect(btnRule).toMatch(/width:\s*60px/);
      expect(btnRule).toMatch(/height:\s*60px/);
      expect(canvasRule).toMatch(/width:\s*60px/);
      expect(canvasRule).toMatch(/height:\s*60px/);
    });

    it('Canvas 2D 不可用时安全降级：按钮仍可点击', async () => {
      // 覆盖无 Canvas 实现的宿主环境（引擎构造函数会抛错）
      vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      expect(btn.querySelector('canvas')).not.toBeNull();
      // 兜底样式保证按钮仍然可见
      expect(btn.classList.contains('avatar-unavailable')).toBe(true);
      firePointer(btn, 'pointerdown', 100, 100);
      firePointer(btn, 'pointerup', 100, 100);
      await flush();
      expect(toggleMock).toHaveBeenCalledTimes(1);
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

    // 回归：保存位置来自更高视口或异常配置，窗口变矮/刷新后可能越界，
    // 直接渲染会让按钮落在视口外、无法点击。
    it('保存的 top 超出视口时 mount 后仍位于视口内，且不回写配置', () => {
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(720);
      const shadow = mountWithShadow({
        ...baseSettings,
        position: { side: 'right', top: 2000 },
      });
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      // 720 - 60（按钮高）- 8（边距）
      expect(btn.style.top).toBe('652px');
      expect(btn.style.right).toBe('0px');
      // 仅修正渲染位置，不静默改写持久化设置
      expect(currentBrowser.local.set).not.toHaveBeenCalled();
    });

    it('apply 传入超出视口的 top 时渲染位置被 clamp 到视口内', () => {
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(720);
      const shadow = mountWithShadow({
        ...baseSettings,
        position: { side: 'left', top: 120 },
      });
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      const alive = widget?.apply({
        ...baseSettings,
        position: { side: 'left', top: 2000 },
      });

      expect(alive).toBe(true);
      expect(btn.style.top).toBe('652px');
      expect(currentBrowser.local.set).not.toHaveBeenCalled();
    });

    it('保存位置越界时拖拽基准仍为 clamp 后的可见位置', () => {
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(720);
      const shadow = mountWithShadow({
        ...baseSettings,
        position: { side: 'right', top: 2000 },
      });
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      firePointer(btn, 'pointerdown', 100, 100);
      firePointer(btn, 'pointermove', 120, 130);

      // 基准 top 不得回落到越界的 2000，否则拖拽中按钮会跳出视口
      expect(btn.style.top).toBe('652px');
      expect(btn.style.transform).toBe('translate(20px, 30px)');
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
    it('destroy 停止头像引擎', () => {
      const engineDestroy = vi.spyOn(GrokBot.prototype, 'destroy');
      mountWithShadow();
      expect(engineDestroy).not.toHaveBeenCalled();

      widget?.destroy();
      expect(engineDestroy).toHaveBeenCalledTimes(1);
    });

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

    it('创建面板时传入当前配置的面板宽度', async () => {
      const shadow = mountWithShadow({ ...baseSettings, panelWidth: 600 });
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      firePointer(btn, 'pointerdown', 100, 100);
      firePointer(btn, 'pointerup', 100, 100);
      await flush();

      expect(ctorMock).toHaveBeenCalledTimes(1);
      const [, side, width] = ctorMock.mock.calls[0] as [HTMLDivElement, 'left' | 'right', number];
      expect(side).toBe('right');
      expect(width).toBe(600);
    });

    it('未配置面板宽度时向 ChatPanel 传入默认 420', async () => {
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      firePointer(btn, 'pointerdown', 100, 100);
      firePointer(btn, 'pointerup', 100, 100);
      await flush();

      const [, , width] = ctorMock.mock.calls[0] as [HTMLDivElement, 'left' | 'right', number];
      expect(width).toBe(420);
    });

    it('apply() 宽度变化且面板已创建 → 调用 setWidth 热更新', async () => {
      const shadow = mountWithShadow({ ...baseSettings, panelWidth: 420 });
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      firePointer(btn, 'pointerdown', 100, 100);
      firePointer(btn, 'pointerup', 100, 100);
      await flush();
      expect(ctorMock).toHaveBeenCalledTimes(1);

      const alive = widget?.apply({ ...baseSettings, panelWidth: 680 });

      expect(alive).toBe(true);
      expect(setWidthMock).toHaveBeenCalledWith(680);
      expect(ctorMock).toHaveBeenCalledTimes(1); // 不重建面板
    });

    it('apply() 宽度被移除（undefined）时回退默认 420', async () => {
      const shadow = mountWithShadow({ ...baseSettings, panelWidth: 600 });
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;

      firePointer(btn, 'pointerdown', 100, 100);
      firePointer(btn, 'pointerup', 100, 100);
      await flush();

      widget?.apply({ ...baseSettings, panelWidth: undefined });

      expect(setWidthMock).toHaveBeenCalledWith(420);
    });

    it('apply() 宽度未变化时不调用 setWidth', () => {
      mountWithShadow({ ...baseSettings, panelWidth: 520 });

      widget?.apply({ ...baseSettings, panelWidth: 520 });

      expect(setWidthMock).not.toHaveBeenCalled();
    });

    it('apply() 宽度变化但面板尚未创建时不调用 setWidth（下次创建生效）', () => {
      mountWithShadow({ ...baseSettings, panelWidth: 420 });

      widget?.apply({ ...baseSettings, panelWidth: 640 });

      expect(setWidthMock).not.toHaveBeenCalled();
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

      expect(onPositionChange).toHaveBeenCalledWith({ side: 'right', top: 370 });
      expect(btn.style.right).toBe('0px');
      expect(btn.style.top).toBe('370px');
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

      expect(onPositionChange).toHaveBeenCalledWith({ side: 'left', top: 370 });
      expect(btn.style.left).toBe('0px');
      expect(btn.style.top).toBe('370px');
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
          // ConfigStore.set 统一归一化：旧数据缺省宽度补齐为默认值
          panelWidth: 420,
        },
      });
      expect(document.getElementById('ba-floating-host')).toBeNull();
    });
  });

  describe('健壮性分支', () => {
    it('未按下拖拽时 pointermove / pointerup 不移动按钮', () => {
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      const before = btn.style.transform;

      firePointer(btn, 'pointermove', 400, 300);
      firePointer(btn, 'pointerup', 400, 300);

      expect(btn.style.transform).toBe(before);
    });

    it('Canvas 不可用时按钮兜底底色跟随主色变更', () => {
      vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
      const shadow = mountWithShadow();
      const btn = shadow.querySelector('button.float-btn') as HTMLButtonElement;
      // 降级时立即写入主色，避免透明按钮不可见
      expect(btn.style.background).toBe('rgb(194, 65, 12)');

      const calls = currentBrowser.browser.storage.onChanged.addListener.mock.calls;
      const handler = calls[calls.length - 1]![0] as (changes: Record<string, { newValue?: unknown }>) => void;
      handler({ preferences: { newValue: { accentColor: '#2563eb' } } });

      expect(btn.style.background).toBe('rgb(37, 99, 235)');
    });

    it('storage 监听注册失败时仍能挂载', () => {
      vi.spyOn(ConfigStore.prototype, 'onChange').mockImplementation(() => {
        throw new Error('storage unavailable');
      });

      expect(() => mountWithShadow()).not.toThrow();
    });
  });
});
