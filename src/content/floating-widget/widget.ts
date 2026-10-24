/**
 * FloatingWidget — 浮动控件 DOM 组装与交互。
 *
 * 在页面注入 Shadow DOM 宿主，内含：
 * - 圆形拖拽按钮（GrokBot 动画头像 + aria-label）
 * - 右键/长按快捷菜单
 * - iframe 面板容器（委托 ChatPanel）
 *
 * 所有样式封装在 closed shadow root 中，与宿主页面隔离。
 */

import { isClick, resolveSide, clampTop } from './drag';
import { addToBlacklist, shouldMount } from './blacklist';
import { computeGaze } from './gaze';
import { GrokBot } from './grokbot';
import type { Vec2 } from './grokbot';
import { BotStateController } from './bot-state-controller';
import { mapAgentStatusToBotState } from './status-map';
import { translate } from '@/shared/i18n';
import { DEFAULT_ACCENT_COLOR, normalizeAccentColor } from '@/shared/accent-palette';
import { PANEL_WIDTH_DEFAULT } from '@/shared/panel-width';
import type { FloatingButtonSettings } from '@/shared/types/storage';
import { ConfigStore } from '@/shared/storage/config-store';

/** 面板句柄：动态导入的 ChatPanel 在本模块使用的最小接口 */
interface ChatPanelHandle {
  toggle(): void;
  destroy(): void;
  setWidth(width: number): void;
}

/** 按钮尺寸（px），与 drag.ts 中 clampTop 的 buttonSize 保持一致 */
const BUTTON_SIZE = 60;
/** 长按判定阈值（ms） */
const LONG_PRESS_DURATION = 500;
/** 眼睛追踪：归一化变化低于该值视为抖动，跳过重建帧（约 0.5% 满程） */
const GAZE_EPSILON = 0.01;
/** 头像眼睛颜色（暖白），不随主色变化 */
const EYE_COLOR = '#fff7ed';

/** 默认吸附侧 */
const DEFAULT_SIDE: 'left' | 'right' = 'right';
/** 默认距顶部距离（px） */
const DEFAULT_TOP = 200;
/**
 * 侧边停靠时的自然转头朝向（弧度）：面向屏幕内侧。
 *
 * 几何与美术基准分析：
 * GrokBot 默认 idle 状态首个表情（expression 0）在未偏转时的自然双眼中心约在 x = 161.2，
 * 相对面部中心 FACE_CENTER (114.27) 自带约 +46.9 坐标单位（约 +0.475 rad）的向右偏转。
 * 为使双眼在两侧停靠时均朝向屏幕内侧、且在视口边缘全幅追踪时双眼完整保留、不触碰圆形边框裁剪：
 * - 面向直视中轴对应的校准偏转角约为 -0.475 rad；
 * - 叠加内向倾斜振幅 ±0.175 rad 后：
 *   - 左侧停靠（向右/内侧看）：-0.475 + 0.175 = -0.30 rad（双眼中心偏右约 +18.3 单位，不产生边缘裁切）
 *   - 右侧停靠（向左/内侧看）：-0.475 - 0.175 = -0.65 rad（双眼中心偏左约 -17.0 单位，清晰面向内侧屏幕）
 */
const RESTING_TURN_BASE = -0.475;
const RESTING_TURN_DELTA = 0.175;

function resolveRestingTurn(side: 'left' | 'right'): number {
  return side === 'left' ? RESTING_TURN_BASE + RESTING_TURN_DELTA : RESTING_TURN_BASE - RESTING_TURN_DELTA;
}

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
  /* 需严格高于 .panel-container，否则面板覆盖按钮区域时无法再点按钮关闭面板。 */
  position: relative;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${BUTTON_SIZE}px;
  height: ${BUTTON_SIZE}px;
  border-radius: 50%;
  /* 头像本体直接可见：按钮自身不加底色/描边，只用 drop-shadow 保留悬浮感 */
  background: transparent;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.28));
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  transition: filter 0.2s ease, transform 0.15s ease;
  position: fixed;
}

.float-btn:hover {
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35));
  transform: scale(1.06);
}

.float-btn:active {
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.22));
  transform: scale(0.96);
}

