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
import type { IBrowserAdapter, ExtensionInfo } from './types';
import { BrowserEvent } from './types';

/**
 * Chrome 浏览器适配器
 * 直接封装 chrome.tabs / chrome.windows / chrome.tabGroups API
 */
export class ChromeAdapter implements IBrowserAdapter {
  readonly browserType = 'chrome' as const;

  // ── Tabs ────────────────────────────────────────────

  tabs = {
    query: (queryInfo: TabQueryInfo): Promise<Tab[]> =>
      chrome.tabs.query(queryInfo) as Promise<Tab[]>,

    get: (tabId: number): Promise<Tab> =>
      chrome.tabs.get(tabId) as Promise<Tab>,

    create: (createProperties: TabCreateProperties): Promise<Tab> =>
      chrome.tabs.create(createProperties) as Promise<Tab>,

    update: (tabId: number, updateProperties: TabUpdateProperties): Promise<Tab> =>
      chrome.tabs.update(tabId, updateProperties) as Promise<Tab>,

    remove: (tabIds: number | number[]): Promise<void> =>
      (chrome.tabs.remove as any)(tabIds),

    move: (
      tabIds: number | number[],
      moveProperties: { windowId?: number; index: number },
    ): Promise<Tab | Tab[]> =>
      (chrome.tabs.move as any)(tabIds, moveProperties) as Promise<Tab | Tab[]>,

    group: (options: {
      tabIds: number | number[];
      groupId?: number;
      createProperties?: { windowId?: number };
    }): Promise<number> =>
      chrome.tabs.group(options),

    ungroup: (tabIds: number | number[]): Promise<void> =>
      chrome.tabs.ungroup(tabIds),

    getCurrent: (): Promise<Tab> =>
      chrome.tabs.getCurrent() as Promise<Tab>,

    reload: (tabId: number): Promise<void> =>
      chrome.tabs.reload(tabId),

    duplicate: (tabId: number): Promise<Tab> =>
      chrome.tabs.duplicate(tabId) as Promise<Tab>,

    highlight: (highlightInfo: { tabs: number[] | number; windowId?: number }): Promise<Window> =>
      chrome.tabs.highlight(highlightInfo) as Promise<Window>,
  };

  // ── Windows ─────────────────────────────────────────

  windows = {
    getAll: (getInfo?: WindowGetInfo): Promise<Window[]> =>
      (chrome.windows.getAll as any)(getInfo) as Promise<Window[]>,

    get: (windowId: number, getInfo?: WindowGetInfo): Promise<Window> =>
      (chrome.windows.get as any)(windowId, getInfo) as Promise<Window>,

    create: (createData?: WindowCreateData): Promise<Window> =>
      chrome.windows.create(createData as chrome.windows.CreateData) as Promise<Window>,

    update: (windowId: number, updateInfo: WindowUpdateInfo): Promise<Window> =>
      chrome.windows.update(windowId, updateInfo) as Promise<Window>,

    remove: (windowId: number): Promise<void> =>
      chrome.windows.remove(windowId),

    getCurrent: (getInfo?: WindowGetInfo): Promise<Window> =>
      (chrome.windows.getCurrent as any)(getInfo) as Promise<Window>,

    getLastFocused: (getInfo?: WindowGetInfo): Promise<Window> =>
      (chrome.windows.getLastFocused as any)(getInfo) as Promise<Window>,
  };

  // ── TabGroups ───────────────────────────────────────

  tabGroups = {
    query: (queryInfo: TabGroupQueryInfo): Promise<TabGroup[]> =>
      chrome.tabGroups.query(queryInfo) as Promise<TabGroup[]>,

    get: (groupId: number): Promise<TabGroup> =>
      chrome.tabGroups.get(groupId) as Promise<TabGroup>,

    update: (groupId: number, updateProperties: TabGroupUpdateProperties): Promise<TabGroup> =>
      chrome.tabGroups.update(groupId, updateProperties) as Promise<TabGroup>,

    move: (
      groupId: number,
      moveProperties: { windowId?: number; index: number },
    ): Promise<TabGroup> =>
      chrome.tabGroups.move(groupId, moveProperties) as Promise<TabGroup>,
  };

  // ── Notifications ──────────────────────────────────

  notifications = {
    create: (options: NotificationsCreateOptions): Promise<string> => {
      return new Promise((resolve) => {
        chrome.notifications.create('', options as any, (id) => resolve(id));
      });
    },
  };

  // ── History ──────────────────────────────────────

