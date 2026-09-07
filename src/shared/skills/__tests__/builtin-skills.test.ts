import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerBuiltinSkills,
  CURRENT_VERSION,
  ALL_BUILTIN_SKILLS,
} from '../builtin-skills';
import { createI18nMock } from '@/test/i18n-mock';

const BUILTIN_VERSION_KEY = 'builtin_skills_version';
const KNOWN_SOURCES = new Set([
  'builtin:tabs',
  'builtin:bookmarks',
  'builtin:windows',
  'builtin:cross',
  'builtin:downloads',
]);

/**
 * mock SkillStore（@/shared/storage 动态导入被整体替换），
 * 让 registerBuiltinSkills 可在无 IDB / 无真实 storage 副作用下被驱动。
 */
const mocks = vi.hoisted(() => {
  const getAll = vi.fn();
  const add = vi.fn();
  const update = vi.fn();
  const getInstance = vi.fn(() => ({ getAll, add, update }));
  return { getAll, add, update, getInstance };
});

vi.mock('@/shared/storage', () => ({
  SkillStore: {
    getInstance: mocks.getInstance,
    resetInstance: vi.fn(),
  },
}));

/** mock browser.storage.local（仅需 version key 的 get/set） */
function mockBrowserStorage() {
  const storage: Record<string, unknown> = {};
  const mock = {
    get: vi.fn(async (keys: string | string[] | null) => {
      const keysArr = Array.isArray(keys) ? keys : [keys as string];
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
    }),
  };
  return { mock, storage };
}

/** 构造“已注册”的内置技能（只有注册匹配需要的字段） */
function makeExisting(defs: typeof ALL_BUILTIN_SKILLS, offset = 0) {
  return defs.map((d, i) => ({
    id: `builtin-${i + offset}`,
    name: d.name,
    source: d.source,
    enabled: true,
  }));
}

describe('builtin-skills', () => {
  let browserMock: ReturnType<typeof mockBrowserStorage>;

  beforeEach(() => {
    browserMock = mockBrowserStorage();
    vi.stubGlobal('browser', {
      storage: { local: browserMock.mock },
      i18n: createI18nMock(),
    });
    mocks.getAll.mockReset();
    mocks.add.mockReset();
    mocks.update.mockReset();
    mocks.getInstance.mockClear();
    // 默认行为：无已存在技能
    mocks.getAll.mockResolvedValue([]);
    mocks.add.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(undefined);
  });

  // ── 导出结构 ──────────────────────────────────────

  it('CURRENT_VERSION 应为 1', () => {
    expect(CURRENT_VERSION).toBe(1);
  });

  it('ALL_BUILTIN_SKILLS 应包含 14 个技能且字段完整', () => {
    expect(ALL_BUILTIN_SKILLS).toHaveLength(14);
    const names = ALL_BUILTIN_SKILLS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length); // 无重名

    for (const skill of ALL_BUILTIN_SKILLS) {
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.prompt).toBeTruthy();
      expect(Array.isArray(skill.resources)).toBe(true);
      expect(KNOWN_SOURCES.has(skill.source)).toBe(true);
    }
    // 目录覆盖：tabs/bookmarks/windows/cross/downloads
    const sources = new Set(ALL_BUILTIN_SKILLS.map((s) => s.source));
    expect(sources.size).toBe(5);
  });

  it('ALL_BUILTIN_SKILLS 不应含运行时字段（id/enabled/createdAt/updatedAt）', () => {
    for (const skill of ALL_BUILTIN_SKILLS) {
      expect(skill).not.toHaveProperty('id');
      expect(skill).not.toHaveProperty('enabled');
      expect(skill).not.toHaveProperty('createdAt');
      expect(skill).not.toHaveProperty('updatedAt');
    }
  });

  // ── registerBuiltinSkills ─────────────────────────

  it('首次注册（无版本号）应 add 全部技能并写入版本号', async () => {
    // storage 为空 → storedVersion undefined → needsUpdate = true
    await registerBuiltinSkills();

    expect(mocks.getInstance).toHaveBeenCalled();
    expect(mocks.add).toHaveBeenCalledTimes(14);
    expect(mocks.update).not.toHaveBeenCalled();

    const added = mocks.add.mock.calls.map((c) => c[0]);
    const addedNames = added.map((s) => s.name).sort();
    const defNames = ALL_BUILTIN_SKILLS.map((s) => s.name).sort();
    expect(addedNames).toEqual(defNames);

    for (const skill of added) {
      expect(skill.id).toBeTruthy(); // crypto.randomUUID
      expect(skill.enabled).toBe(true);
      expect(skill.source).toMatch(/^builtin:/);
      expect(typeof skill.createdAt).toBe('number');
      expect(typeof skill.updatedAt).toBe('number');
    }
    // prompt/resources 与定义一致
    expect(added[0]!.prompt).toBe(ALL_BUILTIN_SKILLS[0]!.prompt);
    expect(added[0]!.resources).toEqual(ALL_BUILTIN_SKILLS[0]!.resources);

    // 写版本号
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      [BUILTIN_VERSION_KEY]: CURRENT_VERSION,
    });
  });

  it('版本号一致且技能已存在时应跳过（无 add/update/写版本）', async () => {
    browserMock.storage[BUILTIN_VERSION_KEY] = CURRENT_VERSION;
    const existing = makeExisting(ALL_BUILTIN_SKILLS);
    mocks.getAll.mockResolvedValue(existing);

    await registerBuiltinSkills();

    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(browserMock.mock.set).not.toHaveBeenCalled();
  });

  it('版本过期且技能已存在时应 update 全部内置技能', async () => {
    browserMock.storage[BUILTIN_VERSION_KEY] = 0; // needsUpdate = true
    const existing = makeExisting(ALL_BUILTIN_SKILLS);
    mocks.getAll.mockResolvedValue(existing);

    await registerBuiltinSkills();

    expect(mocks.update).toHaveBeenCalledTimes(14);
    expect(mocks.add).not.toHaveBeenCalled();

    for (let i = 0; i < ALL_BUILTIN_SKILLS.length; i++) {
      const def = ALL_BUILTIN_SKILLS[i]!;
      expect(mocks.update).toHaveBeenCalledWith(existing[i]!.id, {
        description: def.description,
        prompt: def.prompt,
        resources: def.resources,
      });
    }
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      [BUILTIN_VERSION_KEY]: CURRENT_VERSION,
    });
  });

  it('版本过期且部分已存在时应 update 已存在 + add 缺失技能', async () => {
    browserMock.storage[BUILTIN_VERSION_KEY] = 0;
    const firstThree = ALL_BUILTIN_SKILLS.slice(0, 3);
    const existing = makeExisting(firstThree);
    mocks.getAll.mockResolvedValue(existing);

    await registerBuiltinSkills();

    // 3 个已存在 → update；11 个缺失 → add
    expect(mocks.update).toHaveBeenCalledTimes(3);
    expect(mocks.add).toHaveBeenCalledTimes(11);
    for (let i = 0; i < 3; i++) {
      expect(mocks.update).toHaveBeenCalledWith(existing[i]!.id, {
        description: firstThree[i]!.description,
        prompt: firstThree[i]!.prompt,
        resources: firstThree[i]!.resources,
      });
    }
    const addedNames = mocks.add.mock.calls.map((c) => c[0].name);
    expect(addedNames).not.toContain(firstThree.map((d) => d.name));
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      [BUILTIN_VERSION_KEY]: CURRENT_VERSION,
    });
  });
});
