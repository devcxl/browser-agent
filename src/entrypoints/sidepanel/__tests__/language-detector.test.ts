import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigStore } from '@/shared/storage';
import { detectLanguage, detectAndSetLanguage } from '../i18n/language-detector';

/**
 * 创建 mock browser.storage.local
 */
function mockBrowserStorage() {
  const storage: Record<string, unknown> = {};
  const listeners: Array<(changes: Record<string, browser.storage.StorageChange>) => void> = [];

  const mock = {
    get: vi.fn(async (keys: string | string[] | Record<string, unknown> | null) => {
      if (keys === null) return { ...storage };
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

/**
 * 临时修改 navigator.language 并在测试后恢复。
 * jsdom 环境下 language 是 Navigator.prototype 上的 getter，
 * 通过 defineProperty shadow 后，delete 恢复原型 getter。
 */
async function withNavigatorLanguage(lang: string, fn: () => void | Promise<void>) {
  const original = navigator.language;
  Object.defineProperty(navigator, 'language', {
    value: lang,
    configurable: true,
    writable: true,
  });

  try {
    await fn();
  } finally {
    delete (navigator as unknown as Record<string, unknown>).language;
    if (navigator.language !== original) {
      Object.defineProperty(navigator, 'language', {
        value: original,
        configurable: true,
        writable: true,
      });
    }
  }
}

describe('detectLanguage', () => {
  it.each([
    ['zh', 'zh-CN'],
    ['zh-CN', 'zh-CN'],
    ['zh-Hans', 'zh-CN'],
    ['zh-TW', 'zh-CN'],
    ['zh-cn', 'zh-CN'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['fr', 'zh-CN'],
    ['de', 'zh-CN'],
    ['ja', 'zh-CN'],
  ])('navigator.language=%s -> %s', (lang, expected) => {
    withNavigatorLanguage(lang, () => {
      expect(detectLanguage()).toBe(expected);
    });
  });
});

describe('detectAndSetLanguage', () => {
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

  it('should set detected language when no language preference exists', async () => {
    browserMock.storage['preferences'] = {
      theme: 'system',
      language: '',
      sidebarExpanded: true,
    };

    await withNavigatorLanguage('en-US', async () => {
      await detectAndSetLanguage();
      expect(browserMock.mock.set).toHaveBeenCalledWith({
        preferences: {
          theme: 'system',
          language: 'en',
          sidebarExpanded: true,
        },
      });
    });
  });

  it('should skip when language preference already set', async () => {
    browserMock.storage['preferences'] = {
      theme: 'dark',
      language: 'en',
      sidebarExpanded: true,
    };

    await withNavigatorLanguage('zh-CN', async () => {
      await detectAndSetLanguage();
      expect(browserMock.mock.set).not.toHaveBeenCalled();
    });
  });

  it('should detect zh-CN when navigator.language is zh-TW', async () => {
    browserMock.storage['preferences'] = {
      theme: 'system',
      language: '',
      sidebarExpanded: true,
    };

    await withNavigatorLanguage('zh-TW', async () => {
      await detectAndSetLanguage();
      expect(browserMock.mock.set).toHaveBeenCalledWith({
        preferences: expect.objectContaining({ language: 'zh-CN' }),
      });
    });
  });

  it('should fallback to zh-CN for unsupported languages', async () => {
    browserMock.storage['preferences'] = {
      theme: 'system',
      language: '',
      sidebarExpanded: true,
    };

    await withNavigatorLanguage('fr', async () => {
      await detectAndSetLanguage();
      expect(browserMock.mock.set).toHaveBeenCalledWith({
        preferences: expect.objectContaining({ language: 'zh-CN' }),
      });
    });
  });
});