  history = {
    search: (params: HistorySearchParams): Promise<HistoryItem[]> =>
      chrome.history.search(params as chrome.history.HistoryQuery) as Promise<HistoryItem[]>,

    deleteUrl: (url: string): Promise<void> =>
      chrome.history.deleteUrl({ url }),

    deleteRange: (range: { startTime: number; endTime: number }): Promise<void> =>
      chrome.history.deleteRange(range),

    deleteAll: (): Promise<void> =>
      chrome.history.deleteAll(),
  };

  // ── Bookmarks ──────────────────────────────────────

  bookmarks = {
    search: (query: string | BookmarkSearchQuery): Promise<BookmarkTreeNode[]> =>
      chrome.bookmarks.search(query as any) as Promise<BookmarkTreeNode[]>,

    create: (bookmark: BookmarkCreateArg): Promise<BookmarkTreeNode> =>
      chrome.bookmarks.create(bookmark) as Promise<BookmarkTreeNode>,

    update: (id: string, changes: BookmarkChangesArg): Promise<BookmarkTreeNode> =>
      chrome.bookmarks.update(id, changes) as Promise<BookmarkTreeNode>,

    remove: (id: string): Promise<void> =>
      chrome.bookmarks.remove(id),

    getTree: (): Promise<BookmarkTreeNode[]> =>
      chrome.bookmarks.getTree() as Promise<BookmarkTreeNode[]>,
  };

  // ── Downloads ──────────────────────────────────────

  downloads = {
    search: (query: DownloadQuery): Promise<DownloadItem[]> =>
      chrome.downloads.search(query as chrome.downloads.DownloadQuery) as Promise<DownloadItem[]>,

    download: (options: DownloadOptions): Promise<number> =>
      chrome.downloads.download(options as chrome.downloads.DownloadOptions) as Promise<number>,

    erase: (query: DownloadQuery): Promise<number[]> =>
      chrome.downloads.erase(query as chrome.downloads.DownloadQuery) as Promise<number[]>,

    open: (downloadId: number): Promise<void> =>
      new Promise((resolve) => {
        chrome.downloads.open(downloadId);
        resolve();
      }),

    cancel: (downloadId: number): Promise<void> =>
      chrome.downloads.cancel(downloadId),

    pause: (downloadId: number): Promise<void> =>
      chrome.downloads.pause(downloadId),

    resume: (downloadId: number): Promise<void> =>
      chrome.downloads.resume(downloadId),
  };

  // ── Cookies ────────────────────────────────────────

  cookies = {
    get: (details: CookieDetails): Promise<Cookie | null> =>
      chrome.cookies.get(details as chrome.cookies.CookieDetails) as Promise<Cookie | null>,

    getAll: (details: CookieGetAllDetails): Promise<Cookie[]> =>
      chrome.cookies.getAll(details as chrome.cookies.GetAllDetails) as Promise<Cookie[]>,

    set: (details: CookieSetDetails): Promise<Cookie | null> =>
      chrome.cookies.set(details as chrome.cookies.SetDetails) as Promise<Cookie | null>,

    remove: (details: CookieDetails): Promise<CookieDetails> =>
      chrome.cookies.remove(details as chrome.cookies.CookieDetails) as Promise<CookieDetails>,

    getAllCookieStores: (): Promise<CookieStore[]> =>
      chrome.cookies.getAllCookieStores() as Promise<CookieStore[]>,
  };

  // ── Sessions ───────────────────────────────────────

  sessions = {
    getRecentlyClosed: (filter?: SessionFilter): Promise<Session[]> =>
      chrome.sessions.getRecentlyClosed(filter as chrome.sessions.Filter) as Promise<Session[]>,

    restore: (sessionId?: string): Promise<Session> =>
      chrome.sessions.restore(sessionId) as Promise<Session>,
  };

  // ── Storage ────────────────────────────────────────

  storage = {
    local: {
      get: (keys?: string | string[]): Promise<Record<string, unknown>> =>
        chrome.storage.local.get(keys) as Promise<Record<string, unknown>>,

      set: (items: Record<string, unknown>): Promise<void> =>
        chrome.storage.local.set(items),

      remove: (keys: string | string[]): Promise<void> =>
        chrome.storage.local.remove(keys),
    },
  };

  // ── Clipboard ──────────────────────────────────────
  // Chrome MV3 中 background 无 DOM，navigator.clipboard 不可用
  // 需通过 offscreen document，此处标记为不支持，由调用方处理

  clipboard = {
    read: (): Promise<string> =>
      Promise.reject(new Error('Clipboard read requires content script context')),

    write: (_text: string): Promise<void> =>
      Promise.reject(new Error('Clipboard write requires content script context')),
  };

  // ── Event ───────────────────────────────────────────

