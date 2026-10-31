import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigStore } from '../config-store';
import { createI18nMock } from '@/test/i18n-mock';

/**
 * 创建 mock browser.storage.local
 */
function mockBrowserStorage() {
  const storage: Record<string, unknown> = {};
  const listeners: Array<(changes: Record<string, chrome.storage.StorageChange>) => void> = [];

  const mock = {
    get: vi.fn(async (keys: string | string[] | Record<string, unknown> | null) => {
      if (keys === null) {
        return { ...storage };
      }
      const keysArr = Array.isArray(keys) ? (keys as string[]) : [keys as string];
      const result: Record<string, unknown> = {};
      for (const key of keysArr) {
        if (key in storage) {
          result[key] = storage[key];
        }
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(storage, items);
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const [key, newValue] of Object.entries(items)) {
        changes[key] = { newValue, oldValue: storage[key] };
      }
      for (const listener of listeners) {
        listener(changes);
      }
    }),
    clear: vi.fn(async () => {
      Object.keys(storage).forEach((k) => delete storage[k]);
    }),
    onChanged: {
      addListener: vi.fn((listener: typeof listeners[0]) => {
        listeners.push(listener);
      }),
      removeListener: vi.fn((listener: typeof listeners[0]) => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      }),
    },
  };

  return { mock, storage, listeners };
}

