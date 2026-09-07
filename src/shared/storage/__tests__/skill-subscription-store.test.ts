import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillSubscriptionStore } from '../skill-subscription-store';
import type { SkillSubscription } from '@/shared/types';
import { createI18nMock } from '@/test/i18n-mock';

/**
 * 创建 mock browser.storage.local（与 config-store.test.ts 相同模式）
 */
function mockBrowserStorage() {
  const storage: Record<string, unknown> = {};
  const listeners: Array<
    (changes: Record<string, chrome.storage.StorageChange>) => void
  > = [];

  const mock = {
    get: vi.fn(
      async (
        keys: string | string[] | Record<string, unknown> | null,
      ) => {
        if (keys === null) {
          return { ...storage };
        }
        const keysArr = Array.isArray(keys)
          ? (keys as string[])
          : [keys as string];
        const result: Record<string, unknown> = {};
        for (const key of keysArr) {
          if (key in storage) {
            result[key] = storage[key];
          }
        }
        return result;
      },
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const [key, newValue] of Object.entries(items)) {
        changes[key] = { newValue, oldValue: storage[key] };
      }
      Object.assign(storage, items);
      for (const listener of listeners) {
        listener(changes);
      }
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const keysArr = Array.isArray(keys) ? keys : [keys];
      for (const key of keysArr) {
        delete storage[key];
      }
    }),
    onChanged: {
      addListener: vi.fn((listener: (typeof listeners)[0]) => {
        listeners.push(listener);
      }),
      removeListener: vi.fn((listener: (typeof listeners)[0]) => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      }),
    },
  };

  return { mock, storage, listeners };
}

/** 构造 SkillSubscription 测试数据 */
function makeSubscription(
  overrides: Partial<SkillSubscription> = {},
): SkillSubscription {
  return {
    id: 'sub-1',
    source: 'https://github.com/user/repo',
    type: 'github',
    enabled: true,
    lastSyncedAt: null,
    createdAt: 1700000000000,
    ...overrides,
  };
}

