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
      create: vi.fn().mockResolvedValue('notif-42'),
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
  });
});
