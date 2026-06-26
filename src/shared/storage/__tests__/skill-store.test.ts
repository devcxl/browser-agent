import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillStore } from '../skill-store';
import type { Skill } from '@/shared/types';

// ==================== Mock 工具 ====================

/** 创建符合 Skill 接口的测试数据 */
function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    name: '测试 Skill',
    description: '用于测试的 skill',
    prompt: '你是一个测试助手',
    resources: [],
    enabled: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

/** 元数据版本（不含 prompt/resources，模拟 chrome.storage.local 存储形态） */
function metaSkill(overrides: Partial<Skill> = {}): Skill {
  return { ...makeSkill(overrides), prompt: '', resources: [] };
}

/**
 * 创建 mock browser.storage.local
 * 与 config-store.test.ts 共享相同 mock 模式
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

// ==================== 测试 ====================

describe('SkillStore', () => {
  let browserMock: ReturnType<typeof mockBrowserStorage>;

  beforeEach(() => {
    browserMock = mockBrowserStorage();
    vi.stubGlobal('browser', {
      storage: { local: browserMock.mock },
    });
    SkillStore.resetInstance();
  });

  // ── 单例 ──────────────────────────────────────────

  it('getInstance() 应返回同一实例（单例验证）', () => {
    const a = SkillStore.getInstance();
    const b = SkillStore.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance() 后应返回新实例', () => {
    const a = SkillStore.getInstance();
    SkillStore.resetInstance();
    const b = SkillStore.getInstance();
    expect(a).not.toBe(b);
  });

  // ── getAll() ──────────────────────────────────────

  it('getAll() 无数据时应返回 []', async () => {
    const store = SkillStore.getInstance();
    browserMock.mock.get.mockResolvedValueOnce({});
    const result = await store.getAll();
    expect(result).toEqual([]);
  });

  it('getAll() 有数据时应返回 Skill[]', async () => {
    const store = SkillStore.getInstance();
    const skills = [makeSkill()];
    browserMock.mock.get.mockResolvedValueOnce({ skills });
    const result = await store.getAll();
    expect(result).toEqual(skills);
  });

  // ── getEnabled() ──────────────────────────────────

  it('getEnabled() 应只返回 enabled: true 的 skill', async () => {
    const store = SkillStore.getInstance();
    const skills = [
      makeSkill({ id: 's1', enabled: true }),
      makeSkill({ id: 's2', enabled: false }),
      makeSkill({ id: 's3', enabled: true }),
    ];
    browserMock.mock.get.mockResolvedValueOnce({ skills });
    const result = await store.getEnabled();
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.enabled)).toBe(true);
  });

  it('getEnabled() 无已启用 skill 时应返回 []', async () => {
    const store = SkillStore.getInstance();
    const skills = [makeSkill({ id: 's1', enabled: false })];
    browserMock.mock.get.mockResolvedValueOnce({ skills });
    const result = await store.getEnabled();
    expect(result).toEqual([]);
  });

  // ── save() ────────────────────────────────────────

  it('save() 应全量替换 skills（存储元数据版本）', async () => {
    const store = SkillStore.getInstance();
    const skills = [makeSkill({ id: 's1' }), makeSkill({ id: 's2' })];

    await store.save(skills);

    // 存储的是元数据版本（不含 prompt/resources）
    const expected = skills.map((s) => ({ ...s, prompt: '', resources: [] }));
    expect(browserMock.mock.set).toHaveBeenCalledWith({ skills: expected });
  });

  // ── add() ─────────────────────────────────────────

  it('add() 后 getAll() 应包含新 skill', async () => {
    const store = SkillStore.getInstance();
    const existing = [makeSkill({ id: 's1' })];
    const newSkill = makeSkill({ id: 's2' });

    // 模拟 storage 中已有 s1
    browserMock.mock.get.mockResolvedValueOnce({ skills: [...existing] });
    await store.add(newSkill);

    // 验证 set 被调用时包含 s1 + s2（元数据版本）
    const expected = [
      { ...existing[0], prompt: '', resources: [] },
      { ...newSkill, prompt: '', resources: [] },
    ];
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      skills: expected,
    });
  });

  // ── update() ──────────────────────────────────────

  it('update() 应部分更新 skill 并自动更新 updatedAt', async () => {
    const store = SkillStore.getInstance();
    const before = Date.now();
    const skill = makeSkill({ id: 's1', name: '旧名称', enabled: true });

    browserMock.mock.get.mockResolvedValueOnce({ skills: [skill] });
    await store.update('s1', { name: '新名称' });

    // 验证 set 调用参数
    const setCall = browserMock.mock.set.mock.calls[0]?.[0] as {
      skills: Skill[];
    };
    const updated = setCall.skills[0];
    expect(updated.name).toBe('新名称');
    expect(updated.enabled).toBe(true); // 未修改字段保持不变
    expect(updated.id).toBe('s1');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
    // createdAt 不应被修改
    expect(updated.createdAt).toBe(skill.createdAt);
  });

  it('update() 对不存在的 id 应静默忽略', async () => {
    const store = SkillStore.getInstance();
    const skills = [makeSkill({ id: 's1' })];

    browserMock.mock.get.mockResolvedValueOnce({ skills: [...skills] });
    await store.update('nonexistent', { name: '不会生效' });

    // set 不应被调用（数据无变化）
    expect(browserMock.mock.set).not.toHaveBeenCalled();
  });

  // ── remove() ──────────────────────────────────────

  it('remove() 后 skill 不应再出现在列表中', async () => {
    const store = SkillStore.getInstance();
    const skills = [
      makeSkill({ id: 's1' }),
      makeSkill({ id: 's2' }),
    ];

    browserMock.mock.get.mockResolvedValueOnce({ skills: [...skills] });
    await store.remove('s1');

    // 剩余技能存储为元数据版本
    const expectedMeta = { ...skills[1], prompt: '', resources: [] };
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      skills: [expectedMeta],
    });
  });

  it('remove() 对不存在的 id 应静默忽略', async () => {
    const store = SkillStore.getInstance();
    const skills = [makeSkill({ id: 's1' })];

    browserMock.mock.get.mockResolvedValueOnce({ skills: [...skills] });
    await store.remove('nonexistent');

    // set 不应被调用（数据无变化）
    expect(browserMock.mock.set).not.toHaveBeenCalled();
  });

  // ── onChange() ────────────────────────────────────

  it('onChange() 在 skills 变更时应触发回调', async () => {
    const store = SkillStore.getInstance();
    const callback = vi.fn();
    store.onChange(callback);

    const newSkills = [makeSkill({ id: 's1' })];
    const change: Record<string, chrome.storage.StorageChange> = {
      skills: { newValue: newSkills },
    };
    for (const listener of browserMock.listeners) {
      listener(change);
    }

    expect(callback).toHaveBeenCalledWith(newSkills);
  });

  it('onChange() 非 skills key 变更时不应触发回调', async () => {
    const store = SkillStore.getInstance();
    const callback = vi.fn();
    store.onChange(callback);

    const change: Record<string, chrome.storage.StorageChange> = {
      providers: { newValue: [{ id: 'p1' }] },
    };
    for (const listener of browserMock.listeners) {
      listener(change);
    }

    expect(callback).not.toHaveBeenCalled();
  });

  it('onChange() 返回的取消函数应能正确取消监听', async () => {
    const store = SkillStore.getInstance();
    const callback = vi.fn();
    const unsubscribe = store.onChange(callback);
    unsubscribe();

    const change: Record<string, chrome.storage.StorageChange> = {
      skills: { newValue: [makeSkill()] },
    };
    for (const listener of browserMock.listeners) {
      listener(change);
    }

    expect(callback).not.toHaveBeenCalled();
  });

  // ── 集成场景 ──────────────────────────────────────

  it('add + update + remove + getEnabled 完整流程', async () => {
    const store = SkillStore.getInstance();

    // 1. 初始为空
    browserMock.mock.get.mockResolvedValueOnce({});
    let all = await store.getAll();
    expect(all).toEqual([]);

    // 2. add 一个 skill
    const s1 = makeSkill({ id: 's1', enabled: true, name: 'S1' });
    browserMock.mock.get.mockResolvedValueOnce({ skills: [] });
    await store.add(s1);

    // 模拟 storage 现在有 s1
    browserMock.mock.get.mockResolvedValueOnce({ skills: [s1] });
    all = await store.getAll();
    expect(all).toHaveLength(1);

    // 3. add 第二个 skill
    const s2 = makeSkill({ id: 's2', enabled: false, name: 'S2' });
    browserMock.mock.get.mockResolvedValueOnce({ skills: [s1] });
    await store.add(s2);

    // 4. getEnabled 只返回 s1
    browserMock.mock.get.mockResolvedValueOnce({ skills: [s1, s2] });
    const enabled = await store.getEnabled();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].id).toBe('s1');

    // 5. update s2 启用
    browserMock.mock.get.mockResolvedValueOnce({ skills: [s1, s2] });
    await store.update('s2', { enabled: true });

    // 6. remove s1
    browserMock.mock.get.mockResolvedValueOnce({
      skills: [s1, { ...s2, enabled: true }],
    });
    await store.remove('s1');

    expect(browserMock.mock.set).toHaveBeenCalled();
  });
});