  addListener(event: BrowserEvent, callback: (...args: any[]) => void): () => void {
    const api = this.resolveEventApi(event);
    api.addListener(callback);
    return () => api.removeListener(callback);
  }

  private resolveEventApi(event: BrowserEvent): chrome.events.Event<any> {
    const [namespace, eventName] = event.split('.') as [string, string];
    switch (namespace) {
      case 'tabs': return (chrome.tabs as any)[eventName];
      case 'windows': return (chrome.windows as any)[eventName];
      case 'tabGroups': return (chrome.tabGroups as any)[eventName];
      default:
        throw new Error(`Unknown event namespace: ${namespace}`);
    }
  }

  // ── Management ──────────────────────────────────────

  management = {
    getAll: async (): Promise<ExtensionInfo[]> => {
      const infos = await chrome.management.getAll();
      return infos.map(i => ({
        id: i.id, name: i.name, version: i.version,
        enabled: i.enabled, type: i.type, description: i.description,
        mayDisable: i.mayDisable,
        icons: i.icons?.map(ic => ({ size: ic.size, url: ic.url })),
        optionsUrl: i.optionsUrl,
        hostPermissions: i.hostPermissions,
        permissions: i.permissions,
      }));
    },

    get: async (id: string): Promise<ExtensionInfo> => {
      const i = await chrome.management.get(id);
      return {
        id: i.id, name: i.name, version: i.version,
        enabled: i.enabled, type: i.type, description: i.description,
        mayDisable: i.mayDisable,
        icons: i.icons?.map(ic => ({ size: ic.size, url: ic.url })),
        optionsUrl: i.optionsUrl,
        hostPermissions: i.hostPermissions,
        permissions: i.permissions,
      };
    },

    setEnabled: async (id: string, enabled: boolean): Promise<void> => {
      await chrome.management.setEnabled(id, enabled);
    },
  };

  // ── Privacy ─────────────────────────────────────────

  privacy = {
    getNetworkSettings: async (): Promise<Record<string, unknown>> => {
      const ipPolicy = await (chrome.privacy.network.webRTCIPHandlingPolicy.get as any)({});
      const saltedRemote = await (chrome.privacy.network.webRTCNonProxiedUdpEnabled.get as any)({});
      return {
        webRTCIPHandlingPolicy: (ipPolicy as any).value,
        webRTCNonProxiedUdpEnabled: (saltedRemote as any).value,
      };
    },

    setNetworkSetting: async (key: string, value: unknown): Promise<void> => {
      const scope = 'CONTROLLABLE_BY_THIS_EXTENSION';
      if (key === 'webRTCIPHandlingPolicy') {
        await (chrome.privacy.network.webRTCIPHandlingPolicy.set as any)({ value, scope });
      } else if (key === 'webRTCNonProxiedUdpEnabled') {
        await (chrome.privacy.network.webRTCNonProxiedUdpEnabled.set as any)({ value, scope });
      }
    },
  };

  // ── Proxy ───────────────────────────────────────────

  proxy = {
    getSettings: async (): Promise<Record<string, unknown>> => {
      const cfg = await (chrome.proxy.settings.get as any)({});
      return cfg;
    },

    setSettings: async (config: Record<string, unknown>): Promise<void> => {
      await (chrome.proxy.settings.set as any)(config);
    },

    clear: async (): Promise<void> => {
      await (chrome.proxy.settings.clear as any)({});
    },
  };

  // ── Debugger ─────────────────────────────────────────

  debugger = {
    getTargets: async (): Promise<{ id: string; tabId?: number; title: string; url: string; attached: boolean }[]> => {
      const targets = await chrome.debugger.getTargets();
      return targets.map(t => ({
        id: t.id,
        tabId: t.tabId,
        title: t.title ?? '',
        url: t.url ?? '',
        attached: t.attached,
      }));
    },

    attach: async (targetId: string): Promise<void> => {
      await chrome.debugger.attach({ targetId }, '1.3');
    },

    detach: async (targetId: string): Promise<void> => {
      await chrome.debugger.detach({ targetId });
    },
  };

  // ── DeclarativeNetRequest ───────────────────────────

  declarativeNetRequest = {
    getDynamicRules: async (): Promise<chrome.declarativeNetRequest.Rule[]> => {
      return chrome.declarativeNetRequest.getDynamicRules();
    },

    addDynamicRules: async (rules: chrome.declarativeNetRequest.Rule[]): Promise<void> => {
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules, removeRuleIds: [] });
    },

    removeDynamicRules: async (ruleIds: number[]): Promise<void> => {
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [], removeRuleIds: ruleIds });
    },
  };
}
