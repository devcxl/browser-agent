import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillStore } from '../skill-store';
import { Database } from '@/shared/db/database';
import type { Skill } from '@/shared/types';
import { createI18nMock } from '@/test/i18n-mock';

const DB_NAME = 'browser-agent-db';

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

/** 清空 IndexedDB（fake-indexeddb 环境） */
async function clearDatabase(): Promise<void> {
  Database.resetInstance();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('SkillStore', () => {
  let browserMock: ReturnType<typeof mockBrowserStorage>;

  beforeEach(async () => {
    await clearDatabase();
    browserMock = mockBrowserStorage();
    vi.stubGlobal('browser', {
      storage: {
        local: browserMock.mock,
        onChanged: browserMock.mock.onChanged,
      },
      i18n: createI18nMock(),
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

  it('remove() 应同时删除 IndexedDB 中的技能内容', async () => {
    const store = SkillStore.getInstance();
    const db = Database.getInstance();
    await db.putSkillContent({
      skillId: 's1',
      prompt: 'prompt-s1',
      resources: [],
    });
    await db.putSkillContent({
      skillId: 's2',
      prompt: 'prompt-s2',
      resources: [],
    });

    browserMock.mock.get.mockResolvedValueOnce({
      skills: [makeSkill({ id: 's1' }), makeSkill({ id: 's2' })],
    });
    await store.remove('s1');

    expect(await db.getSkillContent('s1')).toBeUndefined();
    expect(await db.getSkillContent('s2')).toBeDefined();
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

  it('onChange() 变更值为 undefined 时应以 [] 回调', async () => {
    const store = SkillStore.getInstance();
    const callback = vi.fn();
    store.onChange(callback);

    const change: Record<string, chrome.storage.StorageChange> = {
      skills: { newValue: undefined },
    };
    for (const listener of browserMock.listeners) {
      listener(change);
    }

    expect(callback).toHaveBeenCalledWith([]);
  });

  // ── IDB 内容持久化（真实 fake-indexeddb） ────────────

  it('update() 内容字段变更时应把新内容写入 IndexedDB', async () => {
    const store = SkillStore.getInstance();
    const db = Database.getInstance();
    await db.putSkillContent({
      skillId: 's1',
      prompt: '旧 prompt',
      resources: [{ path: 'doc.md', content: '旧内容' }],
    });

    browserMock.mock.get.mockResolvedValueOnce({
      skills: [makeSkill({ id: 's1' })],
    });
    const newResources = [{ path: 'doc.md', content: '新内容' }];
    await store.update('s1', { prompt: '新 prompt', resources: newResources });

    const content = await db.getSkillContent('s1');
    expect(content).toEqual({
      skillId: 's1',
      prompt: '新 prompt',
      resources: newResources,
    });
    // meta 不应包含 prompt/resources 字段
    const storedMeta = (browserMock.mock.set.mock.calls[0]?.[0] as {
      skills: Skill[];
    }).skills[0];
    expect(storedMeta.prompt).toBe('');
    expect(storedMeta.resources).toEqual([]);
    expect(storedMeta.name).toBe('测试 Skill');
  });

  it('update() 内容补丁缺字段时应回退到已存内容', async () => {
    const store = SkillStore.getInstance();
    const db = Database.getInstance();
    await db.putSkillContent({
      skillId: 's1',
      prompt: '已存 prompt',
      resources: [{ path: 'doc.md', content: '已存资源' }],
    });

    browserMock.mock.get.mockResolvedValueOnce({
      skills: [makeSkill({ id: 's1' })],
    });
    // 只补 prompt：resources 应回退为已存资源
    await store.update('s1', { prompt: '仅更新 prompt' });

    const content = await db.getSkillContent('s1');
    expect(content).toEqual({
      skillId: 's1',
      prompt: '仅更新 prompt',
      resources: [{ path: 'doc.md', content: '已存资源' }],
    });
  });

  it('update() 内容补丁缺字段且无已存内容时应用默认值', async () => {
    const store = SkillStore.getInstance();

    browserMock.mock.get.mockResolvedValueOnce({
      skills: [makeSkill({ id: 's1' })],
    });
    // IDB 无已存内容，仅更新 resources：prompt 回退为空串
    await store.update('s1', { resources: [{ path: 'a.md', content: 'A' }] });

    const content = await Database.getInstance().getSkillContent('s1');
    expect(content).toEqual({
      skillId: 's1',
      prompt: '',
      resources: [{ path: 'a.md', content: 'A' }],
    });
  });

  it('update() 有已存内容时仅以 resources 补丁应复用已存 prompt', async () => {
    const store = SkillStore.getInstance();
    const db = Database.getInstance();
    await db.putSkillContent({
      skillId: 's1',
      prompt: '已存 prompt',
      resources: [],
    });

    browserMock.mock.get.mockResolvedValueOnce({
      skills: [makeSkill({ id: 's1' })],
    });
    // 只补 resources：prompt 应为空时回退到已存 prompt（非空分支）
    await store.update('s1', { resources: [{ path: 'r.md', content: 'R' }] });

    const content = await db.getSkillContent('s1');
    expect(content).toEqual({
      skillId: 's1',
      prompt: '已存 prompt',
      resources: [{ path: 'r.md', content: 'R' }],
    });
  });

  it('update() 无已存内容时仅以 prompt 补丁应将 resources 回退为 []', async () => {
    const store = SkillStore.getInstance();
    const db = Database.getInstance();

    browserMock.mock.get.mockResolvedValueOnce({
      skills: [makeSkill({ id: 's1' })],
    });
    // IDB 无任何已存内容，只补 prompt：resources 两级回退到 []
    await store.update('s1', { prompt: '只有 prompt' });

    const content = await db.getSkillContent('s1');
    expect(content).toEqual({ skillId: 's1', prompt: '只有 prompt', resources: [] });
  });

  it('update() 非内容字段变更时不应触碰 IndexedDB', async () => {
    const store = SkillStore.getInstance();
    const db = Database.getInstance();
    await db.putSkillContent({
      skillId: 's1',
      prompt: '原有内容',
      resources: [],
    });
    const putSkillContent = vi.spyOn(db, 'putSkillContent');
    const getSkillContent = vi.spyOn(db, 'getSkillContent');

    browserMock.mock.get.mockResolvedValueOnce({
      skills: [makeSkill({ id: 's1' })],
    });
    await store.update('s1', { name: '改名' });

    expect(putSkillContent).not.toHaveBeenCalled();
    expect(getSkillContent).not.toHaveBeenCalled();
    expect((await db.getSkillContent('s1'))!.prompt).toBe('原有内容');
  });

  it('add() 携带内容时应写入 IndexedDB', async () => {
    const store = SkillStore.getInstance();
    const db = Database.getInstance();
    const skill = makeSkill({
      id: 's1',
      prompt: '技能 prompt',
      resources: [{ path: 'ref.md', content: '参考' }],
    });

    browserMock.mock.get.mockResolvedValueOnce({ skills: [] });
    await store.add(skill);

    const content = await db.getSkillContent('s1');
    expect(content).toEqual({
      skillId: 's1',
      prompt: '技能 prompt',
      resources: [{ path: 'ref.md', content: '参考' }],
    });
  });

  it('save() 应把带内容的技能批量写入 IndexedDB', async () => {
    const store = SkillStore.getInstance();
    const db = Database.getInstance();
    const skills = [
      makeSkill({ id: 's1', prompt: 'prompt-1', resources: [] }),
      makeSkill({
        id: 's2',
        prompt: '',
        resources: [{ path: 'f.md', content: 'F' }],
      }),
      makeSkill({ id: 's3', prompt: '', resources: [] }),
    ];

    await store.save(skills);

    expect((await db.getSkillContent('s1'))!.prompt).toBe('prompt-1');
    expect((await db.getSkillContent('s2'))!.resources).toEqual([
      { path: 'f.md', content: 'F' },
    ]);
    // 无内容的技能不写 IDB
    expect(await db.getSkillContent('s3')).toBeUndefined();
  });

  it('add() 无内容字段时应跳过 IndexedDB 写入', async () => {
    const store = SkillStore.getInstance();
    const db = Database.getInstance();
    // prompt 为空且 resources 为空 → 条件右侧被求值（false）
    const skill = makeSkill({ id: 's1', prompt: '', resources: [] });

    browserMock.mock.get.mockResolvedValueOnce({ skills: [] });
    await store.add(skill);

    expect(await db.getSkillContent('s1')).toBeUndefined();
  });

  it('add() prompt 为空但带 resources 时也应写入 IndexedDB', async () => {
    const store = SkillStore.getInstance();
    const db = Database.getInstance();
    // prompt 为空 → 需右侧 resources.length > 0 决定是否写入
    const skill = makeSkill({
      id: 's1',
      prompt: '',
      resources: [{ path: 'r.md', content: 'R' }],
    });

    browserMock.mock.get.mockResolvedValueOnce({ skills: [] });
    await store.add(skill);

    const content = await db.getSkillContent('s1');
    expect(content).toEqual({
      skillId: 's1',
      prompt: '',
      resources: [{ path: 'r.md', content: 'R' }],
    });
  });

  // ── getContent() / loadReady() ───────────────────────

  it('getContent() 应返回 IndexedDB 中的内容', async () => {
    const store = SkillStore.getInstance();
    const db = Database.getInstance();
    await db.putSkillContent({
      skillId: 's1',
      prompt: '已有 prompt',
      resources: [{ path: 'r.md', content: 'R' }],
    });

    const result = await store.getContent('s1');
    expect(result).toEqual({
      prompt: '已有 prompt',
      resources: [{ path: 'r.md', content: 'R' }],
    });
  });

  it('getContent() 无内容时应返回 null', async () => {
    const store = SkillStore.getInstance();
    const result = await store.getContent('nonexistent');
    expect(result).toBeNull();
  });

  it('loadReady() 应合并已存内容并保留原字段', async () => {
    const store = SkillStore.getInstance();
    const db = Database.getInstance();
    await db.putSkillContent({
      skillId: 's1',
      prompt: '内容 prompt',
      resources: [{ path: 'doc.md', content: 'DOC' }],
    });

    const ready = await store.loadReady([
      makeSkill({ id: 's1', prompt: '', resources: [] }),
      makeSkill({ id: 's2', prompt: '', resources: [] }),
    ]);

    expect(ready[0]!.id).toBe('s1');
    expect(ready[0]!.prompt).toBe('内容 prompt');
    expect(ready[0]!.resources).toEqual([{ path: 'doc.md', content: 'DOC' }]);
    // 无内容时回退为空
    expect(ready[1]!.prompt).toBe('');
    expect(ready[1]!.resources).toEqual([]);
    // 非内容字段不被覆盖
    expect(ready[0]!.name).toBe('测试 Skill');
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
