import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirefoxAdapter } from '../firefox-adapter';
import { BrowserEvent } from '../types';

function createMockBrowser() {
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

    it('group reject with Error', async () => {
      await expect(adapter.tabs.group({ tabIds: [1, 2] })).rejects.toThrow('tabGroups is not supported in Firefox');
    });

    it('ungroup reject with Error', async () => {
      await expect(adapter.tabs.ungroup([1, 2])).rejects.toThrow('tabGroups is not supported in Firefox');
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

  // ── TabGroups (Firefox: no-op) ───────────────────

  describe('tabGroups', () => {
    it('query 返回空数组', async () => {
      const result = await adapter.tabGroups.query({});
      expect(result).toEqual([]);
    });

    it('get reject with Error', async () => {
      await expect(adapter.tabGroups.get(1)).rejects.toThrow('tabGroups is not supported in Firefox');
    });

    it('update reject with Error', async () => {
      await expect(adapter.tabGroups.update(1, { collapsed: true })).rejects.toThrow('tabGroups is not supported in Firefox');
    });

    it('move reject with Error', async () => {
      await expect(adapter.tabGroups.move(1, { index: 0 })).rejects.toThrow('tabGroups is not supported in Firefox');
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

    it('create 在 notifications API 不可用时 reject', async () => {
      // 不设置 notifications mock，模拟 API 不存在
      const result = adapter.notifications.create({ title: 'Test', message: 'Hello' });
      await expect(result).rejects.toThrow('notifications API not available');
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

    it('tabGroups 事件返回 no-op 不抛异常', () => {
      const cb = vi.fn();
      const result = adapter.addListener(BrowserEvent.TAB_GROUP_UPDATED, cb);
      expect(result).toBeInstanceOf(Function);
      // 不应该调用任何 addListener
      expect(mockBrowser.tabs.onCreated.addListener).not.toHaveBeenCalled();
    });

    it('注册事件后返回的取消函数能正确移除监听器', () => {
      const cb = vi.fn();
      const unsubscribe = adapter.addListener(BrowserEvent.TAB_CREATED, cb);
      unsubscribe();
      expect(mockBrowser.tabs.onCreated.removeListener).toHaveBeenCalledWith(cb);
    });
  });
});
