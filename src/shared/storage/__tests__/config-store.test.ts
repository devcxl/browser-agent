import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigStore } from '../config-store';

/**
 * 创建 mock browser.storage.local
 */
function mockBrowserStorage() {
  const storage: Record<string, unknown> = {};
  const listeners: Array<(changes: Record<string, browser.storage.StorageChange>) => void> = [];

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
      const changes: Record<string, browser.storage.StorageChange> = {};
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
    await store.patch({ preferences: { theme: 'dark', language: 'zh-CN', sidebarExpanded: false } });
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      preferences: { theme: 'dark', language: 'zh-CN', sidebarExpanded: false },
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
    expect(result).toEqual({ enabled: true, position: null, blacklist: [] });
  });

  // #13 floatingButtonSettings 写入
  it('should set floatingButtonSettings correctly', async () => {
    const store = ConfigStore.getInstance();
    const settings = { enabled: false, position: { side: 'left' as const, top: 100 }, blacklist: ['example.com'] };
    await store.set('floatingButtonSettings', settings);
    expect(browserMock.mock.set).toHaveBeenCalledWith({ floatingButtonSettings: settings });
  });

  // #14 getAll 包含 floatingButtonSettings 默认值
  it('should include default floatingButtonSettings in getAll', async () => {
    const store = ConfigStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({});
    const result = await store.getAll();
    expect(result.floatingButtonSettings).toEqual({ enabled: true, position: null, blacklist: [] });
  });
});
