import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatPanel } from '../panel';
import { createI18nMock } from '@/test/i18n-mock';

// browser.runtime.getURL 需要在模块首次加载前准备好。
// widget.ts 通过 vi.mock 隔离并自行 stub browser，panel.ts 直接使用真实全局 browser。
vi.stubGlobal('browser', {
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
  },
  i18n: createI18nMock(),
});

/** 创建容器并实例化 ChatPanel（默认右侧） */
function setupPanel(side: 'left' | 'right' = 'right') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const panel = new ChatPanel(container, side);
  return { container, panel };
}

describe('ChatPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('状态与幂等', () => {
    it('初始 isOpen 为 false', () => {
      const { panel } = setupPanel();
      expect(panel.isOpen).toBe(false);
    });

    it('open() 打开面板：isOpen=true、display=block、生成 iframe 并设置定位', () => {
      const { container, panel } = setupPanel();
      panel.open();

      expect(panel.isOpen).toBe(true);
      expect(container.style.display).toBe('block');
      expect(container.querySelector('iframe')).not.toBeNull();

      // positionContainer 设置的定位样式
      expect(container.style.position).toBe('fixed');
      // 必须低于 .float-btn（2147483647），否则面板覆盖按钮区域，
      // 「再点按钮关闭面板」不可达（见 widget.ts 的 .float-btn / .panel-container）
      expect(container.style.zIndex).toBe('2147483646');
      expect(container.style.width).toBe('420px');
      // 右侧：right=0（jsdom 序列化为 0px），初始 transform 为滑出状态
      expect(container.style.right).toBe('0px');
      expect(container.style.transform).toBe('translateX(110%)');
    });

    it('open() 幂等：重复调用不会创建多个 iframe，也不会覆盖滑入动画状态', () => {
      const { container, panel } = setupPanel();
      panel.open();
      panel.open();
      panel.open();

      expect(panel.isOpen).toBe(true);
      expect(container.querySelectorAll('iframe').length).toBe(1);
    });

    it('toggle()：关闭态打开，打开态关闭', () => {
      const { panel } = setupPanel();
      panel.toggle();
      expect(panel.isOpen).toBe(true);

      panel.toggle();
      expect(panel.isOpen).toBe(false);
    });

    it('close() 幂等：未打开时 close 无副作用', () => {
      const { container, panel } = setupPanel();
      panel.close();
      expect(panel.isOpen).toBe(false);
      expect(container.style.display).toBe('');
      expect(container.style.transform).toBe('');

      panel.close();
      expect(panel.isOpen).toBe(false);
    });

    it('close() 触发滑出动画：transform 按 side 计算，动画结束后隐藏 display=none', () => {
      const { container, panel } = setupPanel('left');
      panel.open();
      // 模拟下一帧滑入动画
      container.dispatchEvent(new Event('transitionend'));

      panel.close();
      expect(panel.isOpen).toBe(false);
      // 左侧面板向左滑出
      expect(container.style.transform).toBe('translateX(-110%)');
      expect(container.style.transition).toContain('250ms');
      // 尚未触发 transitionend，面板仍可见
      expect(container.style.display).toBe('block');

      // 触发动画结束 → 隐藏
      container.dispatchEvent(new Event('transitionend'));
      expect(container.style.display).toBe('none');
    });

    it('close() 关闭后 isOpen=false，重复 close 保持无副作用', () => {
      const { container, panel } = setupPanel('right');
      panel.open();
      container.dispatchEvent(new Event('transitionend')); // 模拟滑入完成

      panel.close();
      expect(panel.isOpen).toBe(false);
      // 右侧面板向右滑出
      expect(container.style.transform).toBe('translateX(110%)');

      // 重复 close 不再改变样式
      panel.close();
      expect(container.style.transform).toBe('translateX(110%)');
      expect(container.style.display).toBe('block');
    });
  });

  describe('懒加载 iframe', () => {
    it('首次 open 注入 iframe，src 指向 sidepanel.html?embedded=1，含 sandbox/allow 属性', () => {
      const { container, panel } = setupPanel();
      // 构造前不应存在 iframe
      expect(container.querySelector('iframe')).toBeNull();

      panel.open();
      const iframe = container.querySelector('iframe') as HTMLIFrameElement;
      expect(iframe).not.toBeNull();
      expect(iframe.src).toBe('chrome-extension://test/sidepanel.html?embedded=1');
      expect(iframe.getAttribute('title')).toBe('AI 助手');
      expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
      expect(iframe.getAttribute('allow')).toContain('clipboard-read');
    });

    it('iframe 填满容器样式（width/height/border）', () => {
      const { container, panel } = setupPanel();
      panel.open();
      const iframe = container.querySelector('iframe') as HTMLIFrameElement;
      expect(iframe.style.width).toBe('100%');
      expect(iframe.style.height).toBe('100%');
      // jsdom 无法按 shorthandle 序列化 border:none，回退断言 border-style
      expect(iframe.style.borderStyle).toBe('none');
    });
  });

  describe('load 事件与超时降级', () => {
    it('iframe load 事件清除超时：之后不再触发降级提示', () => {
      vi.useFakeTimers();
      const { container, panel } = setupPanel();
      panel.open();
      const iframe = container.querySelector('iframe') as HTMLIFrameElement;

      // load 到达 → 清除超时定时器
      iframe.dispatchEvent(new Event('load'));
      vi.advanceTimersByTime(6000);
      expect(container.textContent).not.toContain('加载失败，请稍后重试');
      expect(container.querySelectorAll('div').length).toBe(0);
    });

    it('超时未加载时降级：插入错误提示并标记 loaded，仅一次', () => {
      vi.useFakeTimers();
      const { container, panel } = setupPanel();
      panel.open();

      // 仅推进 4999ms：尚未到超时，无降级提示
      vi.advanceTimersByTime(4999);
      expect(container.querySelectorAll('div').length).toBe(0);

      vi.advanceTimersByTime(1);
      expect(container.textContent).toContain('加载失败，请稍后重试');

      // 再次推进不会重复插入（loaded 已被标记）
      vi.advanceTimersByTime(LOAD_TIMEOUT_GUARD);
      expect(container.querySelectorAll('div').length).toBe(1);
    });

    it('destroy 清除超时定时器：destroy 后超时不再降级', () => {
      vi.useFakeTimers();
      const { container, panel } = setupPanel();
      panel.open();
      panel.destroy();

      vi.advanceTimersByTime(6000);
      expect(container.querySelector('div')).toBeNull();
    });
  });

  describe('window message 处理', () => {
    it('收到合法 close-request（source=iframe.contentWindow）时关闭面板', () => {
      const { container, panel } = setupPanel();
      panel.open();
      expect(panel.isOpen).toBe(true);

      const iframe = container.querySelector('iframe') as HTMLIFrameElement;
      const cw = iframe.contentWindow as unknown;
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'ba-floating-widget', type: 'close-request' },
          source: cw as Window,
        }),
      );
      expect(panel.isOpen).toBe(false);
    });

    it('忽略非 iframe source 的消息', () => {
      const { container, panel } = setupPanel();
      panel.open();
      const iframe = container.querySelector('iframe') as HTMLIFrameElement;
      const cw = iframe.contentWindow as unknown;

      // source 不匹配（真实 window 而非 iframe.contentWindow）
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'ba-floating-widget', type: 'close-request' },
          source: window as unknown as Window,
        }),
      );
      expect(panel.isOpen).toBe(true);

      // data 非对象 / source 字段不匹配
      window.dispatchEvent(
        new MessageEvent('message', { data: 'foo', source: cw as Window }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'other-source', type: 'close-request' },
          source: cw as Window,
        }),
      );
      expect(panel.isOpen).toBe(true);
    });

    it('message 事件透传：非 close-request 类型不触发关闭', () => {
      const { container, panel } = setupPanel();
      panel.open();
      const iframe = container.querySelector('iframe') as HTMLIFrameElement;
      const cw = iframe.contentWindow as unknown;

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'ba-floating-widget', type: 'other' },
          source: cw as Window,
        }),
      );
      expect(panel.isOpen).toBe(true);
    });
  });

  describe('destroy / cleanup', () => {
    it('destroy 移除 iframe 并清理 window message 监听', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { container, panel } = setupPanel();
      panel.open();
      const messageAdds = addSpy.mock.calls.filter((c) => c[0] === 'message').length;
      expect(messageAdds).toBe(1);

      panel.destroy();
      expect(container.querySelector('iframe')).toBeNull();
      expect(panel.isOpen).toBe(false);

      const messageRemoves = removeSpy.mock.calls.filter((c) => c[0] === 'message').length;
      expect(messageRemoves).toBe(messageAdds);

      // destroy 后再触发消息（无任何监听）不会抛错
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'ba-floating-widget', type: 'close-request' },
          source: window as unknown as Window,
        }),
      );
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('destroy 后再次 open 可重新初始化（新 iframe）', () => {
      const { container, panel } = setupPanel();
      panel.open();
      expect(container.querySelectorAll('iframe').length).toBe(1);

      panel.destroy();
      panel.open();
      expect(container.querySelectorAll('iframe').length).toBe(1);
      expect(panel.isOpen).toBe(true);
    });
  });
});

// 测试中用到的超时兜底常量（与 panel.ts 的 LOAD_TIMEOUT 保持一致）
const LOAD_TIMEOUT_GUARD = 5000;
