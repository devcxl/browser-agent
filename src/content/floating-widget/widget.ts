/**
 * FloatingWidget — 浮动控件 DOM 组装与交互。
 *
 * 在页面注入 Shadow DOM 宿主，内含：
 * - 圆形拖拽按钮（logo + aria-label）
 * - 右键/长按快捷菜单
 * - iframe 面板容器（委托 ChatPanel）
 *
 * 所有样式封装在 closed shadow root 中，与宿主页面隔离。
 */

import { isClick, resolveSide, clampTop } from './drag';
import { addToBlacklist, shouldMount } from './blacklist';
import { getStrings } from './strings';
import type { SupportedLang } from './strings';
import type { FloatingButtonSettings } from '@/shared/types/storage';
import { ConfigStore } from '@/shared/storage/config-store';

/** 按钮尺寸（px），与 drag.ts 中 clampTop 的 buttonSize 保持一致 */
const BUTTON_SIZE = 48;
/** 长按判定阈值（ms） */
const LONG_PRESS_DURATION = 500;
/** 菜单隐藏延迟（ms），让 click 事件有机会触发 */
const MENU_HIDE_DELAY = 150;

/** 默认吸附侧 */
const DEFAULT_SIDE: 'left' | 'right' = 'right';
/** 默认距顶部距离（px） */
const DEFAULT_TOP = 200;

/** 按钮定位接口 */
interface ButtonPosition {
  side: 'left' | 'right';
  top: number;
}

/** 内联 Shadow DOM CSS（约 120 行），零外部依赖 */
const SHADOW_CSS = /* css */ `
:host {
  all: initial;
  position: fixed;
  z-index: 2147483646;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  pointer-events: none;
}

.float-btn {
  all: unset;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${BUTTON_SIZE}px;
  height: ${BUTTON_SIZE}px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  transition: box-shadow 0.2s ease, transform 0.15s ease;
  position: fixed;
  overflow: hidden;
}

.float-btn:hover {
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.1);
  transform: scale(1.05);
}

.float-btn:active {
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05);
  transform: scale(0.97);
}

.float-btn img {
  width: ${BUTTON_SIZE}px;
  height: ${BUTTON_SIZE}px;
  display: block;
  pointer-events: none;
  -webkit-user-drag: none;
  user-select: none;
  object-fit: contain;
}

.float-btn.dragging {
  transition: none;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.1);
}

.context-menu {
  position: fixed;
  min-width: 140px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.06);
  padding: 4px;
  display: none;
  pointer-events: auto;
  z-index: 2147483647;
  animation: menu-fade-in 0.15s ease-out;
}

.context-menu.visible {
  display: block;
}

.context-menu-item {
  all: unset;
  display: block;
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #1a1a1a;
  box-sizing: border-box;
  white-space: nowrap;
}

.context-menu-item:hover {
  background: #f0f0f0;
}

.context-menu-item:active {
  background: #e0e0e0;
}

.panel-container {
  position: fixed;
  top: 0;
  bottom: 0;
  width: 420px;
  max-width: 100vw;
  background: #ffffff;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  display: none;
  z-index: 2147483647;
}

.panel-container iframe {
  width: 100%;
  height: 100%;
  border: none;
}

@keyframes menu-fade-in {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
`;

/**
 * 生成按钮定位样式字符串。
 * 吸附时使用：{side}: 0; top: {top}px + transform: none
 */
function makeButtonStyle(pos: ButtonPosition): string {
  return `${pos.side}: 0; top: ${pos.top}px; transform: none;`;
}

export class FloatingWidget {
  private settings: FloatingButtonSettings;
  private hostname: string;
  private lang: SupportedLang;
  private strings = getStrings('en');

  private host: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private btn: HTMLButtonElement | null = null;
  private menu: HTMLDivElement | null = null;
  private panelContainer: HTMLDivElement | null = null;
  /** ChatPanel 实例引用，延迟导入避免循环依赖 */
  private chatPanel: unknown = null;