describe('SkillSubscriptionStore', () => {
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
    SkillSubscriptionStore.resetInstance();
  });

  // ── 单例 ──────────────────────────────────────────

  it('getInstance() 应返回同一实例（单例验证）', () => {
    const a = SkillSubscriptionStore.getInstance();
    const b = SkillSubscriptionStore.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance() 后应返回新实例', () => {
    const a = SkillSubscriptionStore.getInstance();
    SkillSubscriptionStore.resetInstance();
    const b = SkillSubscriptionStore.getInstance();
    expect(a).not.toBe(b);
  });

  // ── getAll() ──────────────────────────────────────

  it('getAll() 无数据时应返回 []', async () => {
    const store = SkillSubscriptionStore.getInstance();
    const result = await store.getAll();
    expect(result).toEqual([]);
  });

  it('getAll() 有数据时应返回 SkillSubscription[]', async () => {
    const store = SkillSubscriptionStore.getInstance();
    const subs = [makeSubscription()];
    browserMock.mock.get.mockResolvedValueOnce({ skillSubscriptions: subs });
    const result = await store.getAll();
    expect(result).toEqual(subs);
  });

  it('getAll() 存储值非数组时应返回 []（防御非法数据）', async () => {
    const store = SkillSubscriptionStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({
      skillSubscriptions: 'not-an-array',
    });
    const result = await store.getAll();
    expect(result).toEqual([]);
  });

  // ── add() ─────────────────────────────────────────

  it('add() 空列表时应写入单个订阅', async () => {
    const store = SkillSubscriptionStore.getInstance();
    const sub = makeSubscription({ id: 'sub-a' });
    await store.add(sub);
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      skillSubscriptions: [sub],
    });
  });

  it('add() 应追加到已有订阅列表末尾', async () => {
    const store = SkillSubscriptionStore.getInstance();
    const existing = [makeSubscription({ id: 'sub-1' })];
    browserMock.mock.get.mockResolvedValueOnce({
      skillSubscriptions: [...existing],
    });
    const newSub = makeSubscription({ id: 'sub-2' });
    await store.add(newSub);
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      skillSubscriptions: [...existing, newSub],
    });
  });

  // ── update() ──────────────────────────────────────

  it('update() 应合并 patch 并保留未修改字段', async () => {
    const store = SkillSubscriptionStore.getInstance();
    const existing = [
      makeSubscription({ id: 'sub-1', enabled: true, lastSyncedAt: null }),
    ];
    browserMock.mock.get.mockResolvedValueOnce({ skillSubscriptions: existing });
    await store.update('sub-1', {
      enabled: false,
      lastSyncedAt: 1700000001000,
    });
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      skillSubscriptions: [
        {
          ...existing[0],
          enabled: false,
          lastSyncedAt: 1700000001000,
        },
      ],
    });
  });

  it('update() 对不存在的 id 应静默忽略且不写 storage', async () => {
    const store = SkillSubscriptionStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({
      skillSubscriptions: [makeSubscription({ id: 'sub-1' })],
    });
    await store.update('nonexistent', { enabled: false });
    expect(browserMock.mock.set).not.toHaveBeenCalled();
  });

  // ── remove() ──────────────────────────────────────

  it('remove() 应删除指定订阅并写回剩余', async () => {
    const store = SkillSubscriptionStore.getInstance();
    const subs = [
      makeSubscription({ id: 'sub-1' }),
      makeSubscription({ id: 'sub-2' }),
    ];
    browserMock.mock.get.mockResolvedValueOnce({ skillSubscriptions: subs });
    await store.remove('sub-1');
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      skillSubscriptions: [subs[1]],
    });
  });

  it('remove() 对不存在的 id 应静默忽略且不写 storage', async () => {
    const store = SkillSubscriptionStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({
      skillSubscriptions: [makeSubscription({ id: 'sub-1' })],
    });
    await store.remove('nonexistent');
    expect(browserMock.mock.set).not.toHaveBeenCalled();
  });

  // ── onChange() ────────────────────────────────────

  it('onChange() 在 skillSubscriptions 变更时应触发回调', async () => {
    const store = SkillSubscriptionStore.getInstance();
    const callback = vi.fn();
    store.onChange(callback);

    const newSubs = [makeSubscription({ id: 'sub-new' })];
    const change: Record<string, chrome.storage.StorageChange> = {
      skillSubscriptions: { newValue: newSubs },
    };
    for (const listener of browserMock.listeners) {
      listener(change);
    }

    expect(callback).toHaveBeenCalledWith(newSubs);
  });

  it('onChange() 变更值为 undefined 时应以 [] 回调', async () => {
    const store = SkillSubscriptionStore.getInstance();
    const callback = vi.fn();
    store.onChange(callback);

    const change: Record<string, chrome.storage.StorageChange> = {
      skillSubscriptions: { newValue: undefined },
    };
    for (const listener of browserMock.listeners) {
      listener(change);
    }

    expect(callback).toHaveBeenCalledWith([]);
  });

  it('onChange() 非 skillSubscriptions key 变更时不应触发回调', async () => {
    const store = SkillSubscriptionStore.getInstance();
    const callback = vi.fn();
    store.onChange(callback);

    const change: Record<string, chrome.storage.StorageChange> = {
      skills: { newValue: [{}] },
    };
    for (const listener of browserMock.listeners) {
      listener(change);
    }

    expect(callback).not.toHaveBeenCalled();
  });

  it('onChange() 返回的取消函数应能取消监听', async () => {
    const store = SkillSubscriptionStore.getInstance();
    const callback = vi.fn();
    const unsubscribe = store.onChange(callback);
    unsubscribe();

    const change: Record<string, chrome.storage.StorageChange> = {
      skillSubscriptions: { newValue: [makeSubscription()] },
    };
    for (const listener of browserMock.listeners) {
      listener(change);
    }

    expect(callback).not.toHaveBeenCalled();
  });

  // ── 集成场景 ──────────────────────────────────────

  it('add + update + remove + getAll 完整流程', async () => {
    const store = SkillSubscriptionStore.getInstance();

    const subA = makeSubscription({ id: 'a', source: 'repo-a', enabled: true });
    await store.add(subA);
    expect(await store.getAll()).toEqual([subA]);

    await store.update('a', { enabled: false });
    const afterUpdate = await store.getAll();
    expect(afterUpdate).toHaveLength(1);
    expect(afterUpdate[0]!.enabled).toBe(false);

    await store.add(makeSubscription({ id: 'b', source: 'repo-b' }));
    expect(await store.getAll()).toHaveLength(2);

    await store.remove('a');
    const afterRemove = await store.getAll();
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove[0]!.id).toBe('b');
  });
});
