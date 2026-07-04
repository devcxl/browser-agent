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
 * Firefox 浏览器适配器
 * Firefox 使用 `browser.*` 命名空间
 * Firefox 152+ 已支持 tabGroups API
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

    group: (options: {
      tabIds: number | number[];
      groupId?: number;
      createProperties?: { windowId?: number };
    }): Promise<number> => {
      if (typeof this.browser.tabs.group !== 'function') {
        return Promise.reject(new Error('tabs.group is not supported in this Firefox version'));
      }
      return this.browser.tabs.group(options);
    },

    ungroup: (tabIds: number | number[]): Promise<void> => {
      if (typeof this.browser.tabs.ungroup !== 'function') {
        return Promise.reject(new Error('tabs.ungroup is not supported in this Firefox version'));
      }
      return this.browser.tabs.ungroup(tabIds);
    },

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

  // ── TabGroups ──────────────────────────────────────
  // Firefox 152+ 才支持 tabGroups API，低版本返回明确错误

  tabGroups = {
    query: (queryInfo: TabGroupQueryInfo): Promise<TabGroup[]> => {
      if (typeof this.browser.tabGroups?.query !== 'function') {
        return Promise.resolve([]);
      }
      return this.browser.tabGroups.query(queryInfo);
    },

    get: (groupId: number): Promise<TabGroup> => {
      if (typeof this.browser.tabGroups?.get !== 'function') {
        return Promise.reject(new Error('tabGroups API is not supported in this Firefox version'));
      }
      return this.browser.tabGroups.get(groupId);
    },

    update: (groupId: number, updateProperties: TabGroupUpdateProperties): Promise<TabGroup> => {
      if (typeof this.browser.tabGroups?.update !== 'function') {
        return Promise.reject(new Error('tabGroups API is not supported in this Firefox version'));
      }
      return this.browser.tabGroups.update(groupId, updateProperties);
    },

    move: (
      groupId: number,
      moveProperties: { windowId?: number; index: number },
    ): Promise<TabGroup> => {
      if (typeof this.browser.tabGroups?.move !== 'function') {
        return Promise.reject(new Error('tabGroups API is not supported in this Firefox version'));
      }
      return this.browser.tabGroups.move(groupId, moveProperties);
    },
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

  // ── Management ──────────────────────────────────────

  management = {
    getAll: async (): Promise<ExtensionInfo[]> => {
      if (typeof this.browser?.management?.getAll !== 'function') {
        return [];
      }
      const infos = await this.browser.management.getAll();
      return infos.map((i: any) => ({
        id: i.id, name: i.name, version: i.version,
        enabled: i.enabled, type: i.type, description: i.description,
        mayDisable: i.mayDisable,
        icons: i.icons?.map((ic: any) => ({ size: ic.size, url: ic.url })),
        optionsUrl: i.optionsUrl,
        hostPermissions: i.hostPermissions,
        permissions: i.permissions,
      }));
    },

    get: async (id: string): Promise<ExtensionInfo> => {
      if (typeof this.browser?.management?.get !== 'function') {
        throw new Error('management API is not supported in this Firefox version');
      }
      const i = await this.browser.management.get(id);
      return {
        id: i.id, name: i.name, version: i.version,
        enabled: i.enabled, type: i.type, description: i.description,
        mayDisable: i.mayDisable,
        icons: i.icons?.map((ic: any) => ({ size: ic.size, url: ic.url })),
        optionsUrl: i.optionsUrl,
        hostPermissions: i.hostPermissions,
        permissions: i.permissions,
      };
    },

    setEnabled: async (id: string, enabled: boolean): Promise<void> => {
      if (typeof this.browser?.management?.setEnabled !== 'function') {
        throw new Error('management API is not supported in this Firefox version');
      }
      await this.browser.management.setEnabled(id, enabled);
    },
  };

  // ── Privacy ─────────────────────────────────────────

  privacy = {
    getNetworkSettings: async (): Promise<Record<string, unknown>> => {
      if (typeof this.browser?.privacy?.network?.webRTCIPHandlingPolicy?.get !== 'function') {
        return {};
      }
      const ipPolicy = await this.browser.privacy.network.webRTCIPHandlingPolicy.get({});
      const saltedRemote = await this.browser.privacy.network.webRTCNonProxiedUdpEnabled.get({});
      return {
        webRTCIPHandlingPolicy: ipPolicy.value,
        webRTCNonProxiedUdpEnabled: saltedRemote.value,
      };
    },

    setNetworkSetting: async (key: string, value: unknown): Promise<void> => {
      if (typeof this.browser?.privacy?.network !== 'object') {
        throw new Error('privacy API is not supported in this Firefox version');
      }
      const scope = 'CONTROLLABLE_BY_THIS_EXTENSION';
      if (key === 'webRTCIPHandlingPolicy') {
        await this.browser.privacy.network.webRTCIPHandlingPolicy.set({ value, scope });
      } else if (key === 'webRTCNonProxiedUdpEnabled') {
        await this.browser.privacy.network.webRTCNonProxiedUdpEnabled.set({ value, scope });
      }
    },
  };

  // ── Proxy ───────────────────────────────────────────

  proxy = {
    getSettings: async (): Promise<Record<string, unknown>> => {
      if (typeof this.browser?.proxy?.settings?.get !== 'function') {
        return {};
      }
      const cfg = await this.browser.proxy.settings.get({});
      return cfg;
    },

    setSettings: async (config: Record<string, unknown>): Promise<void> => {
      if (typeof this.browser?.proxy?.settings?.set !== 'function') {
        throw new Error('proxy API is not supported in this Firefox version');
      }
      await this.browser.proxy.settings.set(config);
    },

    clear: async (): Promise<void> => {
      if (typeof this.browser?.proxy?.settings?.clear !== 'function') {
        throw new Error('proxy API is not supported in this Firefox version');
      }
      await this.browser.proxy.settings.clear({});
    },
  };

  // ── Debugger ─────────────────────────────────────────
  // Firefox 不支持 chrome.debugger API

  debugger = {
    getTargets: async (): Promise<{ id: string; tabId?: number; title: string; url: string; attached: boolean }[]> => {
      return [];
    },

    attach: async (_targetId: string): Promise<void> => {
      throw new Error('debugger API is not supported in Firefox');
    },

    detach: async (_targetId: string): Promise<void> => {
      throw new Error('debugger API is not supported in Firefox');
    },
  };

  // ── DeclarativeNetRequest ───────────────────────────
  // Firefox 不支持 declarativeNetRequest API

  declarativeNetRequest = {
    getDynamicRules: async (): Promise<chrome.declarativeNetRequest.Rule[]> => {
      return [];
    },

    addDynamicRules: async (_rules: chrome.declarativeNetRequest.Rule[]): Promise<void> => {
      throw new Error('declarativeNetRequest API is not supported in Firefox');
    },

    removeDynamicRules: async (_ruleIds: number[]): Promise<void> => {
      throw new Error('declarativeNetRequest API is not supported in Firefox');
    },
  };
}