  private position: ButtonPosition;
  /** 拖拽期间的瞬时偏移（相对于吸附位置） */
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };
  private isDragging = false;
  private pointerStart = { x: 0, y: 0 };
  private pointerMoved = 0;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private menuHideTimer: ReturnType<typeof setTimeout> | null = null;

  /** 位置变更回调（防抖写入 storage） */
  private onPositionChange: ((pos: ButtonPosition) => void) | null = null;

  // 绑定的事件处理器引用（用于移除）
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundContextMenu: (e: Event) => void;
  private boundDocClick: (e: Event) => void;

  constructor(
    settings: FloatingButtonSettings,
    hostname: string,
    lang?: string,
  ) {
    this.settings = settings;
    this.hostname = hostname;
    if (lang === 'zh-CN' || lang === 'en') {
      this.lang = lang;
    } else {
      this.lang = 'en';
    }
    this.strings = getStrings(this.lang);

    // 从 settings 读取初始位置或使用默认值
    const savedPos = settings.position;
    this.position = savedPos
      ? { side: savedPos.side, top: savedPos.top }
      : { side: DEFAULT_SIDE, top: DEFAULT_TOP };

    // 绑定方法，确保 this 指向正确
    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerUp = this.onPointerUp.bind(this);
    this.boundContextMenu = this.onContextMenu.bind(this);
    this.boundDocClick = this.onDocClick.bind(this);
  }

  /** 设置位置变更回调 */
  setOnPositionChange(fn: (pos: ButtonPosition) => void): void {
    this.onPositionChange = fn;
  }

  /** 挂载到页面 */
  mount(): void {
    if (this.host) return;

    // 创建 Shadow host
    this.host = this.buildHost();
    document.documentElement.appendChild(this.host);

    // attach shadow root
    this.shadowRoot = this.host.attachShadow({ mode: 'closed' });

    // 渲染内部 DOM
    this.renderContent();

    // 绑定事件
    this.bindEvents();
  }

  /** 响应设置变更。返回 false 表示 widget 已被销毁（如 enabled 关闭或命中黑名单） */
  apply(nextSettings: FloatingButtonSettings, lang?: SupportedLang): boolean {
    this.settings = nextSettings;

    // 语言更新
    if (lang) {
      this.setLang(lang);
    }

    // enabled 关闭 → 销毁
    if (!shouldMount(nextSettings, this.hostname)) {
      this.destroy();
      return false;
    }

    // 位置更新
    const nextPos = nextSettings.position;
    if (nextPos) {
      this.position = { side: nextPos.side, top: nextPos.top };
      this.resetDragOffset();
      this.applyButtonTransform();
    }

    return true;
  }

  /** 单独更新界面语言（不触发其他设置变更） */
  setLang(lang: SupportedLang): void {
    if (lang === this.lang) return;
    this.lang = lang;
    this.strings = getStrings(this.lang);
    if (this.btn) {
      this.btn.setAttribute('aria-label', this.strings.buttonAriaLabel);
    }
  }

  /** 销毁：移除 host，清理事件 */
  destroy(): void {
    this.unbindEvents();
    this.clearTimers();

    if (this.chatPanel && typeof (this.chatPanel as Record<string, unknown>).destroy === 'function') {
      ((this.chatPanel as Record<string, unknown>).destroy as () => void)();
    }
    this.chatPanel = null;

    if (this.host) {
      this.host.remove();
      this.host = null;
    }
    this.shadowRoot = null;
    this.btn = null;
    this.menu = null;
    this.panelContainer = null;
  }

  // ── 内部 DOM 构建 ──────────────────────────────────────

  private buildHost(): HTMLDivElement {
    const host = document.createElement('div');
    host.id = 'ba-floating-host';
    return host;
  }

  private renderContent(): void {
    if (!this.shadowRoot) return;

    // Style
    const styleEl = document.createElement('style');
    styleEl.textContent = SHADOW_CSS;
    this.shadowRoot.appendChild(styleEl);

    // 按钮
    this.btn = this.buildButton();
    this.shadowRoot.appendChild(this.btn);

    // 快捷菜单
    this.menu = this.buildMenu();
    this.shadowRoot.appendChild(this.menu);

    // 面板容器（iframe 预留）
    this.panelContainer = this.buildPanelContainer();
    this.shadowRoot.appendChild(this.panelContainer);

    // 应用初始定位
    this.applyButtonTransform();
  }

  private buildButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'float-btn';
    btn.setAttribute('aria-label', this.strings.buttonAriaLabel);
    btn.setAttribute('title', this.strings.buttonAriaLabel);

    const img = document.createElement('img');
    try {
      img.src = browser.runtime.getURL('logo-48.png');
    } catch {
      // 静默回退：扩展上下文失效时用占位 SVG
      img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"%3E%3Crect width="48" height="48" rx="8" fill="%23ddd"/%3E%3C/svg%3E';
    }
    img.alt = 'BA';
    // 图片加载失败时显示文字 fallback，确保按钮始终可见
    img.addEventListener('error', () => {
      const text = document.createElement('span');
      text.textContent = 'BA';
      text.style.cssText = 'font-size:18px;font-weight:700;color:#333;line-height:1;';
      img.replaceWith(text);
    }, { once: true });
    btn.appendChild(img);

    // 阻止默认拖拽行为（防止浏览器图片拖拽）
    btn.addEventListener('dragstart', (e) => e.preventDefault());

    return btn;
  }

  private buildMenu(): HTMLDivElement {
    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const hideItem = document.createElement('button');
    hideItem.className = 'context-menu-item';
    hideItem.textContent = this.strings.hideOnThisSite;
    hideItem.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleHide();
    });

    menu.appendChild(hideItem);
    return menu;
  }

  private buildPanelContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'panel-container';
    return container;
  }

  // ── 事件绑定 ───────────────────────────────────────────

  private bindEvents(): void {
    if (!this.btn) return;

    this.btn.addEventListener('pointerdown', this.boundPointerDown);
    this.btn.addEventListener('pointermove', this.boundPointerMove);
    this.btn.addEventListener('pointerup', this.boundPointerUp);
    this.btn.addEventListener('contextmenu', this.boundContextMenu);

    // 全局点击关闭菜单
    document.addEventListener('click', this.boundDocClick, true);
  }

  private unbindEvents(): void {
    if (this.btn) {
      this.btn.removeEventListener('pointerdown', this.boundPointerDown);
      this.btn.removeEventListener('pointermove', this.boundPointerMove);
      this.btn.removeEventListener('pointerup', this.boundPointerUp);
      this.btn.removeEventListener('contextmenu', this.boundContextMenu);
    }
    document.removeEventListener('click', this.boundDocClick, true);
  }

  // ── 拖拽处理 ───────────────────────────────────────────

  private onPointerDown(e: PointerEvent): void {
    e.preventDefault();
    this.isDragging = true;
    this.pointerStart = { x: e.clientX, y: e.clientY };
    this.pointerMoved = 0;
    this.resetDragOffset();

    if (this.btn) {
      this.btn.classList.add('dragging');
      this.btn.setPointerCapture(e.pointerId);
    }

    // 启动长按计时
    this.clearLongPressTimer();
    this.longPressTimer = setTimeout(() => {
      if (!this.isDragging) return;
      // 检查位移是否小于阈值
      if (isClick(this.pointerMoved)) {
        this.showMenuAtButton();
      }
    }, LONG_PRESS_DURATION);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isDragging) return;

    const dx = e.clientX - this.pointerStart.x;
    const dy = e.clientY - this.pointerStart.y;
    this.pointerMoved = Math.abs(dx) + Math.abs(dy);

    // 取消长按（发生了明显移动）
    if (!isClick(this.pointerMoved)) {
      this.clearLongPressTimer();
    }

    this.dragOffset = { x: dx, y: dy };
    this.applyDragTransform();
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.clearLongPressTimer();

    if (this.btn) {
      this.btn.classList.remove('dragging');
      try { this.btn.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }

    if (isClick(this.pointerMoved)) {
      // 视为点击 → toggle 面板
      this.handleTogglePanel();
    } else {
      // 视为拖拽 → 计算最终吸附位置
      this.snapToSide(e.clientX, e.clientY);
    }
  }

  // ── 右键/快捷菜单 ──────────────────────────────────────

  private onContextMenu(e: Event): void {
    e.preventDefault();
    this.showMenuAtButton();
  }

  private showMenuAtButton(): void {
    if (!this.menu || !this.btn) return;
    this.clearMenuHideTimer();

    const btnRect = this.btn.getBoundingClientRect();
    const menuSide = this.position.side;

    // 菜单位置：在按钮旁边
    const menuStyle = this.menu.style;
    if (menuSide === 'left') {
      menuStyle.left = `${btnRect.right + 8}px`;
      menuStyle.right = 'auto';
    } else {
      menuStyle.right = `${window.innerWidth - btnRect.left + 8}px`;
      menuStyle.left = 'auto';
    }
    menuStyle.top = `${Math.max(8, btnRect.top - 4)}px`;
    this.menu.classList.add('visible');
  }

  private hideMenu(): void {
    if (!this.menu) return;
    this.menu.classList.remove('visible');
  }

  private onDocClick(e: Event): void {
    // 点击菜单外部 → 隐藏
    if (this.menu && !this.menu.contains(e.target as Node)) {
      this.hideMenu();
    }
  }

  /** 延迟隐藏菜单（给 click 事件处理留时间） */
  private clearMenuHideTimer(): void {
    if (this.menuHideTimer) {
      clearTimeout(this.menuHideTimer);
      this.menuHideTimer = null;
    }
  }

  // ── "在此站点隐藏" ─────────────────────────────────────

  private async handleHide(): Promise<void> {
    this.hideMenu();

    // 原子读-改-写：从 store 取最新 settings 再修改，防止基于过期 this.settings 覆盖并发写入
    const store = ConfigStore.getInstance();
    const current = await store.get<FloatingButtonSettings>('floatingButtonSettings');
    const newBlacklist = addToBlacklist(current.blacklist, this.hostname);
    const newSettings: FloatingButtonSettings = {
      ...current,
      blacklist: newBlacklist,
    };

    await store.set('floatingButtonSettings', newSettings);
    // storage.onChanged 会触发 apply() → shouldMount 返回 false → destroy()
    // 这里直接 destroy 作为兜底
    this.destroy();
  }

  // ── 面板 ───────────────────────────────────────────────

  private async handleTogglePanel(): Promise<void> {
    this.hideMenu();
    if (!this.panelContainer) return;

    // 延迟 / 按需加载 ChatPanel
    if (!this.chatPanel) {
      const { ChatPanel } = await import('./panel');
      this.chatPanel = new ChatPanel(this.panelContainer, this.position.side);
    }

    (this.chatPanel as { toggle: () => void }).toggle();
  }

  // ── 定位辅助 ───────────────────────────────────────────

  /** 重置拖拽偏移 */
  private resetDragOffset(): void {
    this.dragOffset = { x: 0, y: 0 };
  }

  /** 应用吸附定位（无拖拽状态） */
  private applyButtonTransform(): void {
    if (!this.btn) return;
    const style = this.btn.style;
    const { side, top } = this.position;

    // 重置所有定位属性
    style.left = 'auto';
    style.right = 'auto';
    style.top = `${top}px`;
    style.bottom = 'auto';

    if (side === 'left') {
      style.left = '0';
    } else {
      style.right = '0';
    }

    style.transform = 'none';
  }

  /** 应用拖拽期间的瞬时 transform */
  private applyDragTransform(): void {
    if (!this.btn) return;
    const { x, y } = this.dragOffset;
    const { side, top } = this.position;

    // 恢复吸附基准位置，然后叠加 translate
    const style = this.btn.style;
    style.left = 'auto';
    style.right = 'auto';

    if (side === 'left') {
      style.left = '0';
    } else {
      style.right = '0';
    }

    style.top = `${top}px`;
    style.bottom = 'auto';
    style.transform = `translate(${x}px, ${y}px)`;
  }

  /** 松手后计算吸附位置 */
  private snapToSide(clientX: number, clientY: number): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const side = resolveSide(clientX, vw);
    const top = clampTop(clientY - BUTTON_SIZE / 2, BUTTON_SIZE, vh);

    this.position = { side, top };
    this.resetDragOffset();
    this.applyButtonTransform();

    // 通知外部（延迟写入 storage）
    if (this.onPositionChange) {
      this.onPositionChange(this.position);
    }
  }

  // ── 工具方法 ───────────────────────────────────────────

  private clearLongPressTimer(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearLongPressTimer();
    this.clearMenuHideTimer();
  }
}
