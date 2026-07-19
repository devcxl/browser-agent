/**
 * ChatPanel — iframe 面板管理器。
 *
 * 管理面板的打开/关闭生命周期：
 * - 首次 toggle() 时懒加载 iframe（src 指向 sidepanel.html?embedded=1）
 * - 滑入/滑出动画（transform translateX），250ms ease-out
 * - 监听 window.message 接收 sidepanel 的 close-request
 * - iframe load 超时降级处理
 */

import { getStrings } from './strings';
import type { SupportedLang } from './strings';

/** iframe 加载超时时间（ms） */
const LOAD_TIMEOUT = 5000;

/** 面板宽度（px） */
const PANEL_WIDTH = 420;

export class ChatPanel {
  private containerEl: HTMLElement;
  private iframe: HTMLIFrameElement | null = null;
  private side: 'left' | 'right';
  private _isOpen = false;
  private loaded = false;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private strings = getStrings('en');

  /** 清理函数引用 */
  private cleanupFns: Array<() => void> = [];

  constructor(containerEl: HTMLElement, side: 'left' | 'right' = 'right', lang?: string) {
    this.containerEl = containerEl;
    this.side = side;
    if (lang) {
      const supported = lang as SupportedLang;
      if (supported === 'zh-CN' || supported === 'en') {
        this.strings = getStrings(supported);
      }
    }
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  /** 切换打开/关闭状态 */
  toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /** 打开面板 */
  open(): void {
    if (this._isOpen) return;
    this._isOpen = true;

    // 首次打开 → 懒加载 iframe
    if (!this.iframe) {
      this.createIframe();
    }

    // 设置容器定位
    this.positionContainer();
    this.containerEl.style.display = 'block';

    // 触发滑入动画（下一帧执行，确保 display: block 生效）
    requestAnimationFrame(() => {
      this.containerEl.style.transition = 'transform 250ms ease-out';
      this.containerEl.style.transform = 'translateX(0)';
    });
  }

  /** 关闭面板 */
  close(): void {
    if (!this._isOpen) return;

    // 滑出动画
    this.containerEl.style.transition = 'transform 250ms ease-out';
    const translate = this.side === 'left' ? '-110%' : '110%';
    this.containerEl.style.transform = `translateX(${translate})`;

    // 动画结束后隐藏
    const onTransitionEnd = () => {
      this.containerEl.removeEventListener('transitionend', onTransitionEnd);
      this.containerEl.style.display = 'none';
    };
    this.containerEl.addEventListener('transitionend', onTransitionEnd, { once: true });

    this._isOpen = false;
  }

  /** 销毁：移除 iframe，清理事件 */
  destroy(): void {
    this.clearLoadTimer();

    // 清理 message listener
    for (const fn of this.cleanupFns) {
      fn();
    }
    this.cleanupFns = [];

    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    this.loaded = false;
    this._isOpen = false;
  }

  // ── 内部方法 ───────────────────────────────────────────

  private createIframe(): void {
    const iframe = document.createElement('iframe');
    iframe.src = browser.runtime.getURL('sidepanel.html') + '?embedded=1';
    iframe.setAttribute('title', this.strings.panelTitle);
    iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
    // 沙箱：允许脚本、表单，不允许顶层导航和弹窗
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups');

    this.containerEl.appendChild(iframe);
    this.iframe = iframe;

    // 监听 iframe load 事件（带超时）
    this.setupLoadHandler(iframe);

    // 监听 window.message（sidepanel 发送的 close-request）
    this.setupMessageListener(iframe);
  }

  private setupLoadHandler(iframe: HTMLIFrameElement): void {
    this.clearLoadTimer();

    const onLoad = () => {
      this.clearLoadTimer();
      this.loaded = true;
    };

    iframe.addEventListener('load', onLoad, { once: true });

    // 超时降级
    this.loadTimer = setTimeout(() => {
      if (!this.loaded) {
        // 显示降级提示
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          color: #999;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          text-align: center;
          padding: 24px;
          background: #fafafa;
        `;
        errorDiv.textContent = this.strings.loadError;
        this.containerEl.appendChild(errorDiv);

        // 标记为已加载（避免重复插入）
        this.loaded = true;
      }
    }, LOAD_TIMEOUT);
  }

  private setupMessageListener(iframe: HTMLIFrameElement): void {
    const handler = (event: MessageEvent) => {
      // 安全校验：来源必须是我们的 iframe
      if (event.source !== iframe.contentWindow) return;
      if (!event.data || typeof event.data !== 'object') return;

      const data = event.data as Record<string, unknown>;

      // 校验消息白名单
      if (data.source !== 'ba-floating-widget') return;

      if (data.type === 'close-request') {
        this.close();
      }
    };

    window.addEventListener('message', handler);
    this.cleanupFns.push(() => window.removeEventListener('message', handler));
  }

  private positionContainer(): void {
    const style = this.containerEl.style;
    style.position = 'fixed';
    style.top = '0';
    style.bottom = '0';
    style.width = `${PANEL_WIDTH}px`;
    style.maxWidth = '100vw';
    style.zIndex = '2147483647';
    style.background = '#ffffff';
    style.boxShadow = '0 0 40px rgba(0, 0, 0, 0.15)';

    if (this.side === 'left') {
      style.left = '0';
      style.right = 'auto';
      style.transform = 'translateX(-110%)';
    } else {
      style.right = '0';
      style.left = 'auto';
      style.transform = 'translateX(110%)';
    }

    // 确保 iframe 填满容器
    if (this.iframe) {
      this.iframe.style.width = '100%';
      this.iframe.style.height = '100%';
      this.iframe.style.border = 'none';
    }
  }

  private clearLoadTimer(): void {
    if (this.loadTimer) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
  }
}
