import type { IBrowserAdapter } from '@/adapters/types';
import { BrowserEvent } from '@/adapters/types';
import type { BrowserState } from '@/shared/types';

/**
 * 浏览器事件中枢
 *
 * 监听 tabs/windows/tabGroups 事件，500ms 防抖后全量查询当前状态，
 * 通过回调推送到 Chat Page。
 */
export class BrowserEventHub {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 500;
  private notifyCallback: ((state: BrowserState) => void) | null = null;
  private cleanupFns: Array<() => void> = [];

  constructor(private adapter: IBrowserAdapter) {}

  /** 注册状态变更通知回调 */
  onStateChanged(callback: (state: BrowserState) => void): void {
    this.notifyCallback = callback;
  }

  /** 启动所有事件监听 */
  start(): void {
    const events: BrowserEvent[] = [
      BrowserEvent.TAB_CREATED,
      BrowserEvent.TAB_UPDATED,
      BrowserEvent.TAB_REMOVED,
      BrowserEvent.TAB_MOVED,
      BrowserEvent.TAB_ATTACHED,
      BrowserEvent.TAB_DETACHED,
      BrowserEvent.TAB_ACTIVATED,
      BrowserEvent.WINDOW_CREATED,
      BrowserEvent.WINDOW_REMOVED,
      BrowserEvent.WINDOW_FOCUS_CHANGED,
      BrowserEvent.TAB_GROUP_UPDATED,
      BrowserEvent.TAB_GROUP_MOVED,
    ];

    for (const event of events) {
      const cleanup = this.adapter.addListener(event, () => this.scheduleSync());
      this.cleanupFns.push(cleanup);
    }
  }

  /** 停止事件监听 */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const cleanup of this.cleanupFns) {
      cleanup();
    }
    this.cleanupFns = [];
  }

  /** 防抖调度：重置定时器 */
  private scheduleSync(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.syncState(), this.DEBOUNCE_MS);
  }

  /** 全量查询当前状态并推送 */
  private async syncState(): Promise<void> {
    try {
      const [tabs, windows, tabGroups] = await Promise.all([
        this.adapter.tabs.query({}),
        this.adapter.windows.getAll(),
        this.adapter.tabGroups.query({}),
      ]);

      const state: BrowserState = {
        windows,
        tabs,
        tabGroups,
        capturedAt: Date.now(),
      };

      this.notifyCallback?.(state);
    } catch (err) {
      console.error('[BrowserEventHub] syncState failed:', err);
    }
  }
}
