import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChromeAdapter } from '../chrome-adapter';
import { BrowserEvent } from '../types';

function createMockChrome() {
  const mockTab = { id: 1, title: 'test', index: 0, windowId: 1, groupId: -1, active: true, pinned: false, discarded: false, incognito: false };

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
      group: vi.fn().mockResolvedValue(42),
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
      query: vi.fn().mockResolvedValue([{ id: 1, collapsed: false, color: 'blue', windowId: 1 }]),
      get: vi.fn().mockResolvedValue({ id: 1, collapsed: false, color: 'blue', windowId: 1 }),
      update: vi.fn().mockResolvedValue({ id: 1, collapsed: true, color: 'red', windowId: 1 }),
      move: vi.fn().mockResolvedValue({ id: 1, collapsed: false, color: 'blue', windowId: 1 }),
      onUpdated: mockEvent,
      onMoved: mockEvent,
    },
    notifications: {
      create: vi.fn().mockImplementation((_id, _options, cb) => {
        cb('notif-42');
      }),
    },
    history: {
      search: vi.fn().mockResolvedValue([]),
      deleteUrl: vi.fn().mockResolvedValue(undefined),
      deleteRange: vi.fn().mockResolvedValue(undefined),
      deleteAll: vi.fn().mockResolvedValue(undefined),
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
    debugger: {
      getTargets: vi.fn().mockResolvedValue([]),
      attach: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
    },
    declarativeNetRequest: {
      getDynamicRules: vi.fn().mockResolvedValue([]),
      updateDynamicRules: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('ChromeAdapter', () => {
  let mockChrome: ReturnType<typeof createMockChrome>;
  let adapter: ChromeAdapter;

  beforeEach(() => {
    mockChrome = createMockChrome();
    vi.stubGlobal('chrome', mockChrome);
    adapter = new ChromeAdapter();
  });

  // ── browserType ─────────────────────────────────

  it('browserType 返回 "chrome"', () => {
    expect(adapter.browserType).toBe('chrome');
  });

  // ── Tabs ────────────────────────────────────────

  describe('tabs', () => {
    it('query 正确转发到 chrome.tabs.query', async () => {
      const result = await adapter.tabs.query({ active: true });
      expect(mockChrome.tabs.query).toHaveBeenCalledWith({ active: true });
      expect(result).toEqual([{ id: 1, title: 'test', index: 0, windowId: 1, groupId: -1, active: true, pinned: false, discarded: false, incognito: false }]);
    });

    it('get 正确转发到 chrome.tabs.get', async () => {
      const result = await adapter.tabs.get(1);
      expect(mockChrome.tabs.get).toHaveBeenCalledWith(1);
      expect(result).toBeDefined();
    });

    it('create 正确转发到 chrome.tabs.create', async () => {
      const result = await adapter.tabs.create({ url: 'https://example.com' });
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com' });
      expect(result).toBeDefined();
    });

    it('update 正确转发到 chrome.tabs.update', async () => {
      const result = await adapter.tabs.update(1, { active: true });
      expect(mockChrome.tabs.update).toHaveBeenCalledWith(1, { active: true });
      expect(result).toBeDefined();
    });

    it('remove 正确转发到 chrome.tabs.remove', async () => {
      await adapter.tabs.remove(1);
      expect(mockChrome.tabs.remove).toHaveBeenCalledWith(1);
    });

    it('move 正确转发到 chrome.tabs.move', async () => {
      await adapter.tabs.move([1, 2], { index: 0 });
      expect(mockChrome.tabs.move).toHaveBeenCalledWith([1, 2], { index: 0 });
    });

    it('group 正确转发到 chrome.tabs.group', async () => {
      const result = await adapter.tabs.group({ tabIds: [1, 2] });
      expect(mockChrome.tabs.group).toHaveBeenCalledWith({ tabIds: [1, 2] });
      expect(result).toBe(42);
    });

    it('ungroup 正确转发到 chrome.tabs.ungroup', async () => {
      await adapter.tabs.ungroup([1, 2]);
      expect(mockChrome.tabs.ungroup).toHaveBeenCalledWith([1, 2]);
    });

    it('getCurrent 正确转发到 chrome.tabs.getCurrent', async () => {
      await adapter.tabs.getCurrent();
      expect(mockChrome.tabs.getCurrent).toHaveBeenCalled();
    });

    it('reload 正确转发到 chrome.tabs.reload', async () => {
      await adapter.tabs.reload(1);
      expect(mockChrome.tabs.reload).toHaveBeenCalledWith(1);
    });

    it('duplicate 正确转发到 chrome.tabs.duplicate', async () => {
      await adapter.tabs.duplicate(1);
      expect(mockChrome.tabs.duplicate).toHaveBeenCalledWith(1);
    });

    it('highlight 正确转发到 chrome.tabs.highlight', async () => {
      await adapter.tabs.highlight({ tabs: [1] });
      expect(mockChrome.tabs.highlight).toHaveBeenCalledWith({ tabs: [1] });
    });
  });

  // ── Windows ──────────────────────────────────────

  describe('windows', () => {
    it('getAll 正确转发到 chrome.windows.getAll', async () => {
      const result = await adapter.windows.getAll();
      expect(mockChrome.windows.getAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('get 正确转发到 chrome.windows.get', async () => {
      await adapter.windows.get(1);
      expect(mockChrome.windows.get).toHaveBeenCalledWith(1, undefined);
    });

    it('create 正确转发到 chrome.windows.create', async () => {
      await adapter.windows.create({ url: 'https://example.com' });
      expect(mockChrome.windows.create).toHaveBeenCalledWith({ url: 'https://example.com' });
    });

    it('update 正确转发到 chrome.windows.update', async () => {
      await adapter.windows.update(1, { focused: true });
      expect(mockChrome.windows.update).toHaveBeenCalledWith(1, { focused: true });
    });

    it('remove 正确转发到 chrome.windows.remove', async () => {
      await adapter.windows.remove(1);
      expect(mockChrome.windows.remove).toHaveBeenCalledWith(1);
    });

    it('getCurrent 正确转发到 chrome.windows.getCurrent', async () => {
      await adapter.windows.getCurrent();
      expect(mockChrome.windows.getCurrent).toHaveBeenCalled();
    });

    it('getLastFocused 正确转发到 chrome.windows.getLastFocused', async () => {
      await adapter.windows.getLastFocused();
      expect(mockChrome.windows.getLastFocused).toHaveBeenCalled();
    });
  });

  // ── TabGroups ────────────────────────────────────

  describe('tabGroups', () => {
    it('query 正确转发到 chrome.tabGroups.query', async () => {
      const result = await adapter.tabGroups.query({});
      expect(mockChrome.tabGroups.query).toHaveBeenCalledWith({});
      expect(result).toBeDefined();
    });

    it('get 正确转发到 chrome.tabGroups.get', async () => {
      await adapter.tabGroups.get(1);
      expect(mockChrome.tabGroups.get).toHaveBeenCalledWith(1);
    });

    it('update 正确转发到 chrome.tabGroups.update', async () => {
      await adapter.tabGroups.update(1, { collapsed: true });
      expect(mockChrome.tabGroups.update).toHaveBeenCalledWith(1, { collapsed: true });
    });

    it('move 正确转发到 chrome.tabGroups.move', async () => {
      await adapter.tabGroups.move(1, { index: 0 });
      expect(mockChrome.tabGroups.move).toHaveBeenCalledWith(1, { index: 0 });
    });
  });

  // ── Notifications ────────────────────────────────

  describe('notifications', () => {
    it('create 正确转发到 chrome.notifications.create', async () => {
      const result = await adapter.notifications.create({ title: 'Test', message: 'Hello' });
      expect(mockChrome.notifications.create).toHaveBeenCalledWith('', { title: 'Test', message: 'Hello' }, expect.any(Function));
      expect(result).toBe('notif-42');
    });
  });

  // ── Bookmarks ────────────────────────────────────

  describe('bookmarks', () => {
    it('search 正确转发到 chrome.bookmarks.search', async () => {
      mockChrome.bookmarks.search.mockResolvedValue([{ id: '1', title: 't', url: 'https://example.com' }]);
      const result = await adapter.bookmarks.search({ query: 't' });
      expect(mockChrome.bookmarks.search).toHaveBeenCalledWith({ query: 't' });
      expect(result).toHaveLength(1);
    });

    it('create 正确转发到 chrome.bookmarks.create', async () => {
      const result = await adapter.bookmarks.create({ parentId: '1', title: 'bm', url: 'https://example.com' });
      expect(mockChrome.bookmarks.create).toHaveBeenCalledWith({ parentId: '1', title: 'bm', url: 'https://example.com' });
      expect(result.title).toBe('bm');
    });

    it('update 正确转发到 chrome.bookmarks.update', async () => {
      const result = await adapter.bookmarks.update('1', { title: 'bm2' });
      expect(mockChrome.bookmarks.update).toHaveBeenCalledWith('1', { title: 'bm2' });
      expect(result.title).toBe('bm2');
    });

    it('remove 正确转发到 chrome.bookmarks.remove', async () => {
      await adapter.bookmarks.remove('1');
      expect(mockChrome.bookmarks.remove).toHaveBeenCalledWith('1');
    });

    it('getTree 正确转发到 chrome.bookmarks.getTree', async () => {
      await adapter.bookmarks.getTree();
      expect(mockChrome.bookmarks.getTree).toHaveBeenCalled();
    });
  });

  // ── Downloads ────────────────────────────────────

  describe('downloads', () => {
    it('search 正确转发到 chrome.downloads.search', async () => {
      const result = await adapter.downloads.search({});
      expect(mockChrome.downloads.search).toHaveBeenCalledWith({});
      expect(result).toEqual([]);
    });

    it('download 正确转发到 chrome.downloads.download', async () => {
      const result = await adapter.downloads.download({ url: 'https://example.com/file' });
      expect(mockChrome.downloads.download).toHaveBeenCalledWith({ url: 'https://example.com/file' });
      expect(result).toBe(7);
    });

    it('erase 正确转发到 chrome.downloads.erase', async () => {
      const result = await adapter.downloads.erase({});
      expect(mockChrome.downloads.erase).toHaveBeenCalledWith({});
      expect(result).toEqual([7]);
    });

    it('open 调用 chrome.downloads.open 并解析为 undefined', async () => {
      const result = await adapter.downloads.open(7);
      expect(mockChrome.downloads.open).toHaveBeenCalledWith(7);
      expect(result).toBeUndefined();
    });

    it('cancel 正确转发到 chrome.downloads.cancel', async () => {
      await adapter.downloads.cancel(7);
      expect(mockChrome.downloads.cancel).toHaveBeenCalledWith(7);
    });

    it('pause 正确转发到 chrome.downloads.pause', async () => {
      await adapter.downloads.pause(7);
      expect(mockChrome.downloads.pause).toHaveBeenCalledWith(7);
    });

    it('resume 正确转发到 chrome.downloads.resume', async () => {
      await adapter.downloads.resume(7);
      expect(mockChrome.downloads.resume).toHaveBeenCalledWith(7);
    });
  });

  // ── Cookies ──────────────────────────────────────

  describe('cookies', () => {
    it('get 正确转发到 chrome.cookies.get', async () => {
      const result = await adapter.cookies.get({ name: 'a', url: 'https://example.com' });
      expect(mockChrome.cookies.get).toHaveBeenCalledWith({ name: 'a', url: 'https://example.com' });
      expect(result?.value).toBe('1');
    });

    it('getAll 正确转发到 chrome.cookies.getAll', async () => {
      await adapter.cookies.getAll({});
      expect(mockChrome.cookies.getAll).toHaveBeenCalledWith({});
    });

    it('set 正确转发到 chrome.cookies.set', async () => {
      const result = await adapter.cookies.set({ name: 'a', value: '2', url: 'https://example.com' });
      expect(mockChrome.cookies.set).toHaveBeenCalledWith({ name: 'a', value: '2', url: 'https://example.com' });
      expect(result?.value).toBe('2');
    });

    it('remove 正确转发到 chrome.cookies.remove', async () => {
      const result = await adapter.cookies.remove({ name: 'a', url: 'https://example.com' });
      expect(mockChrome.cookies.remove).toHaveBeenCalledWith({ name: 'a', url: 'https://example.com' });
      expect(result).toEqual({ name: 'a', url: 'https://example.com', storeId: '0' });
    });

    it('getAllCookieStores 正确转发到 chrome.cookies.getAllCookieStores', async () => {
      const result = await adapter.cookies.getAllCookieStores();
      expect(mockChrome.cookies.getAllCookieStores).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  // ── Sessions ─────────────────────────────────────

  describe('sessions', () => {
    it('getRecentlyClosed 正确转发到 chrome.sessions.getRecentlyClosed', async () => {
      const result = await adapter.sessions.getRecentlyClosed({ maxResults: 5 });
      expect(mockChrome.sessions.getRecentlyClosed).toHaveBeenCalledWith({ maxResults: 5 });
      expect(result).toEqual([]);
    });

    it('restore 正确转发到 chrome.sessions.restore', async () => {
      const result = await adapter.sessions.restore('session-id');
      expect(mockChrome.sessions.restore).toHaveBeenCalledWith('session-id');
      expect(result).toBeDefined();
    });
  });

  // ── Storage ──────────────────────────────────────

  describe('storage.local', () => {
    it('get 正确转发到 chrome.storage.local.get', async () => {
      const result = await adapter.storage.local.get('key');
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith('key');
      expect(result).toEqual({ key: 'value' });
    });

    it('set 正确转发到 chrome.storage.local.set', async () => {
      await adapter.storage.local.set({ key: 'value' });
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({ key: 'value' });
    });

    it('remove 正确转发到 chrome.storage.local.remove', async () => {
      await adapter.storage.local.remove('key');
      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith('key');
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
    it('getAll 映射 chrome.management.getAll 返回的扩展信息', async () => {
      mockChrome.management.getAll.mockResolvedValue([
        { id: 'a', name: 'A', version: '1.0', enabled: true, type: 'extension', description: 'desc', mayDisable: true, icons: [{ size: 16, url: 'https://example.com/i.png' }], optionsUrl: 'https://example.com/opt', hostPermissions: ['https://example.com/*'], permissions: ['tabs'] },
        { id: 'b', name: 'B', version: '2.0', enabled: false, type: 'theme', icons: undefined },
      ]);
      const result = await adapter.management.getAll();
      expect(mockChrome.management.getAll).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'a', name: 'A', version: '1.0', enabled: true, type: 'extension', description: 'desc', mayDisable: true,
        icons: [{ size: 16, url: 'https://example.com/i.png' }], optionsUrl: 'https://example.com/opt',
        hostPermissions: ['https://example.com/*'], permissions: ['tabs'],
      });
      expect(result[1]?.icons).toBeUndefined();
    });

    it('get 映射 chrome.management.get 返回的单个扩展信息', async () => {
      mockChrome.management.get.mockResolvedValue({
        id: 'a', name: 'A', version: '1.0', enabled: true, type: 'extension', mayDisable: false,
        icons: [{ size: 48, url: 'https://example.com/i48.png' }],
      });
      const result = await adapter.management.get('a');
      expect(mockChrome.management.get).toHaveBeenCalledWith('a');
      expect(result.id).toBe('a');
      expect(result.icons).toEqual([{ size: 48, url: 'https://example.com/i48.png' }]);
    });

    it('setEnabled 正确转发到 chrome.management.setEnabled', async () => {
      await adapter.management.setEnabled('a', true);
      expect(mockChrome.management.setEnabled).toHaveBeenCalledWith('a', true);
    });
  });

  // ── Privacy ──────────────────────────────────────

  describe('privacy', () => {
    it('getNetworkSettings 读取两项 WebRTC 设置', async () => {
      const result = await adapter.privacy.getNetworkSettings();
      expect(mockChrome.privacy.network.webRTCIPHandlingPolicy.get).toHaveBeenCalledWith({});
      expect(mockChrome.privacy.network.webRTCNonProxiedUdpEnabled.get).toHaveBeenCalledWith({});
      expect(result).toEqual({ webRTCIPHandlingPolicy: 'default', webRTCNonProxiedUdpEnabled: true });
    });

    it('setNetworkSetting 按 key 写入对应策略', async () => {
      await adapter.privacy.setNetworkSetting('webRTCIPHandlingPolicy', 'default_public_interface_only');
      expect(mockChrome.privacy.network.webRTCIPHandlingPolicy.set).toHaveBeenCalledWith({
        value: 'default_public_interface_only',
        scope: 'CONTROLLABLE_BY_THIS_EXTENSION',
      });

      await adapter.privacy.setNetworkSetting('webRTCNonProxiedUdpEnabled', true);
      expect(mockChrome.privacy.network.webRTCNonProxiedUdpEnabled.set).toHaveBeenCalledWith({
        value: true,
        scope: 'CONTROLLABLE_BY_THIS_EXTENSION',
      });
    });

    it('未知 key 不触发任何写入', async () => {
      await adapter.privacy.setNetworkSetting('unknownKey', 1);
      expect(mockChrome.privacy.network.webRTCIPHandlingPolicy.set).not.toHaveBeenCalled();
      expect(mockChrome.privacy.network.webRTCNonProxiedUdpEnabled.set).not.toHaveBeenCalled();
    });
  });

  // ── Proxy ────────────────────────────────────────

  describe('proxy', () => {
    it('getSettings 返回 chrome.proxy.settings.get 结果', async () => {
      const result = await adapter.proxy.getSettings();
      expect(mockChrome.proxy.settings.get).toHaveBeenCalledWith({});
      expect(result).toEqual({ value: { mode: 'system' } });
    });

    it('setSettings 正确转发到 chrome.proxy.settings.set', async () => {
      const config = { value: { mode: 'fixed_servers', rules: { singleProxy: { scheme: 'http', host: 'localhost' } } } };
      await adapter.proxy.setSettings(config);
      expect(mockChrome.proxy.settings.set).toHaveBeenCalledWith(config);
    });

    it('clear 正确转发到 chrome.proxy.settings.clear', async () => {
      await adapter.proxy.clear();
      expect(mockChrome.proxy.settings.clear).toHaveBeenCalledWith({});
    });
  });

  // ── Debugger ─────────────────────────────────────

  describe('debugger', () => {
    it('getTargets 映射 chrome.debugger.getTargets 结果', async () => {
      mockChrome.debugger.getTargets.mockResolvedValue([
        { id: 't1', tabId: 5, title: 'Page', url: 'https://example.com', attached: true },
        { id: 't2', title: undefined, url: undefined, attached: false },
      ]);
      const result = await adapter.debugger.getTargets();
      expect(mockChrome.debugger.getTargets).toHaveBeenCalled();
      expect(result).toEqual([
        { id: 't1', tabId: 5, title: 'Page', url: 'https://example.com', attached: true },
        { id: 't2', tabId: undefined, title: '', url: '', attached: false },
      ]);
    });

    it('attach 使用协议版本 1.3', async () => {
      await adapter.debugger.attach('target-1');
      expect(mockChrome.debugger.attach).toHaveBeenCalledWith({ targetId: 'target-1' }, '1.3');
    });

    it('detach 正确转发到 chrome.debugger.detach', async () => {
      await adapter.debugger.detach('target-1');
      expect(mockChrome.debugger.detach).toHaveBeenCalledWith({ targetId: 'target-1' });
    });
  });

  // ── DeclarativeNetRequest ────────────────────────

  describe('declarativeNetRequest', () => {
    it('getDynamicRules 正确转发', async () => {
      mockChrome.declarativeNetRequest.getDynamicRules.mockResolvedValue([{ id: 1, action: { type: 'block' }, condition: { urlFilter: 'https://example.com' } }]);
      const result = await adapter.declarativeNetRequest.getDynamicRules();
      expect(mockChrome.declarativeNetRequest.getDynamicRules).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('addDynamicRules 通过 updateDynamicRules 添加规则', async () => {
      const rules = [{ id: 1, action: { type: 'block' }, condition: { urlFilter: 'https://example.com' } }];
      await adapter.declarativeNetRequest.addDynamicRules(rules);
      expect(mockChrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({ addRules: rules, removeRuleIds: [] });
    });

    it('removeDynamicRules 通过 updateDynamicRules 移除规则', async () => {
      await adapter.declarativeNetRequest.removeDynamicRules([1, 2]);
      expect(mockChrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({ addRules: [], removeRuleIds: [1, 2] });
    });
  });

  // ── History ──────────────────────────────────────

  describe('history', () => {
    it('search 正确转发到 chrome.history.search', async () => {
      mockChrome.history.search.mockResolvedValue([
        { id: '1', url: 'https://example.com', title: 'Example', lastVisitTime: 1000, visitCount: 5, typedCount: 0 },
      ]);
      const result = await adapter.history.search({ text: 'test', maxResults: 10 });
      expect(mockChrome.history.search).toHaveBeenCalledWith({ text: 'test', maxResults: 10 });
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe('https://example.com');
    });

    it('deleteUrl 正确转发到 chrome.history.deleteUrl', async () => {
      await adapter.history.deleteUrl('https://example.com');
      expect(mockChrome.history.deleteUrl).toHaveBeenCalledWith({ url: 'https://example.com' });
    });

    it('deleteRange 正确转发到 chrome.history.deleteRange', async () => {
      await adapter.history.deleteRange({ startTime: 1000, endTime: 2000 });
      expect(mockChrome.history.deleteRange).toHaveBeenCalledWith({ startTime: 1000, endTime: 2000 });
    });

    it('deleteAll 正确转发到 chrome.history.deleteAll', async () => {
      await adapter.history.deleteAll();
      expect(mockChrome.history.deleteAll).toHaveBeenCalled();
    });
  });

  // ── Events ───────────────────────────────────────

  describe('addListener', () => {
    it('注册 tabs.onCreated 事件', () => {
      const cb = vi.fn();
      const unsubscribe = adapter.addListener(BrowserEvent.TAB_CREATED, cb);
      expect(mockChrome.tabs.onCreated.addListener).toHaveBeenCalledWith(cb);
      unsubscribe();
      expect(mockChrome.tabs.onCreated.removeListener).toHaveBeenCalledWith(cb);
    });

    it('注册 windows.onCreated 事件', () => {
      const cb = vi.fn();
      adapter.addListener(BrowserEvent.WINDOW_CREATED, cb);
      expect(mockChrome.windows.onCreated.addListener).toHaveBeenCalledWith(cb);
    });

    it('注册 tabGroups.onUpdated 事件', () => {
      const cb = vi.fn();
      adapter.addListener(BrowserEvent.TAB_GROUP_UPDATED, cb);
      expect(mockChrome.tabGroups.onUpdated.addListener).toHaveBeenCalledWith(cb);
    });

    it('返回的取消函数正确移除监听器', () => {
      const cb = vi.fn();
      const unsubscribe = adapter.addListener(BrowserEvent.TAB_CREATED, cb);
      unsubscribe();
      expect(mockChrome.tabs.onCreated.removeListener).toHaveBeenCalledWith(cb);
    });

    it('支持 windows 命名空间事件注册', () => {
      const cb = vi.fn();
      adapter.addListener(BrowserEvent.WINDOW_FOCUS_CHANGED, cb);
      expect(mockChrome.windows.onFocusChanged.addListener).toHaveBeenCalledWith(cb);
    });

    it('支持 tabGroups 命名空间事件注册', () => {
      const cb = vi.fn();
      adapter.addListener(BrowserEvent.TAB_GROUP_MOVED, cb);
      expect(mockChrome.tabGroups.onMoved.addListener).toHaveBeenCalledWith(cb);
    });

    it('未知事件命名空间抛出错误', () => {
      const cb = vi.fn();
      expect(() => adapter.addListener('bookmarks.onCreated' as unknown as BrowserEvent, cb)).toThrow(
        'Unknown event namespace: bookmarks',
      );
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
