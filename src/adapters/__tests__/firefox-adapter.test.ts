import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirefoxAdapter } from '../firefox-adapter';
import { BrowserEvent } from '../types';

function createMockBrowser() {
  const mockTab = { id: 1, title: 'test', index: 0, windowId: 1, groupId: -1, active: true, pinned: false, discarded: false, incognito: false };
  const mockGroup = { id: 1, title: 'test-group', color: 'blue', collapsed: false, windowId: 1 };

  const mockEvent: any = {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };

  return {
    tabs: {
      query: vi.fn().mockResolvedValue([mockTab]),
      get: vi.fn().mockResolvedValue(mockTab),
      create: vi.fn().mockResolvedValue(mockTab),
      update: vi.fn().mockResolvedValue(mockTab),
      remove: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue([mockTab]),
      group: vi.fn().mockResolvedValue(1),
      ungroup: vi.fn().mockResolvedValue(undefined),
      getCurrent: vi.fn().mockResolvedValue(mockTab),
      reload: vi.fn().mockResolvedValue(undefined),
      duplicate: vi.fn().mockResolvedValue(mockTab),
      highlight: vi.fn().mockResolvedValue({ id: 1, focused: true, incognito: false, alwaysOnTop: false }),
      onCreated: mockEvent,
      onUpdated: mockEvent,
      onRemoved: mockEvent,
      onMoved: mockEvent,
      onAttached: mockEvent,
      onDetached: mockEvent,
      onActivated: mockEvent,
    },
    windows: {
      getAll: vi.fn().mockResolvedValue([{ id: 1, focused: true, incognito: false, alwaysOnTop: false }]),
      get: vi.fn().mockResolvedValue({ id: 1, focused: true, incognito: false, alwaysOnTop: false }),
      create: vi.fn().mockResolvedValue({ id: 1, focused: true, incognito: false, alwaysOnTop: false }),
      update: vi.fn().mockResolvedValue({ id: 1, focused: true, incognito: false, alwaysOnTop: false }),
      remove: vi.fn().mockResolvedValue(undefined),
      getCurrent: vi.fn().mockResolvedValue({ id: 1, focused: true, incognito: false, alwaysOnTop: false }),
      getLastFocused: vi.fn().mockResolvedValue({ id: 1, focused: true, incognito: false, alwaysOnTop: false }),
      onCreated: mockEvent,
      onRemoved: mockEvent,
      onFocusChanged: mockEvent,
    },
    tabGroups: {
      query: vi.fn().mockResolvedValue([mockGroup]),
      get: vi.fn().mockResolvedValue(mockGroup),
      update: vi.fn().mockResolvedValue(mockGroup),
      move: vi.fn().mockResolvedValue(mockGroup),
      onUpdated: mockEvent,
      onMoved: mockEvent,
    },
    history: {
      search: vi.fn().mockResolvedValue([]),
      deleteUrl: vi.fn().mockResolvedValue(undefined),
      deleteRange: vi.fn().mockResolvedValue(undefined),
      deleteAll: vi.fn().mockResolvedValue(undefined),
    },
    notifications: {
      create: vi.fn().mockResolvedValue('notif-ff'),
    },
    bookmarks: {
      search: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: '1', title: 'bm', url: 'https://example.com' }),
      update: vi.fn().mockResolvedValue({ id: '1', title: 'bm2', url: 'https://example.com' }),
      remove: vi.fn().mockResolvedValue(undefined),
      getTree: vi.fn().mockResolvedValue([]),
    },
    downloads: {
      search: vi.fn().mockResolvedValue([]),
      download: vi.fn().mockResolvedValue(7),
      erase: vi.fn().mockResolvedValue([7]),
      open: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
    },
    cookies: {
      get: vi.fn().mockResolvedValue({ name: 'a', value: '1', domain: 'example.com', path: '/', secure: false, httpOnly: false, session: true, hostOnly: false, expirationDate: 0, storeId: '0' }),
      getAll: vi.fn().mockResolvedValue([]),
      set: vi.fn().mockResolvedValue({ name: 'a', value: '2', domain: 'example.com', path: '/', secure: false, httpOnly: false, session: true, hostOnly: false, expirationDate: 0, storeId: '0' }),
      remove: vi.fn().mockResolvedValue({ name: 'a', url: 'https://example.com', storeId: '0' }),
      getAllCookieStores: vi.fn().mockResolvedValue([{ id: '0', tabIds: [] }]),
    },
    sessions: {
      getRecentlyClosed: vi.fn().mockResolvedValue([]),
      restore: vi.fn().mockResolvedValue({ tab: mockTab }),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ key: 'value' }),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
    management: {
      getAll: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({}),
      setEnabled: vi.fn().mockResolvedValue(undefined),
    },
    privacy: {
      network: {
        webRTCIPHandlingPolicy: {
          get: vi.fn().mockResolvedValue({ value: 'default' }),
          set: vi.fn().mockResolvedValue(undefined),
        },
        webRTCNonProxiedUdpEnabled: {
          get: vi.fn().mockResolvedValue({ value: true }),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    },
    proxy: {
      settings: {
        get: vi.fn().mockResolvedValue({ value: { mode: 'system' } }),
        set: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
}

describe('FirefoxAdapter', () => {
  let mockBrowser: ReturnType<typeof createMockBrowser>;
  let adapter: FirefoxAdapter;

  beforeEach(() => {
    mockBrowser = createMockBrowser();
    vi.stubGlobal('browser', mockBrowser);
    adapter = new FirefoxAdapter();
  });

  // ── browserType ─────────────────────────────────

  it('browserType 返回 "firefox"', () => {
    expect(adapter.browserType).toBe('firefox');
  });

  // ── Tabs ────────────────────────────────────────

  describe('tabs', () => {
    it('query 正确转发到 browser.tabs.query', async () => {
      const result = await adapter.tabs.query({ active: true });
      expect(mockBrowser.tabs.query).toHaveBeenCalledWith({ active: true });
      expect(result).toBeDefined();
    });

    it('get 正确转发到 browser.tabs.get', async () => {
      await adapter.tabs.get(1);
      expect(mockBrowser.tabs.get).toHaveBeenCalledWith(1);
    });

    it('create 正确转发到 browser.tabs.create', async () => {
      await adapter.tabs.create({ url: 'https://example.com' });
      expect(mockBrowser.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com' });
    });

    it('update 正确转发到 browser.tabs.update', async () => {
      await adapter.tabs.update(1, { active: true });
      expect(mockBrowser.tabs.update).toHaveBeenCalledWith(1, { active: true });
    });

    it('remove 正确转发到 browser.tabs.remove', async () => {
      await adapter.tabs.remove(1);
      expect(mockBrowser.tabs.remove).toHaveBeenCalledWith(1);
    });

    it('move 正确转发到 browser.tabs.move', async () => {
      await adapter.tabs.move([1, 2], { index: 0 });
      expect(mockBrowser.tabs.move).toHaveBeenCalledWith([1, 2], { index: 0 });
    });

    it('group 正确转发到 browser.tabs.group', async () => {
      const groupId = await adapter.tabs.group({ tabIds: [1, 2] });
      expect(mockBrowser.tabs.group).toHaveBeenCalledWith({ tabIds: [1, 2] });
      expect(groupId).toBe(1);
    });

    it('ungroup 正确转发到 browser.tabs.ungroup', async () => {
      await adapter.tabs.ungroup([1, 2]);
      expect(mockBrowser.tabs.ungroup).toHaveBeenCalledWith([1, 2]);
    });

    it('getCurrent 正确转发到 browser.tabs.getCurrent', async () => {
      await adapter.tabs.getCurrent();
      expect(mockBrowser.tabs.getCurrent).toHaveBeenCalled();
    });

    it('reload 正确转发到 browser.tabs.reload', async () => {
      await adapter.tabs.reload(1);
      expect(mockBrowser.tabs.reload).toHaveBeenCalledWith(1);
    });

    it('duplicate 正确转发到 browser.tabs.duplicate', async () => {
      await adapter.tabs.duplicate(1);
      expect(mockBrowser.tabs.duplicate).toHaveBeenCalledWith(1);
    });

    it('highlight 正确转发到 browser.tabs.highlight', async () => {
      await adapter.tabs.highlight({ tabs: [1] });
      expect(mockBrowser.tabs.highlight).toHaveBeenCalledWith({ tabs: [1] });
    });
  });

  // ── Windows ──────────────────────────────────────

  describe('windows', () => {
    it('getAll 正确转发到 browser.windows.getAll', async () => {
      await adapter.windows.getAll();
      expect(mockBrowser.windows.getAll).toHaveBeenCalled();
    });

    it('get 正确转发到 browser.windows.get', async () => {
      await adapter.windows.get(1);
      expect(mockBrowser.windows.get).toHaveBeenCalledWith(1, undefined);
    });

    it('create 正确转发到 browser.windows.create', async () => {
      await adapter.windows.create({ url: 'https://example.com' });
      expect(mockBrowser.windows.create).toHaveBeenCalledWith({ url: 'https://example.com' });
    });

    it('update 正确转发到 browser.windows.update', async () => {
      await adapter.windows.update(1, { focused: true });
      expect(mockBrowser.windows.update).toHaveBeenCalledWith(1, { focused: true });
    });

    it('remove 正确转发到 browser.windows.remove', async () => {
      await adapter.windows.remove(1);
      expect(mockBrowser.windows.remove).toHaveBeenCalledWith(1);
    });

    it('getCurrent 正确转发到 browser.windows.getCurrent', async () => {
      await adapter.windows.getCurrent();
      expect(mockBrowser.windows.getCurrent).toHaveBeenCalled();
    });

    it('getLastFocused 正确转发到 browser.windows.getLastFocused', async () => {
      await adapter.windows.getLastFocused();
      expect(mockBrowser.windows.getLastFocused).toHaveBeenCalled();
    });
  });

  // ── TabGroups ───────────────────────────────────

  describe('tabGroups', () => {
    it('query 正确转发到 browser.tabGroups.query', async () => {
      const result = await adapter.tabGroups.query({});
      expect(mockBrowser.tabGroups.query).toHaveBeenCalledWith({});
      expect(result).toBeDefined();
    });

    it('get 正确转发到 browser.tabGroups.get', async () => {
      await adapter.tabGroups.get(1);
      expect(mockBrowser.tabGroups.get).toHaveBeenCalledWith(1);
    });

    it('update 正确转发到 browser.tabGroups.update', async () => {
      await adapter.tabGroups.update(1, { collapsed: true });
      expect(mockBrowser.tabGroups.update).toHaveBeenCalledWith(1, { collapsed: true });
    });

    it('move 正确转发到 browser.tabGroups.move', async () => {
      await adapter.tabGroups.move(1, { index: 0 });
      expect(mockBrowser.tabGroups.move).toHaveBeenCalledWith(1, { index: 0 });
    });
  });

  // ── History ──────────────────────────────────────

  describe('history', () => {
    it('search 正确转发到 browser.history.search', async () => {
      const mockItems = [
        { id: '1', url: 'https://example.com', title: 'Example', lastVisitTime: 1000, visitCount: 5, typedCount: 0 },
      ];
      mockBrowser.history.search.mockResolvedValue(mockItems);
      const result = await adapter.history.search({ text: 'test', maxResults: 10 });
      expect(mockBrowser.history.search).toHaveBeenCalledWith({ text: 'test', maxResults: 10 });
      expect(result).toEqual(mockItems);
    });

    it('deleteUrl 正确转发到 browser.history.deleteUrl', async () => {
      await adapter.history.deleteUrl('https://example.com');
      expect(mockBrowser.history.deleteUrl).toHaveBeenCalledWith({ url: 'https://example.com' });
    });

    it('deleteRange 正确转发到 browser.history.deleteRange', async () => {
      await adapter.history.deleteRange({ startTime: 1000, endTime: 2000 });
      expect(mockBrowser.history.deleteRange).toHaveBeenCalledWith({ startTime: 1000, endTime: 2000 });
    });

    it('deleteAll 正确转发到 browser.history.deleteAll', async () => {
      await adapter.history.deleteAll();
      expect(mockBrowser.history.deleteAll).toHaveBeenCalled();
    });
  });

  // ── Notifications ────────────────────────────────

  describe('notifications', () => {
    it('create 正确转发到 browser.notifications.create', async () => {
      mockBrowser.notifications = {
        create: vi.fn().mockResolvedValue('notif-ff'),
      };
      const result = await adapter.notifications.create({ title: 'Test', message: 'Hello' });
      expect(mockBrowser.notifications.create).toHaveBeenCalledWith({ title: 'Test', message: 'Hello' });
      expect(result).toBe('notif-ff');
    });
  });

  // ── Firefox 能力回退 ─────────────────────────────

  describe('tabs.group/ungroup 缺失时的 fallback', () => {
    it('browser.tabs.group 不存在时 reject', async () => {
      vi.stubGlobal('browser', { ...mockBrowser, tabs: { ...mockBrowser.tabs, group: undefined } });
      const ff = new FirefoxAdapter();
      await expect(ff.tabs.group({ tabIds: [1] })).rejects.toThrow('tabs.group is not supported in this Firefox version');
    });

    it('browser.tabs.ungroup 不存在时 reject', async () => {
      vi.stubGlobal('browser', { ...mockBrowser, tabs: { ...mockBrowser.tabs, ungroup: undefined } });
      const ff = new FirefoxAdapter();
      await expect(ff.tabs.ungroup([1])).rejects.toThrow('tabs.ungroup is not supported in this Firefox version');
    });
  });

  describe('tabGroups 缺失时的 fallback', () => {
    let ff: FirefoxAdapter;

    beforeEach(() => {
      vi.stubGlobal('browser', { ...mockBrowser, tabGroups: undefined });
      ff = new FirefoxAdapter();
    });

    it('query 回退为 []', async () => {
      await expect(ff.tabGroups.query({})).resolves.toEqual([]);
    });

    it('get reject 并提示 API 不支持', async () => {
      await expect(ff.tabGroups.get(1)).rejects.toThrow('tabGroups API is not supported in this Firefox version');
    });

    it('update reject 并提示 API 不支持', async () => {
      await expect(ff.tabGroups.update(1, { collapsed: true })).rejects.toThrow('tabGroups API is not supported in this Firefox version');
    });

    it('move reject 并提示 API 不支持', async () => {
      await expect(ff.tabGroups.move(1, { index: 0 })).rejects.toThrow('tabGroups API is not supported in this Firefox version');
    });
  });

  // ── Bookmarks ────────────────────────────────────

  describe('bookmarks', () => {
    it('search 正确转发到 browser.bookmarks.search', async () => {
      const result = await adapter.bookmarks.search({ query: 't' });
      expect(mockBrowser.bookmarks.search).toHaveBeenCalledWith({ query: 't' });
      expect(result).toEqual([]);
    });

    it('create 正确转发到 browser.bookmarks.create', async () => {
      const result = await adapter.bookmarks.create({ parentId: '1', title: 'bm', url: 'https://example.com' });
      expect(mockBrowser.bookmarks.create).toHaveBeenCalledWith({ parentId: '1', title: 'bm', url: 'https://example.com' });
      expect(result.title).toBe('bm');
    });

    it('update 正确转发到 browser.bookmarks.update', async () => {
      const result = await adapter.bookmarks.update('1', { title: 'bm2' });
      expect(mockBrowser.bookmarks.update).toHaveBeenCalledWith('1', { title: 'bm2' });
      expect(result.title).toBe('bm2');
    });

    it('remove 正确转发到 browser.bookmarks.remove', async () => {
      await adapter.bookmarks.remove('1');
      expect(mockBrowser.bookmarks.remove).toHaveBeenCalledWith('1');
    });

    it('getTree 正确转发到 browser.bookmarks.getTree', async () => {
      await adapter.bookmarks.getTree();
      expect(mockBrowser.bookmarks.getTree).toHaveBeenCalled();
    });
  });

  // ── Downloads ────────────────────────────────────

  describe('downloads', () => {
    it('search 正确转发到 browser.downloads.search', async () => {
      const result = await adapter.downloads.search({});
      expect(mockBrowser.downloads.search).toHaveBeenCalledWith({});
      expect(result).toEqual([]);
    });

    it('download 正确转发到 browser.downloads.download', async () => {
      const result = await adapter.downloads.download({ url: 'https://example.com/file' });
      expect(mockBrowser.downloads.download).toHaveBeenCalledWith({ url: 'https://example.com/file' });
      expect(result).toBe(7);
    });

    it('erase 正确转发到 browser.downloads.erase', async () => {
      const result = await adapter.downloads.erase({});
      expect(mockBrowser.downloads.erase).toHaveBeenCalledWith({});
      expect(result).toEqual([7]);
    });

    it('open 正确转发到 browser.downloads.open', async () => {
      await adapter.downloads.open(7);
      expect(mockBrowser.downloads.open).toHaveBeenCalledWith(7);
    });

    it('cancel 正确转发到 browser.downloads.cancel', async () => {
      await adapter.downloads.cancel(7);
      expect(mockBrowser.downloads.cancel).toHaveBeenCalledWith(7);
    });

    it('pause 正确转发到 browser.downloads.pause', async () => {
      await adapter.downloads.pause(7);
      expect(mockBrowser.downloads.pause).toHaveBeenCalledWith(7);
    });

    it('resume 正确转发到 browser.downloads.resume', async () => {
      await adapter.downloads.resume(7);
      expect(mockBrowser.downloads.resume).toHaveBeenCalledWith(7);
    });
  });

  // ── Cookies ──────────────────────────────────────

  describe('cookies', () => {
    it('get 正确转发到 browser.cookies.get', async () => {
      const result = await adapter.cookies.get({ name: 'a', url: 'https://example.com' });
      expect(mockBrowser.cookies.get).toHaveBeenCalledWith({ name: 'a', url: 'https://example.com' });
      expect(result?.value).toBe('1');
    });

    it('getAll 正确转发到 browser.cookies.getAll', async () => {
      await adapter.cookies.getAll({});
      expect(mockBrowser.cookies.getAll).toHaveBeenCalledWith({});
    });

    it('set 正确转发到 browser.cookies.set', async () => {
      const result = await adapter.cookies.set({ name: 'a', value: '2', url: 'https://example.com' });
      expect(mockBrowser.cookies.set).toHaveBeenCalledWith({ name: 'a', value: '2', url: 'https://example.com' });
      expect(result?.value).toBe('2');
    });

    it('remove 正确转发到 browser.cookies.remove', async () => {
      const result = await adapter.cookies.remove({ name: 'a', url: 'https://example.com' });
      expect(mockBrowser.cookies.remove).toHaveBeenCalledWith({ name: 'a', url: 'https://example.com' });
      expect(result).toEqual({ name: 'a', url: 'https://example.com', storeId: '0' });
    });

    it('getAllCookieStores 正确转发到 browser.cookies.getAllCookieStores', async () => {
      const result = await adapter.cookies.getAllCookieStores();
      expect(mockBrowser.cookies.getAllCookieStores).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  // ── Sessions ─────────────────────────────────────

  describe('sessions', () => {
    it('getRecentlyClosed 正确转发到 browser.sessions.getRecentlyClosed', async () => {
      const result = await adapter.sessions.getRecentlyClosed({ maxResults: 5 });
      expect(mockBrowser.sessions.getRecentlyClosed).toHaveBeenCalledWith({ maxResults: 5 });
      expect(result).toEqual([]);
    });

    it('restore 正确转发到 browser.sessions.restore', async () => {
      const result = await adapter.sessions.restore('session-id');
      expect(mockBrowser.sessions.restore).toHaveBeenCalledWith('session-id');
      expect(result).toBeDefined();
    });
  });

  // ── Storage ──────────────────────────────────────

  describe('storage.local', () => {
    it('get 正确转发到 browser.storage.local.get', async () => {
      const result = await adapter.storage.local.get('key');
      expect(mockBrowser.storage.local.get).toHaveBeenCalledWith('key');
      expect(result).toEqual({ key: 'value' });
    });

    it('set 正确转发到 browser.storage.local.set', async () => {
      await adapter.storage.local.set({ key: 'value' });
      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({ key: 'value' });
    });

    it('remove 正确转发到 browser.storage.local.remove', async () => {
      await adapter.storage.local.remove('key');
      expect(mockBrowser.storage.local.remove).toHaveBeenCalledWith('key');
    });
  });

  // ── Clipboard ────────────────────────────────────

  describe('clipboard', () => {
    it('read 在 background 上下文直接 reject', async () => {
      await expect(adapter.clipboard.read()).rejects.toThrow('Clipboard read requires content script context');
    });

    it('write 在 background 上下文直接 reject', async () => {
      await expect(adapter.clipboard.write('text')).rejects.toThrow('Clipboard write requires content script context');
    });
  });

  // ── Management ───────────────────────────────────

  describe('management', () => {
    it('getAll 映射 browser.management.getAll 返回的扩展信息', async () => {
      mockBrowser.management.getAll.mockResolvedValue([
        { id: 'a', name: 'A', version: '1.0', enabled: true, type: 'extension', description: 'desc', mayDisable: true, icons: [{ size: 16, url: 'https://example.com/i.png' }], optionsUrl: 'https://example.com/opt', hostPermissions: ['https://example.com/*'], permissions: ['tabs'] },
        { id: 'b', name: 'B', version: '2.0', enabled: false, type: 'theme', icons: undefined },
      ]);
      const result = await adapter.management.getAll();
      expect(mockBrowser.management.getAll).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'a', name: 'A', version: '1.0', enabled: true, type: 'extension', description: 'desc', mayDisable: true,
        icons: [{ size: 16, url: 'https://example.com/i.png' }], optionsUrl: 'https://example.com/opt',
        hostPermissions: ['https://example.com/*'], permissions: ['tabs'],
      });
      expect(result[1]?.icons).toBeUndefined();
    });

    it('management API 缺失时 getAll 回退为 []', async () => {
      vi.stubGlobal('browser', { ...mockBrowser, management: undefined });
      const ff = new FirefoxAdapter();
      await expect(ff.management.getAll()).resolves.toEqual([]);
    });

    it('get 映射 browser.management.get 返回的单个扩展信息', async () => {
      mockBrowser.management.get.mockResolvedValue({
        id: 'a', name: 'A', version: '1.0', enabled: true, type: 'extension', mayDisable: false,
        icons: [{ size: 48, url: 'https://example.com/i48.png' }],
      });
      const result = await adapter.management.get('a');
      expect(mockBrowser.management.get).toHaveBeenCalledWith('a');
      expect(result.id).toBe('a');
      expect(result.icons).toEqual([{ size: 48, url: 'https://example.com/i48.png' }]);
    });

    it('management.get 缺失时抛错', async () => {
      vi.stubGlobal('browser', { ...mockBrowser, management: undefined });
      const ff = new FirefoxAdapter();
      await expect(ff.management.get('a')).rejects.toThrow('management API is not supported in this Firefox version');
    });

    it('setEnabled 正确转发到 browser.management.setEnabled', async () => {
      await adapter.management.setEnabled('a', true);
      expect(mockBrowser.management.setEnabled).toHaveBeenCalledWith('a', true);
    });

    it('management.setEnabled 缺失时抛错', async () => {
      vi.stubGlobal('browser', { ...mockBrowser, management: undefined });
      const ff = new FirefoxAdapter();
      await expect(ff.management.setEnabled('a', true)).rejects.toThrow('management API is not supported in this Firefox version');
    });
  });

  // ── Privacy ──────────────────────────────────────

  describe('privacy', () => {
    it('getNetworkSettings 读取两项 WebRTC 设置', async () => {
      const result = await adapter.privacy.getNetworkSettings();
      expect(mockBrowser.privacy.network.webRTCIPHandlingPolicy.get).toHaveBeenCalledWith({});
      expect(mockBrowser.privacy.network.webRTCNonProxiedUdpEnabled.get).toHaveBeenCalledWith({});
      expect(result).toEqual({ webRTCIPHandlingPolicy: 'default', webRTCNonProxiedUdpEnabled: true });
    });

    it('privacy API 缺失时 getNetworkSettings 回退为 {}', async () => {
      vi.stubGlobal('browser', { ...mockBrowser, privacy: undefined });
      const ff = new FirefoxAdapter();
      await expect(ff.privacy.getNetworkSettings()).resolves.toEqual({});
    });

    it('setNetworkSetting 按 key 写入对应策略', async () => {
      await adapter.privacy.setNetworkSetting('webRTCIPHandlingPolicy', 'default_public_interface_only');
      expect(mockBrowser.privacy.network.webRTCIPHandlingPolicy.set).toHaveBeenCalledWith({
        value: 'default_public_interface_only',
        scope: 'CONTROLLABLE_BY_THIS_EXTENSION',
      });

      await adapter.privacy.setNetworkSetting('webRTCNonProxiedUdpEnabled', true);
      expect(mockBrowser.privacy.network.webRTCNonProxiedUdpEnabled.set).toHaveBeenCalledWith({
        value: true,
        scope: 'CONTROLLABLE_BY_THIS_EXTENSION',
      });
    });

    it('privacy API 缺失时 setNetworkSetting 抛错', async () => {
      vi.stubGlobal('browser', { ...mockBrowser, privacy: undefined });
      const ff = new FirefoxAdapter();
      await expect(ff.privacy.setNetworkSetting('webRTCIPHandlingPolicy', 'default')).rejects.toThrow('privacy API is not supported in this Firefox version');
    });

    it('未知 key 不触发任何写入', async () => {
      await adapter.privacy.setNetworkSetting('unknownKey', 1);
      expect(mockBrowser.privacy.network.webRTCIPHandlingPolicy.set).not.toHaveBeenCalled();
      expect(mockBrowser.privacy.network.webRTCNonProxiedUdpEnabled.set).not.toHaveBeenCalled();
    });
  });

  // ── Proxy ────────────────────────────────────────

  describe('proxy', () => {
    it('getSettings 返回 browser.proxy.settings.get 结果', async () => {
      const result = await adapter.proxy.getSettings();
      expect(mockBrowser.proxy.settings.get).toHaveBeenCalledWith({});
      expect(result).toEqual({ value: { mode: 'system' } });
    });

    it('proxy 缺失时 getSettings 回退为 {}', async () => {
      vi.stubGlobal('browser', { ...mockBrowser, proxy: undefined });
      const ff = new FirefoxAdapter();
      await expect(ff.proxy.getSettings()).resolves.toEqual({});
    });

    it('setSettings 正确转发到 browser.proxy.settings.set', async () => {
      const config = { value: { mode: 'fixed_servers', rules: { singleProxy: { scheme: 'http', host: 'localhost' } } } };
      await adapter.proxy.setSettings(config);
      expect(mockBrowser.proxy.settings.set).toHaveBeenCalledWith(config);
    });

    it('proxy 缺失时 setSettings 抛错', async () => {
      vi.stubGlobal('browser', { ...mockBrowser, proxy: undefined });
      const ff = new FirefoxAdapter();
      await expect(ff.proxy.setSettings({})).rejects.toThrow('proxy API is not supported in this Firefox version');
    });

    it('clear 正确转发到 browser.proxy.settings.clear', async () => {
      await adapter.proxy.clear();
      expect(mockBrowser.proxy.settings.clear).toHaveBeenCalledWith({});
    });

    it('proxy 缺失时 clear 抛错', async () => {
      vi.stubGlobal('browser', { ...mockBrowser, proxy: undefined });
      const ff = new FirefoxAdapter();
      await expect(ff.proxy.clear()).rejects.toThrow('proxy API is not supported in this Firefox version');
    });
  });

  // ── Debugger（Firefox 不支持）─────────────────────

  describe('debugger', () => {
    it('getTargets 恒返回空数组', async () => {
      await expect(adapter.debugger.getTargets()).resolves.toEqual([]);
    });

    it('attach 恒抛不支持错误', async () => {
      await expect(adapter.debugger.attach('target-1')).rejects.toThrow('debugger API is not supported in Firefox');
    });

    it('detach 恒抛不支持错误', async () => {
      await expect(adapter.debugger.detach('target-1')).rejects.toThrow('debugger API is not supported in Firefox');
    });
  });

  // ── DeclarativeNetRequest（Firefox 不支持）────────

  describe('declarativeNetRequest', () => {
    it('getDynamicRules 恒返回空数组', async () => {
      await expect(adapter.declarativeNetRequest.getDynamicRules()).resolves.toEqual([]);
    });

    it('addDynamicRules 恒抛不支持错误', async () => {
      await expect(adapter.declarativeNetRequest.addDynamicRules([])).rejects.toThrow('declarativeNetRequest API is not supported in Firefox');
    });

    it('removeDynamicRules 恒抛不支持错误', async () => {
      await expect(adapter.declarativeNetRequest.removeDynamicRules([1])).rejects.toThrow('declarativeNetRequest API is not supported in Firefox');
    });
  });

  // ── Events ───────────────────────────────────────

  describe('addListener', () => {
    it('注册 tabs.onCreated 事件', () => {
      const cb = vi.fn();
      adapter.addListener(BrowserEvent.TAB_CREATED, cb);
      expect(mockBrowser.tabs.onCreated.addListener).toHaveBeenCalledWith(cb);
    });

    it('注册 windows.onCreated 事件', () => {
      const cb = vi.fn();
      adapter.addListener(BrowserEvent.WINDOW_CREATED, cb);
      expect(mockBrowser.windows.onCreated.addListener).toHaveBeenCalledWith(cb);
    });

    it('tabGroups 事件正确注册', () => {
      const cb = vi.fn();
      adapter.addListener(BrowserEvent.TAB_GROUP_UPDATED, cb);
      expect(mockBrowser.tabGroups.onUpdated.addListener).toHaveBeenCalledWith(cb);
    });

    it('注册事件后返回的取消函数能正确移除监听器', () => {
      const cb = vi.fn();
      const unsubscribe = adapter.addListener(BrowserEvent.TAB_CREATED, cb);
      unsubscribe();
      expect(mockBrowser.tabs.onCreated.removeListener).toHaveBeenCalledWith(cb);
    });

    it('事件 API 缺失时返回 noop 取消函数', () => {
      vi.stubGlobal('browser', { ...mockBrowser, tabGroups: undefined });
      const ff = new FirefoxAdapter();
      const cb = vi.fn();
      const unsubscribe = ff.addListener(BrowserEvent.TAB_GROUP_UPDATED, cb);
      expect(cb).not.toHaveBeenCalled();
      expect(() => unsubscribe()).not.toThrow();
    });
  });
});