describe('ConfigStore', () => {
  let browserMock: ReturnType<typeof mockBrowserStorage>;

  beforeEach(() => {
    browserMock = mockBrowserStorage();
    vi.stubGlobal('browser', {
      storage: {
        local: browserMock.mock,
        onChanged: browserMock.mock.onChanged,
      },
      i18n: createI18nMock(),
    });
    ConfigStore.resetInstance();
  });

  // #1 单例
  it('should return the same instance', () => {
    const a = ConfigStore.getInstance();
    const b = ConfigStore.getInstance();
    expect(a).toBe(b);
  });

  // #2 get 存在值
  it('should return stored value via get', async () => {
    const store = ConfigStore.getInstance();
    // 模拟 browser.storage.local.get 返回数据
    browserMock.mock.get.mockResolvedValueOnce({ providers: [{ id: 'p1' }] });
    const result = await store.get('providers');
    expect(result).toEqual([{ id: 'p1' }]);
  });

  // #3 get 不存在返回默认值
  it('should return default value when key is not stored', async () => {
    const store = ConfigStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({});
    const result = await store.get<unknown[]>('providers');
    expect(result).toEqual([]);
  });

  // #4 getAll 合并默认值
  it('should merge stored values with defaults', async () => {
    const store = ConfigStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({ providers: [{ id: 'p1' }] });
    const result = await store.getAll();
    expect(result.providers).toEqual([{ id: 'p1' }]);
    expect(result.agentSettings.maxToolRounds).toBe(99);
    expect(result.preferences.theme).toBe('system');
  });

  // #5 set
  it('should call chrome.storage.local.set', async () => {
    const store = ConfigStore.getInstance();
    await store.set('providers', [{ id: 'p2' }]);
    expect(browserMock.mock.set).toHaveBeenCalledWith({ providers: [{ id: 'p2' }] });
  });

  // #6 patch
  it('should call chrome.storage.local.set with partial', async () => {
    const store = ConfigStore.getInstance();
    await store.patch({ preferences: { theme: 'dark', sidebarExpanded: false, reasoningAutoExpand: false } });
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      preferences: { theme: 'dark', sidebarExpanded: false, reasoningAutoExpand: false },
    });
  });

  // #7 onChange 监听
  it('should trigger onChange callback', async () => {
    const store = ConfigStore.getInstance();
    const callback = vi.fn();
    store.onChange(callback);

      // 直接触发 chrome.storage.onChanged
    const change: Record<string, chrome.storage.StorageChange> = {
      providers: { newValue: [{ id: 'p1' }] },
    };
    for (const listener of browserMock.listeners) {
      listener(change);
    }

    expect(callback).toHaveBeenCalledWith({ providers: [{ id: 'p1' }] });
  });

  it('onChange 对 preferences/floatingButtonSettings 做与读写一致的归一化', () => {
    const store = ConfigStore.getInstance();
    const callback = vi.fn();
    store.onChange(callback);

    const change: Record<string, chrome.storage.StorageChange> = {
      preferences: { newValue: { theme: 'dark' } },
      floatingButtonSettings: {
        newValue: { enabled: true, position: null, blacklist: [], panelWidth: 9999 },
      },
    };
    for (const listener of browserMock.listeners) {
      listener(change);
    }

    const delivered = callback.mock.calls[0]![0] as {
      preferences: { accentColor: string };
      floatingButtonSettings: { panelWidth: number };
    };
    expect(delivered.preferences.accentColor).toBe('#c2410c');
    expect(delivered.floatingButtonSettings.panelWidth).toBe(720);
  });

  // #8 onChange 取消
  it('should stop listening after unsubscribe', async () => {
    const store = ConfigStore.getInstance();
    const callback = vi.fn();
    const unsubscribe = store.onChange(callback);
    unsubscribe();

    const change: Record<string, chrome.storage.StorageChange> = {
      providers: { newValue: [{ id: 'p1' }] },
    };
    for (const listener of browserMock.listeners) {
      listener(change);
    }

    expect(callback).not.toHaveBeenCalled();
  });

  // #9 clear
  it('should call chrome.storage.local.clear', async () => {
    const store = ConfigStore.getInstance();
    await store.clear();
    expect(browserMock.mock.clear).toHaveBeenCalled();
  });

  // #10 getDefaults
  it('should return a deep copy of defaults', async () => {
    const store = ConfigStore.getInstance();
    const defaults = store.getDefaults();
    expect(defaults.providers).toEqual([]);
    expect(defaults.agentSettings.maxToolRounds).toBe(99);
    // 修改返回的值不应影响后续调用
    defaults.agentSettings.maxToolRounds = 999;
    const defaults2 = store.getDefaults();
    expect(defaults2.agentSettings.maxToolRounds).toBe(99);
  });

  // #11 resetInstance
  it('should return new instance after reset', async () => {
    const a = ConfigStore.getInstance();
    ConfigStore.resetInstance();
    const b = ConfigStore.getInstance();
    expect(a).not.toBe(b);
  });

  // #12 floatingButtonSettings 默认值
  it('should return default floatingButtonSettings when not stored', async () => {
    const store = ConfigStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({});
    const result = await store.get('floatingButtonSettings');
    expect(result).toEqual({ enabled: true, position: null, blacklist: [], panelWidth: 420 });
  });

  it('should keep Jev disabled and unconfigured by default', async () => {
    const store = ConfigStore.getInstance();
    const result = await store.get('jevSettings');
    expect(result).toEqual({ enabled: false, apiKey: '' });
  });

  // #13 floatingButtonSettings 写入
  it('should set floatingButtonSettings correctly', async () => {
    const store = ConfigStore.getInstance();
    const settings = { enabled: false, position: { side: 'left' as const, top: 100 }, blacklist: ['example.com'], panelWidth: 600 };
    await store.set('floatingButtonSettings', settings);
    expect(browserMock.mock.set).toHaveBeenCalledWith({ floatingButtonSettings: settings });
  });

  it('should clamp panelWidth on write', async () => {
    const store = ConfigStore.getInstance();
    await store.set('floatingButtonSettings', {
      enabled: true,
      position: null,
      blacklist: [],
      panelWidth: 999,
    });
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      floatingButtonSettings: { enabled: true, position: null, blacklist: [], panelWidth: 720 },
    });
  });

  it('should fill default panelWidth when writing settings without it', async () => {
    const store = ConfigStore.getInstance();
    await store.set('floatingButtonSettings', {
      enabled: true,
      position: null,
      blacklist: [],
    });
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      floatingButtonSettings: { enabled: true, position: null, blacklist: [], panelWidth: 420 },
    });
  });

  it('should clamp panelWidth on read', async () => {
    const store = ConfigStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({
      floatingButtonSettings: { enabled: true, position: null, blacklist: [], panelWidth: 424 },
    });
    const result = await store.get<{ panelWidth?: number }>('floatingButtonSettings');
    expect(result.panelWidth).toBe(420);
  });

  // #14 getAll 包含 floatingButtonSettings 默认值
  it('should include default floatingButtonSettings in getAll', async () => {
    const store = ConfigStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({});
    const result = await store.getAll();
    expect(result.floatingButtonSettings).toEqual({
      enabled: true,
      position: null,
      blacklist: [],
      panelWidth: 420,
    });
  });

  // ── 主色（accentColor）读写校验 ─────────────────────

  it('get preferences 缺省主色时补默认暖橙', async () => {
    const store = ConfigStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({
      preferences: { theme: 'dark', sidebarExpanded: true },
    });
    const prefs = await store.get<{ accentColor: string }>('preferences');
    expect(prefs.accentColor).toBe('#c2410c');
  });

  it('get preferences 主色非法时回退默认暖橙', async () => {
    const store = ConfigStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({
      preferences: { theme: 'light', accentColor: 'orange' },
    });
    const prefs = await store.get<{ accentColor: string }>('preferences');
    expect(prefs.accentColor).toBe('#c2410c');
  });

  it('set preferences 写入时归一化主色并落库', async () => {
    const store = ConfigStore.getInstance();
    await store.set('preferences', {
      theme: 'light',
      sidebarExpanded: true,
      reasoningAutoExpand: false,
      accentColor: '#2563EB',
    });
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      preferences: expect.objectContaining({ accentColor: '#2563eb' }),
    });
  });

  it('set preferences 非法主色落库为默认暖橙', async () => {
    const store = ConfigStore.getInstance();
    await store.set('preferences', {
      theme: 'light',
      sidebarExpanded: true,
      reasoningAutoExpand: false,
      accentColor: '#12345',
    });
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      preferences: expect.objectContaining({ accentColor: '#c2410c' }),
    });
  });

  it('patch preferences 仅在携带主色时做校验', async () => {
    const store = ConfigStore.getInstance();
    await store.patch({
      preferences: {
        theme: 'dark',
        sidebarExpanded: false,
        reasoningAutoExpand: false,
        accentColor: 'nope',
      },
    });
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      preferences: expect.objectContaining({ accentColor: '#c2410c' }),
    });
  });

  it('getAll 合并默认值并校验主色', async () => {
    const store = ConfigStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({
      preferences: { theme: 'dark', sidebarExpanded: false, accentColor: '#XYZXYZ' },
    });
    const result = await store.getAll();
    expect(result.preferences.accentColor).toBe('#c2410c');
    expect(result.preferences.theme).toBe('dark');
  });

  it('getDefaults 包含默认主色', () => {
    const store = ConfigStore.getInstance();
    expect(store.getDefaults().preferences.accentColor).toBe('#c2410c');
  });
});
