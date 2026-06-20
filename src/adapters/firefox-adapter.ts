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
import type { IBrowserAdapter } from './types';
import { BrowserEvent } from './types';

const TAB_GROUPS_NOT_SUPPORTED = 'tabGroups is not supported in Firefox';

/**
 * Firefox 浏览器适配器
 * Firefox 使用 `browser.*` 命名空间，且不支持 tabGroups API
 */
export class FirefoxAdapter implements IBrowserAdapter {
  readonly browserType = 'firefox' as const;

  // Firefox 的 browser API 通过全局 browser 对象暴露
  private get browser() {
    return (globalThis as any).browser;
  }

  // ── Tabs ────────────────────────────────────────────

  tabs = {
    query: (queryInfo: TabQueryInfo): Promise<Tab[]> =>
      this.browser.tabs.query(queryInfo),

    get: (tabId: number): Promise<Tab> =>
      this.browser.tabs.get(tabId),

    create: (createProperties: TabCreateProperties): Promise<Tab> =>
      this.browser.tabs.create(createProperties),

    update: (tabId: number, updateProperties: TabUpdateProperties): Promise<Tab> =>
      this.browser.tabs.update(tabId, updateProperties),

    remove: (tabIds: number | number[]): Promise<void> =>
      this.browser.tabs.remove(tabIds),

    move: (
      tabIds: number | number[],
      moveProperties: { windowId?: number; index: number },
    ): Promise<Tab | Tab[]> =>
      this.browser.tabs.move(tabIds, moveProperties),

    group: (_options: {
      tabIds: number | number[];
      groupId?: number;
      createProperties?: { windowId?: number };
    }): Promise<number> =>
      Promise.reject(new Error(TAB_GROUPS_NOT_SUPPORTED)),

    ungroup: (_tabIds: number | number[]): Promise<void> =>
      Promise.reject(new Error(TAB_GROUPS_NOT_SUPPORTED)),

    getCurrent: (): Promise<Tab> =>
      this.browser.tabs.getCurrent(),

    reload: (tabId: number): Promise<void> =>
      this.browser.tabs.reload(tabId),

    duplicate: (tabId: number): Promise<Tab> =>
      this.browser.tabs.duplicate(tabId),

    highlight: (highlightInfo: { tabs: number[] | number; windowId?: number }): Promise<Window> =>
      this.browser.tabs.highlight(highlightInfo),
  };

  // ── Windows ─────────────────────────────────────────

  windows = {
    getAll: (getInfo?: WindowGetInfo): Promise<Window[]> =>
      this.browser.windows.getAll(getInfo),

    get: (windowId: number, getInfo?: WindowGetInfo): Promise<Window> =>
      this.browser.windows.get(windowId, getInfo),

    create: (createData?: WindowCreateData): Promise<Window> =>
      this.browser.windows.create(createData),

    update: (windowId: number, updateInfo: WindowUpdateInfo): Promise<Window> =>
      this.browser.windows.update(windowId, updateInfo),

    remove: (windowId: number): Promise<void> =>
      this.browser.windows.remove(windowId),

    getCurrent: (getInfo?: WindowGetInfo): Promise<Window> =>
      this.browser.windows.getCurrent(getInfo),

    getLastFocused: (getInfo?: WindowGetInfo): Promise<Window> =>
      this.browser.windows.getLastFocused(getInfo),
  };

  // ── TabGroups (Firefox: 全部 no-op) ────────────────

  tabGroups = {
    query: (_queryInfo: TabGroupQueryInfo): Promise<TabGroup[]> =>
      Promise.resolve([]),

    get: (_groupId: number): Promise<TabGroup> =>
      Promise.reject(new Error(TAB_GROUPS_NOT_SUPPORTED)),

    update: (_groupId: number, _updateProperties: TabGroupUpdateProperties): Promise<TabGroup> =>
      Promise.reject(new Error(TAB_GROUPS_NOT_SUPPORTED)),

    move: (
      _groupId: number,
      _moveProperties: { windowId?: number; index: number },
    ): Promise<TabGroup> =>
      Promise.reject(new Error(TAB_GROUPS_NOT_SUPPORTED)),
  };

  // ── Notifications ──────────────────────────────────

  notifications = {
    create: (options: NotificationsCreateOptions): Promise<string> => {
      if (typeof this.browser?.notifications?.create !== 'function') {
        return Promise.reject(new Error('notifications API not available in this Firefox version'));
      }
      return this.browser.notifications.create(options);
    },
  };

