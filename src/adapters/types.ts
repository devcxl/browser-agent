import type {
  Tab,
  Window,
  TabGroup,
  TabQueryInfo,
  TabCreateProperties,
  TabUpdateProperties,
  WindowGetInfo,
  WindowCreateData,
  WindowUpdateInfo,
  TabGroupQueryInfo,
  TabGroupUpdateProperties,
  NotificationsCreateOptions,
  HistoryItem,
  HistorySearchParams,
  HistoryDeleteParams,
} from '@/shared/types';

// ==================== IBrowserAdapter ====================

export interface IBrowserAdapter {
  /** 浏览器标识 */
  readonly browserType: 'chrome' | 'firefox';

  // ── Tabs ────────────────────────────────────────────

  tabs: {
    query(queryInfo: TabQueryInfo): Promise<Tab[]>;
    get(tabId: number): Promise<Tab>;
    create(createProperties: TabCreateProperties): Promise<Tab>;
    update(tabId: number, updateProperties: TabUpdateProperties): Promise<Tab>;
    remove(tabIds: number | number[]): Promise<void>;
    move(
      tabIds: number | number[],
      moveProperties: { windowId?: number; index: number },
    ): Promise<Tab | Tab[]>;
    group(options: {
      tabIds: number | number[];
      groupId?: number;
      createProperties?: { windowId?: number };
    }): Promise<number>;
    ungroup(tabIds: number | number[]): Promise<void>;
    /** 获取当前窗口的活跃标签页 */
    getCurrent(): Promise<Tab>;
    /** 重新加载标签页 */
    reload(tabId: number): Promise<void>;
    /** 复制标签页 */
    duplicate(tabId: number): Promise<Tab>;
    /** 高亮标签页 */
    highlight(highlightInfo: { tabs: number[] | number; windowId?: number }): Promise<Window>;
  };

  // ── Windows ─────────────────────────────────────────

  windows: {
    getAll(getInfo?: WindowGetInfo): Promise<Window[]>;
    get(windowId: number, getInfo?: WindowGetInfo): Promise<Window>;
    create(createData?: WindowCreateData): Promise<Window>;
    update(windowId: number, updateInfo: WindowUpdateInfo): Promise<Window>;
    remove(windowId: number): Promise<void>;
    getCurrent(getInfo?: WindowGetInfo): Promise<Window>;
    getLastFocused(getInfo?: WindowGetInfo): Promise<Window>;
  };

  // ── TabGroups ───────────────────────────────────────

  tabGroups: {
    query(queryInfo: TabGroupQueryInfo): Promise<TabGroup[]>;
    get(groupId: number): Promise<TabGroup>;
    update(groupId: number, updateProperties: TabGroupUpdateProperties): Promise<TabGroup>;
    move(
      groupId: number,
      moveProperties: { windowId?: number; index: number },
    ): Promise<TabGroup>;
  };

  // ── History ──────────────────────────────────────

  history: {
    search(params: HistorySearchParams): Promise<HistoryItem[]>;
    deleteUrl(url: string): Promise<void>;
    deleteRange(range: { startTime: number; endTime: number }): Promise<void>;
    deleteAll(): Promise<void>;
  };

  // ── Event 注册 ──────────────────────────────────────

  /** 添加事件监听器，返回取消监听的函数 */
  addListener(event: BrowserEvent, callback: (...args: any[]) => void): () => void;

  // ── Notifications ───────────────────────────────────

  notifications: {
    create(options: NotificationsCreateOptions): Promise<string>;
  };
}

// ==================== 浏览器事件枚举 ====================

export enum BrowserEvent {
  TAB_CREATED = 'tabs.onCreated',
  TAB_UPDATED = 'tabs.onUpdated',
  TAB_REMOVED = 'tabs.onRemoved',
  TAB_MOVED = 'tabs.onMoved',
  TAB_ATTACHED = 'tabs.onAttached',
  TAB_DETACHED = 'tabs.onDetached',
  TAB_ACTIVATED = 'tabs.onActivated',
  WINDOW_CREATED = 'windows.onCreated',
  WINDOW_REMOVED = 'windows.onRemoved',
  WINDOW_FOCUS_CHANGED = 'windows.onFocusChanged',
  TAB_GROUP_UPDATED = 'tabGroups.onUpdated',
  TAB_GROUP_MOVED = 'tabGroups.onMoved',
}

// ==================== 工厂函数类型 ====================

export type AdapterFactory = () => IBrowserAdapter;
