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
  });
});