  // ── History ──────────────────────────────────────

  history = {
    search: (params: HistorySearchParams): Promise<HistoryItem[]> =>
      this.browser.history.search(params),

    deleteUrl: (url: string): Promise<void> =>
      this.browser.history.deleteUrl({ url }),

    deleteRange: (range: { startTime: number; endTime: number }): Promise<void> =>
      this.browser.history.deleteRange(range),

    deleteAll: (): Promise<void> =>
      this.browser.history.deleteAll(),
  };

  // ── Bookmarks ──────────────────────────────────────

  bookmarks = {
    search: (query: string | BookmarkSearchQuery): Promise<BookmarkTreeNode[]> =>
      this.browser.bookmarks.search(query),

    create: (bookmark: BookmarkCreateArg): Promise<BookmarkTreeNode> =>
      this.browser.bookmarks.create(bookmark),

    update: (id: string, changes: BookmarkChangesArg): Promise<BookmarkTreeNode> =>
      this.browser.bookmarks.update(id, changes),

    remove: (id: string): Promise<void> =>
      this.browser.bookmarks.remove(id),

    getTree: (): Promise<BookmarkTreeNode[]> =>
      this.browser.bookmarks.getTree(),
  };

  // ── Downloads ──────────────────────────────────────

  downloads = {
    search: (query: DownloadQuery): Promise<DownloadItem[]> =>
      this.browser.downloads.search(query),

    download: (options: DownloadOptions): Promise<number> =>
      this.browser.downloads.download(options),

    erase: (query: DownloadQuery): Promise<number[]> =>
      this.browser.downloads.erase(query),

    open: (downloadId: number): Promise<void> =>
      this.browser.downloads.open(downloadId),

    cancel: (downloadId: number): Promise<void> =>
      this.browser.downloads.cancel(downloadId),

    pause: (downloadId: number): Promise<void> =>
      this.browser.downloads.pause(downloadId),

    resume: (downloadId: number): Promise<void> =>
      this.browser.downloads.resume(downloadId),
  };

  // ── Cookies ────────────────────────────────────────

  cookies = {
    get: (details: CookieDetails): Promise<Cookie | null> =>
      this.browser.cookies.get(details),

    getAll: (details: CookieGetAllDetails): Promise<Cookie[]> =>
      this.browser.cookies.getAll(details),

    set: (details: CookieSetDetails): Promise<Cookie | null> =>
      this.browser.cookies.set(details),

    remove: (details: CookieDetails): Promise<CookieDetails> =>
      this.browser.cookies.remove(details),

    getAllCookieStores: (): Promise<CookieStore[]> =>
      this.browser.cookies.getAllCookieStores(),
  };

  // ── Sessions ───────────────────────────────────────

  sessions = {
    getRecentlyClosed: (filter?: SessionFilter): Promise<Session[]> =>
      this.browser.sessions.getRecentlyClosed(filter),

    restore: (sessionId?: string): Promise<Session> =>
      this.browser.sessions.restore(sessionId),
  };

  // ── Storage ────────────────────────────────────────

  storage = {
    local: {
      get: (keys?: string | string[]): Promise<Record<string, unknown>> =>
        this.browser.storage.local.get(keys),

      set: (items: Record<string, unknown>): Promise<void> =>
        this.browser.storage.local.set(items),

      remove: (keys: string | string[]): Promise<void> =>
        this.browser.storage.local.remove(keys),
    },
  };

  // ── Clipboard ──────────────────────────────────────
  // Firefox background 同样无 DOM，clipboard 需 content script 上下文

  clipboard = {
    read: (): Promise<string> =>
      Promise.reject(new Error('Clipboard read requires content script context')),

    write: (_text: string): Promise<void> =>
      Promise.reject(new Error('Clipboard write requires content script context')),
  };

  // ── Event ───────────────────────────────────────────

  addListener(event: BrowserEvent, callback: (...args: any[]) => void): () => void {
    const api = this.resolveEventApi(event);
    if (!api) {
      // Firefox 不支持 tabGroups 事件，返回 no-op
      return () => {};
    }
    api.addListener(callback);
    return () => api.removeListener(callback);
  }

  private resolveEventApi(event: BrowserEvent): any {
    const [namespace, eventName] = event.split('.') as [string, string];
    const ns = (this.browser as any)[namespace];
    if (!ns) return undefined;
    return ns[eventName];
  }
}
