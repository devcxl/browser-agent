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
  BookmarkSearchQuery,
  BookmarkCreateArg,
  BookmarkChangesArg,
  BookmarkTreeNode,
  DownloadQuery,
  DownloadOptions,
  DownloadItem,
  CookieDetails,
  CookieGetAllDetails,
  CookieSetDetails,
  Cookie,
  CookieStore,
  SessionFilter,
  Session,
} from '@/shared/types';

// ==================== ExtensionInfo ====================

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  type: string;
  description?: string;
  mayDisable?: boolean;
  icons?: { size: number; url: string }[];
  optionsUrl?: string;
  hostPermissions?: string[];
  permissions?: string[];
}

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

  // ── Bookmarks ───────────────────────────────────────

  bookmarks: {
    search(query: string | BookmarkSearchQuery): Promise<BookmarkTreeNode[]>;
    create(bookmark: BookmarkCreateArg): Promise<BookmarkTreeNode>;
    update(id: string, changes: BookmarkChangesArg): Promise<BookmarkTreeNode>;
    remove(id: string): Promise<void>;
    getTree(): Promise<BookmarkTreeNode[]>;
  };

  // ── Downloads ───────────────────────────────────────

  downloads: {
    search(query: DownloadQuery): Promise<DownloadItem[]>;
    download(options: DownloadOptions): Promise<number>;
    erase(query: DownloadQuery): Promise<number[]>;
    open(downloadId: number): Promise<void>;
    cancel(downloadId: number): Promise<void>;
    pause(downloadId: number): Promise<void>;
    resume(downloadId: number): Promise<void>;
  };

  // ── Cookies ─────────────────────────────────────────

  cookies: {
    get(details: CookieDetails): Promise<Cookie | null>;
    getAll(details: CookieGetAllDetails): Promise<Cookie[]>;
    set(details: CookieSetDetails): Promise<Cookie | null>;
    remove(details: CookieDetails): Promise<CookieDetails>;
    getAllCookieStores(): Promise<CookieStore[]>;
  };

  // ── Sessions ────────────────────────────────────────

  sessions: {
    getRecentlyClosed(filter?: SessionFilter): Promise<Session[]>;
    restore(sessionId?: string): Promise<Session>;
  };

  // ── Storage ─────────────────────────────────────────

  storage: {
    local: {
      get(keys?: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
  };

  // ── Clipboard ───────────────────────────────────────

  clipboard: {
    read(): Promise<string>;
    write(text: string): Promise<void>;
  };

  // ── Management ──────────────────────────────────────

  management: {
    getAll(): Promise<ExtensionInfo[]>;
    get(id: string): Promise<ExtensionInfo>;
    setEnabled(id: string, enabled: boolean): Promise<void>;
  };

  // ── Privacy ─────────────────────────────────────────

  privacy: {
    getNetworkSettings(): Promise<Record<string, unknown>>;
    setNetworkSetting(key: string, value: unknown): Promise<void>;
  };

  // ── Proxy ───────────────────────────────────────────

  proxy: {
    getSettings(): Promise<Record<string, unknown>>;
    setSettings(config: Record<string, unknown>): Promise<void>;
    clear(): Promise<void>;
  };

  // ── Debugger ───────────────────────────────────────

  debugger: {
    getTargets(): Promise<{ id: string; tabId?: number; title: string; url: string; attached: boolean }[]>;
    attach(targetId: string): Promise<void>;
    detach(targetId: string): Promise<void>;
  };

  // ── DeclarativeNetRequest ─────────────────────────

  declarativeNetRequest: {
    getDynamicRules(): Promise<chrome.declarativeNetRequest.Rule[]>;
    addDynamicRules(rules: chrome.declarativeNetRequest.Rule[]): Promise<void>;
    removeDynamicRules(ruleIds: number[]): Promise<void>;
  };

  // ── Identity ──────────────────────────────────────

  identity: {
    getAuthToken(details?: { interactive?: boolean; account?: { id: string } }): Promise<{ token: string }>;
    removeCachedToken(token: string): Promise<void>;
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
