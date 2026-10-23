import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FloatingWidget } from '../widget';
import { ConfigStore } from '@/shared/storage/config-store';
import { DEFAULT_ACCENT_COLOR } from '@/shared/accent-palette';
import type { FloatingButtonSettings } from '@/shared/types/storage';
import { HOSTNAME, baseSettings, createBrowserStub } from './helpers/widget-harness';

// 只关心传给引擎的主题参数，隔离真实 Canvas 引擎。
const { ctorMock, updateMock, destroyMock } = vi.hoisted(() => ({
  ctorMock: vi.fn(),
  updateMock: vi.fn(),
  destroyMock: vi.fn(),
}));

vi.mock('../grokbot', () => ({
  GrokBot: class {
    constructor(_canvas: HTMLCanvasElement, init: unknown) {
      ctorMock(init);
    }
    update(patch: unknown): void {
      updateMock(patch);
    }
    destroy(): void {
      destroyMock();
    }
  },
}));

const EYE_COLOR = '#fff7ed';

let currentBrowser: ReturnType<typeof createBrowserStub>;
let widget: FloatingWidget | null = null;

function mountWidget(accentColor?: string, settings: FloatingButtonSettings = baseSettings): FloatingWidget {
  widget = new FloatingWidget(settings, HOSTNAME, accentColor);
  widget.mount();
  return widget;
}

/** ConfigStore.onChange 注册到 browser.storage.onChanged 的原始 handler */
function storageChangeHandler(): (changes: Record<string, { newValue?: unknown }>) => void {
  const calls = currentBrowser.browser.storage.onChanged.addListener.mock.calls;
  return calls[calls.length - 1]![0] as (changes: Record<string, { newValue?: unknown }>) => void;
}

describe('FloatingWidget 主色主题', () => {
  beforeEach(() => {
    ctorMock.mockClear();
    updateMock.mockClear();
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
    vi.restoreAllMocks();
  });

  it('构造 GrokBot 时使用传入主色作为 bodyColor，眼睛固定暖白', () => {
    mountWidget('#2563eb');

    expect(ctorMock).toHaveBeenCalledTimes(1);
    expect(ctorMock.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        theme: { bodyColor: '#2563eb', eyeColor: EYE_COLOR },
      }),
    );
  });

  it('未提供主色时使用默认暖橙', () => {
    mountWidget();

    expect(ctorMock.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        theme: { bodyColor: DEFAULT_ACCENT_COLOR, eyeColor: EYE_COLOR },
      }),
    );
  });

  it('订阅 preferences 变更并热更新 bot 主题', () => {
    mountWidget('#2563eb');

    storageChangeHandler()({
      preferences: {
        newValue: { theme: 'system', sidebarExpanded: true, reasoningAutoExpand: false, accentColor: '#059669' },
      },
    });

    expect(updateMock).toHaveBeenCalledWith({
      theme: { bodyColor: '#059669', eyeColor: EYE_COLOR },
    });
  });

  it('配置中的主色非法时回退默认暖橙', () => {
    mountWidget('#2563eb');

    storageChangeHandler()({
      preferences: { newValue: { accentColor: 'not-a-color' } },
    });

    expect(updateMock).toHaveBeenCalledWith({
      theme: { bodyColor: DEFAULT_ACCENT_COLOR, eyeColor: EYE_COLOR },
    });
  });

  it('忽略与 preferences 无关的变更', () => {
    mountWidget();

    storageChangeHandler()({ floatingButtonSettings: { newValue: baseSettings } });

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('destroy 时退订 preferences 变更', () => {
    const instance = mountWidget();
    const handler = storageChangeHandler();

    instance.destroy();
    widget = null;

    expect(currentBrowser.browser.storage.onChanged.removeListener).toHaveBeenCalledWith(handler);
  });

  it('重复 destroy 不会重复退订', () => {
    const instance = mountWidget();

    instance.destroy();
    widget = null;
    instance.destroy();

    expect(currentBrowser.browser.storage.onChanged.removeListener).toHaveBeenCalledTimes(1);
  });
});