.float-btn canvas {
  width: ${BUTTON_SIZE}px;
  height: ${BUTTON_SIZE}px;
  display: block;
  pointer-events: none;
  -webkit-user-drag: none;
  user-select: none;
}

.float-btn.dragging {
  transition: none;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.32));
}

/* Canvas 不可用时的兜底：至少保留可见的圆形点击目标（与头像主体同色） */
.float-btn.avatar-unavailable {
  background: ${DEFAULT_ACCENT_COLOR};
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
  width: ${PANEL_WIDTH_DEFAULT}px;
  max-width: 100vw;
  background: #ffffff;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  display: none;
  /* 必须低于 .float-btn（2147483647）：两者同侧时面板覆盖按钮区域，
     面板若同级或更高会使「再点按钮关闭面板」不可达（spec §7.3）。 */
  z-index: 2147483646;
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

export class FloatingWidget {
  private settings: FloatingButtonSettings;
  private hostname: string;

  private host: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private btn: HTMLButtonElement | null = null;
  /** GrokBot 动画引擎；Canvas 2D 不可用时为 null（按钮仍可交互） */
  private bot: GrokBot | null = null;
  /** 当前主色（头像 bodyColor），随 preferences 热更新 */
  private accentColor: string;
  /** preferences 变更退订函数 */
  private unsubscribePreferences: (() => void) | null = null;
  /** 状态去抖 / 庆祝 / 复位逻辑（与 DOM 解耦的纯逻辑单元） */
  private readonly botState = new BotStateController({
    apply: (state) => this.bot?.update({ state }),
  });
  private menu: HTMLDivElement | null = null;
  private panelContainer: HTMLDivElement | null = null;
  /** ChatPanel 实例引用，延迟导入避免循环依赖 */
  private chatPanel: ChatPanelHandle | null = null;

  private position: ButtonPosition;
  /** 拖拽期间的瞬时偏移（相对于吸附位置） */
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };
  private isDragging = false;
  private pointerStart = { x: 0, y: 0 };
  private pointerMoved = 0;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;

  /** 待执行的 gaze 计算帧；同一帧内的高频 pointermove 合并为一次 */
  private gazeRafId: number | null = null;
  /** 最近一次指针坐标（rAF 执行时消费） */
  private pendingPointer: { x: number; y: number } | null = null;
  /** 最近一次下发给引擎的 gaze，用于跳过微小抖动 */
  private lastGaze: Vec2 = { x: 0, y: 0 };

  /** 位置变更回调（防抖写入 storage） */
  private onPositionChange: ((pos: ButtonPosition) => void) | null = null;

  // 绑定的事件处理器引用（用于移除）
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundContextMenu: (e: Event) => void;
  private boundDocClick: (e: Event) => void;
  private boundWindowPointerMove: (e: PointerEvent) => void;
  private boundDocumentPointerLeave: () => void;
  private boundWindowBlur: () => void;

  constructor(
    settings: FloatingButtonSettings,
    hostname: string,
    accentColor: string = DEFAULT_ACCENT_COLOR,
  ) {
    this.settings = settings;
    this.hostname = hostname;
    this.accentColor = normalizeAccentColor(accentColor);

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
    this.boundWindowPointerMove = this.onWindowPointerMove.bind(this);
    this.boundDocumentPointerLeave = this.resetGaze.bind(this);
    this.boundWindowBlur = this.resetGaze.bind(this);
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

    // 订阅主色变更（headless 测试或 storage 不可用时静默跳过）
    this.subscribePreferences();

    // 绑定事件
    this.bindEvents();
  }

  /** 响应设置变更。返回 false 表示 widget 已被销毁（如 enabled 关闭或命中黑名单） */
  apply(nextSettings: FloatingButtonSettings): boolean {
    const prevPanelWidth = this.settings.panelWidth;
    this.settings = nextSettings;

    // enabled 关闭 → 销毁
    if (!shouldMount(nextSettings, this.hostname)) {
      this.destroy();
      return false;
    }

    // 面板已创建且宽度变化 → 实时改样式（不重建 iframe）
    if (this.chatPanel && prevPanelWidth !== nextSettings.panelWidth) {
      this.chatPanel.setWidth(nextSettings.panelWidth ?? PANEL_WIDTH_DEFAULT);
    }

    // 位置更新
    const nextPos = nextSettings.position;
    if (nextPos) {
      const prevSide = this.position.side;
      this.position = { side: nextPos.side, top: nextPos.top };
      this.resetDragOffset();
      this.applyButtonTransform();
      if (prevSide !== nextPos.side && this.bot) {
        this.bot.update({ turn: resolveRestingTurn(nextPos.side) });
      }
    }

    return true;
  }

  /** 销毁：停止动画引擎、移除 host，清理事件 */
  destroy(): void {
    if (this.unsubscribePreferences) {
      this.unsubscribePreferences();
      this.unsubscribePreferences = null;
    }
    this.unbindEvents();
    this.clearLongPressTimer();

    // 先停状态机，避免销毁过程中仍有去抖/庆祝定时器回调引擎
    this.botState.destroy();

    // 停止 rAF / 眨眼定时器 / 观察者，避免销毁后继续占用资源
    this.bot?.destroy();
    this.bot = null;

    if (this.chatPanel) {
      this.chatPanel.destroy();
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
    const label = translate('widget.buttonAriaLabel');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);

    // 头像由 GrokBot 引擎绘制到 canvas；尺寸固定 60，引擎内部处理 DPR
    const canvas = document.createElement('canvas');
    canvas.width = BUTTON_SIZE;
    canvas.height = BUTTON_SIZE;
    canvas.setAttribute('aria-label', label);
    // 按钮本身已有 aria-label；canvas 仅作视觉呈现，避免读屏重复播报
    canvas.setAttribute('aria-hidden', 'true');
    btn.appendChild(canvas);

    try {
      this.bot = new GrokBot(canvas, {
        state: 'idle',
        size: BUTTON_SIZE,
        autoBlink: true,
        ariaLabel: label,
        theme: { bodyColor: this.accentColor, eyeColor: EYE_COLOR },
        turn: resolveRestingTurn(this.position.side),
      });
    } catch {
      // 无 Canvas 2D 实现的宿主（如 jsdom/受限环境）：放弃动画但保留可见、可点击的按钮
      this.bot = null;
      btn.classList.add('avatar-unavailable');
      btn.style.background = this.accentColor;
    }

    // 阻止默认拖拽行为（canvas 不参与原生拖拽）
    btn.addEventListener('dragstart', (e) => e.preventDefault());

    return btn;
  }

  private buildMenu(): HTMLDivElement {
    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const hideItem = document.createElement('button');
    hideItem.className = 'context-menu-item';
    hideItem.textContent = translate('widget.hideOnThisSite');
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

  // ── 主色订阅 ───────────────────────────────────────────

  /** 订阅 preferences 中的主色；旧版本配置缺省时回退暖橙 */
  private subscribePreferences(): void {
    if (this.unsubscribePreferences) return;
    try {
      this.unsubscribePreferences = ConfigStore.getInstance().onChange((changes) => {
        if (!changes.preferences) return;
        this.applyAccent(normalizeAccentColor(changes.preferences.accentColor));
      });
    } catch {
      // 纯 headless 环境（无 browser.storage）：保持构造时的颜色
      this.unsubscribePreferences = null;
    }
  }

  /** 热更新头像主色；Canvas 不可用时同步兜底按钮底色 */
  private applyAccent(accentColor: string): void {
    this.accentColor = accentColor;
    if (this.bot) {
      this.bot.update({ theme: { bodyColor: accentColor, eyeColor: EYE_COLOR } });
    } else if (this.btn) {
      this.btn.style.background = accentColor;
    }
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

    // 眼睛追踪仅在头像引擎可用时启用（Canvas 降级时无追踪目标）
    if (this.bot) {
      window.addEventListener('pointermove', this.boundWindowPointerMove, { passive: true });
      document.addEventListener('pointerleave', this.boundDocumentPointerLeave);
      window.addEventListener('blur', this.boundWindowBlur);
    }
  }

  private unbindEvents(): void {
    if (this.btn) {
      this.btn.removeEventListener('pointerdown', this.boundPointerDown);
      this.btn.removeEventListener('pointermove', this.boundPointerMove);
      this.btn.removeEventListener('pointerup', this.boundPointerUp);
      this.btn.removeEventListener('contextmenu', this.boundContextMenu);
    }
    document.removeEventListener('click', this.boundDocClick, true);
    window.removeEventListener('pointermove', this.boundWindowPointerMove);
    document.removeEventListener('pointerleave', this.boundDocumentPointerLeave);
    window.removeEventListener('blur', this.boundWindowBlur);
    this.cancelGazeFrame();
    this.pendingPointer = null;
  }

  // ── 眼睛追踪 ───────────────────────────────────────────

  /** 全局 pointermove：只记录坐标并排一帧，避免高频重绘 */
  private onWindowPointerMove(e: PointerEvent): void {
    this.pendingPointer = { x: e.clientX, y: e.clientY };
    if (this.gazeRafId !== null) return;
    this.gazeRafId = requestAnimationFrame(() => {
      this.gazeRafId = null;
      this.applyPendingGaze();
    });
  }

  /** rAF 回调：用最新指针位置计算 gaze，变化过小则跳过 */
  private applyPendingGaze(): void {
    const pointer = this.pendingPointer;
    const btn = this.btn;
    const bot = this.bot;
    this.pendingPointer = null;
    // 监听仅在 bot 存在时绑定，且销毁会先取消待执行帧；这里的判空是防御性兜底
    if (!pointer || !btn || !bot) return;

    const rect = btn.getBoundingClientRect();
    const gaze = computeGaze({
      pointerX: pointer.x,
      pointerY: pointer.y,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

    if (
      Math.abs(gaze.x - this.lastGaze.x) < GAZE_EPSILON &&
      Math.abs(gaze.y - this.lastGaze.y) < GAZE_EPSILON
    ) {
      return;
    }

    this.lastGaze = gaze;
    bot.update({ gaze });
  }

  /** 指针离开文档或窗口失焦：取消待执行帧并回正 */
  private resetGaze(): void {
    this.cancelGazeFrame();
    this.pendingPointer = null;
    this.lastGaze = { x: 0, y: 0 };
    this.bot?.update({ gaze: { x: 0, y: 0 } });
  }

  private cancelGazeFrame(): void {
    if (this.gazeRafId === null) return;
    cancelAnimationFrame(this.gazeRafId);
    this.gazeRafId = null;
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
      this.chatPanel = new ChatPanel(
        this.panelContainer,
        this.position.side,
        // Canvas 不可用时 bot 为 null：apply 里用可选链兜底，不影响面板功能
        (state, reason) => this.botState.handle(mapAgentStatusToBotState(state), reason),
        // 面板关闭（按钮或 iframe close-request）→ 立即取消去抖/庆祝并回 idle
        () => this.botState.reset(),
        this.settings.panelWidth ?? PANEL_WIDTH_DEFAULT,
      );
    }

    this.chatPanel.toggle();
  }

  // ── 定位辅助 ───────────────────────────────────────────

  /** 重置拖拽偏移 */
  private resetDragOffset(): void {
    this.dragOffset = { x: 0, y: 0 };
  }

  /**
   * 当前视口下按钮实际可用的 top。
   *
   * 保存值可能来自更早、更高的视口（或页面缩放变化），直接渲染会让按钮落在视口外；
   * 渲染前统一 clamp 到可见区域。只修正显示位置，不回写持久化配置。
   */
  private effectiveTop(): number {
    return clampTop(this.position.top, BUTTON_SIZE, window.innerHeight);
  }

  /** 应用吸附定位（无拖拽状态） */
  private applyButtonTransform(): void {
    if (!this.btn) return;
    const style = this.btn.style;
    const { side } = this.position;
    const top = this.effectiveTop();

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
    const { side } = this.position;
    // 基准位置与吸附态一致（clamp 后），否则拖拽途中按钮会跳回越界坐标
    const top = this.effectiveTop();

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

    const prevSide = this.position.side;
    this.position = { side, top };
    this.resetDragOffset();
    this.applyButtonTransform();
    if (prevSide !== side && this.bot) {
      this.bot.update({ turn: resolveRestingTurn(side) });
    }

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

}
