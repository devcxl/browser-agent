# 开发文档: T3 - 实现 SkillStore

**Project:** Agent Skill System
**Task ID:** T3
**Slug:** `implement-skill-store`
**Issue:** #77
**类型:** backend
**Batch:** 2
**依赖:** T1 (#74)

---

## 1. 目标

创建 `SkillStore` 类，遵循 `ConfigStore` 的单例模式，直接操作 `chrome.storage.local`，以 `skills` 为 key 存储 `Skill[]`。实现 `ISkillStore` 接口的全部 7 个方法。

## 2. 前置条件

- [x] T1 已完成：`src/shared/types/skill.ts` 中 `Skill` 和 `ISkillStore` 已定义
- [x] `src/shared/types/index.ts` 已导出 `Skill` 和 `ISkillStore`
- [x] `src/shared/storage/config-store.ts` 作为参考实现可查阅
- [x] `src/shared/storage/__tests__/config-store.test.ts` 作为测试参考

## 3. 架构设计

### 3.1 存储模型

```
chrome.storage.local
  └── "skills" → Skill[]    // 全量存储，单 key
```

与 `ConfigStore` 多 key 模式不同，`SkillStore` 只操作一个 key `skills`，所有 skill 数据作为一个数组整体读写。

### 3.2 类结构

```
SkillStore (implements ISkillStore)
  ├── static getInstance()   → SkillStore    // 单例获取
  ├── static resetInstance() → void          // 测试用重置
  ├── getAll()               → Promise<Skill[]>
  ├── getEnabled()           → Promise<Skill[]>     // filter enabled:true
  ├── save(skills)           → Promise<void>        // 全量替换
  ├── add(skill)             → Promise<void>        // 追加到数组
  ├── update(id, patch)      → Promise<void>        // 部分更新 + 自动 updatedAt
  ├── remove(id)             → Promise<void>        // 按 id 删除
  └── onChange(callback)     → () => void           // 监听 skills key 变更
```

### 3.3 数据流

```
读操作: getAll/getEnabled → chrome.storage.local.get("skills") → Skill[] | []
写操作: add/save/update/remove → 读取 → 内存操作 → chrome.storage.local.set({skills})
监听:   chrome.storage.onChanged → 过滤 "skills" key → 回调(Skill[])
```

## 4. 实现步骤

### 4.1 创建 `src/shared/storage/skill-store.ts`

```typescript
import type { Skill, ISkillStore } from '@/shared/types';

/** chrome.storage.local 中存储 Skill 的 key */
const STORAGE_KEY = 'skills';

/**
 * Skill 持久化存储
 *
 * 单例模式。以 `skills` 为 key 将 Skill[] 整体存入 chrome.storage.local。
 * 写操作采用"先读后写"模式确保数组一致性。
 */
export class SkillStore implements ISkillStore {
  private static instance: SkillStore | null = null;

  static getInstance(): SkillStore {
    if (!SkillStore.instance) {
      SkillStore.instance = new SkillStore();
    }
    return SkillStore.instance;
  }

  static resetInstance(): void {
    SkillStore.instance = null;
  }

  private storage: typeof browser.storage.local;

  constructor() {
    this.storage = browser.storage.local;
  }

  // ── 内部辅助 ────────────────────────────────────────

  /** 从 storage 读取 skills 数组，不存在时返回 [] */
  private async readAll(): Promise<Skill[]> {
    const result = await this.storage.get(STORAGE_KEY);
    const skills = result[STORAGE_KEY];
    return Array.isArray(skills) ? (skills as Skill[]) : [];
  }

  /** 全量写入 skills 数组 */
  private async writeAll(skills: Skill[]): Promise<void> {
    await this.storage.set({ [STORAGE_KEY]: skills });
  }

  // ── 查询 ────────────────────────────────────────────

  async getAll(): Promise<Skill[]> {
    return this.readAll();
  }

  async getEnabled(): Promise<Skill[]> {
    const skills = await this.readAll();
    return skills.filter((s) => s.enabled === true);
  }

  // ── 写入 ────────────────────────────────────────────

  async save(skills: Skill[]): Promise<void> {
    await this.writeAll(skills);
  }

  async add(skill: Skill): Promise<void> {
    const skills = await this.readAll();
    skills.push(skill);
    await this.writeAll(skills);
  }

  async update(id: string, patch: Partial<Skill>): Promise<void> {
    const skills = await this.readAll();
    const index = skills.findIndex((s) => s.id === id);
    if (index === -1) return; // 不存在则静默忽略

    skills[index] = {
      ...skills[index],
      ...patch,
      updatedAt: Date.now(), // 自动更新时间戳
    };
    await this.writeAll(skills);
  }

  async remove(id: string): Promise<void> {
    const skills = await this.readAll();
    const filtered = skills.filter((s) => s.id !== id);
    if (filtered.length === skills.length) return; // 未找到则静默忽略
    await this.writeAll(filtered);
  }

  // ── 监听 ────────────────────────────────────────────

  /**
   * 监听 skills 数据变更
   * @returns 取消监听的函数
   */
  onChange(callback: (skills: Skill[]) => void): () => void {
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      const skillsChange = changes[STORAGE_KEY];
      if (skillsChange) {
        callback((skillsChange.newValue as Skill[]) ?? []);
      }
    };

    this.storage.onChanged.addListener(handler);
    return () => this.storage.onChanged.removeListener(handler);
  }
}
```

### 4.2 修改 `src/shared/storage/index.ts`

将现有的单行导出改为：

```typescript
export { ConfigStore } from './config-store';
export { SkillStore } from './skill-store';
```

**修改前（第 1 行）：**
```typescript
export { ConfigStore } from './config-store';
```

**修改后：**
```typescript
export { ConfigStore } from './config-store';
export { SkillStore } from './skill-store';
```

### 4.3 创建 `src/shared/storage/__tests__/skill-store.test.ts`

```typescript
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

  it('save() 应全量替换 skills', async () => {
    const store = SkillStore.getInstance();
    const skills = [makeSkill({ id: 's1' }), makeSkill({ id: 's2' })];
    browserMock.mock.get.mockResolvedValueOnce({
      skills: [makeSkill({ id: 'old' })],
    });
    await store.save(skills);

    // 验证 set 被调用
    expect(browserMock.mock.set).toHaveBeenCalledWith({ skills });

    // 验证后续 getAll 返回新数据
    browserMock.mock.get.mockResolvedValueOnce({ skills });
    const result = await store.getAll();
    expect(result).toEqual(skills);
  });

  // ── add() ─────────────────────────────────────────

  it('add() 后 getAll() 应包含新 skill', async () => {
    const store = SkillStore.getInstance();
    const existing = [makeSkill({ id: 's1' })];
    const newSkill = makeSkill({ id: 's2' });

    // 模拟 storage 中已有 s1
    browserMock.mock.get.mockResolvedValueOnce({ skills: [...existing] });
    await store.add(newSkill);

    // 验证 set 被调用时包含 s1 + s2
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      skills: [...existing, newSkill],
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

    // set 仍被调用，但数据不变
    expect(browserMock.mock.set).toHaveBeenCalledWith({ skills });
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

    expect(browserMock.mock.set).toHaveBeenCalledWith({
      skills: [skills[1]],
    });
  });

  it('remove() 对不存在的 id 应静默忽略', async () => {
    const store = SkillStore.getInstance();
    const skills = [makeSkill({ id: 's1' })];

    browserMock.mock.get.mockResolvedValueOnce({ skills: [...skills] });
    await store.remove('nonexistent');

    // set 仍被调用，但数据不变
    expect(browserMock.mock.set).toHaveBeenCalledWith({ skills });
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
    const s2Updated = { ...s2, enabled: true, updatedAt: expect.any(Number) as number };
    // 注意：update 已经调用了 set，所以 storage 状态已变
    // 这里我们直接验证 remove 的行为
    browserMock.mock.get.mockResolvedValueOnce({
      skills: [s1, { ...s2, enabled: true }],
    });
    await store.remove('s1');

    expect(browserMock.mock.set).toHaveBeenCalled();
  });
});
```

## 5. 接口契约

### 5.1 SkillStore 类签名

```typescript
export class SkillStore implements ISkillStore {
  static getInstance(): SkillStore;
  static resetInstance(): void;

  getAll(): Promise<Skill[]>;
  getEnabled(): Promise<Skill[]>;
  save(skills: Skill[]): Promise<void>;
  add(skill: Skill): Promise<void>;
  update(id: string, patch: Partial<Skill>): Promise<void>;
  remove(id: string): Promise<void>;
  onChange(callback: (skills: Skill[]) => void): () => void;
}
```

### 5.2 行为约定

| 方法 | 前置条件 | 后置条件 | 边界行为 |
|------|---------|---------|---------|
| `getAll()` | 无 | 返回 `Skill[]` | storage 无数据 → `[]` |
| `getEnabled()` | 无 | 返回 `Skill[]` | 无 enabled skill → `[]` |
| `save(skills)` | 无 | `skills` 全量替换 | 传入空数组清空 |
| `add(skill)` | 无 | 追加到数组末尾 | 不校验 id 重复 |
| `update(id, patch)` | 无 | 找到则合并 + `updatedAt = Date.now()` | id 不存在 → 静默忽略 |
| `remove(id)` | 无 | 按 id 过滤删除 | id 不存在 → 静默忽略 |
| `onChange(cb)` | 无 | 注册监听器 | 返回取消函数；仅监听 `skills` key |

### 5.3 与 ConfigStore 的关键差异

| 特性 | ConfigStore | SkillStore |
|------|------------|------------|
| 存储 key | 多个独立 key | 单个 `skills` key |
| 默认值 | 通过 `DEFAULTS` 合并 | 无默认值，返回 `[]` |
| 读模式 | 支持单 key get | 只支持全量读取 |
| 写模式 | set/patch | save/add/update/remove |
| onChange 回调 | `Partial<StorageSchema>` | `Skill[]` |
| 接口 | `IConfigStore` | `ISkillStore` |

## 6. 测试指引

### 6.1 运行测试

```bash
# 运行 SkillStore 全部测试
npx vitest run src/shared/storage/__tests__/skill-store.test.ts

# 开发模式（watch）
npx vitest src/shared/storage/__tests__/skill-store.test.ts
```

### 6.2 类型检查

```bash
npx tsc --noEmit
```

### 6.3 验收检查清单

- [ ] `SkillStore.getInstance()` 返回同一实例（单例验证）
- [ ] `getAll()` 无数据时返回 `[]`
- [ ] `add()` 后 `getAll()` 包含新 skill
- [ ] `update(id, patch)` 部分更新成功，`updatedAt` 自动更新
- [ ] `update(id, patch)` 对不存在 id 静默忽略
- [ ] `remove(id)` 后 skill 不再出现在列表中
- [ ] `remove(id)` 对不存在 id 静默忽略
- [ ] `getEnabled()` 只返回 `enabled: true` 的 skill
- [ ] `onChange()` 在 `skills` 变更时触发回调
- [ ] `onChange()` 非 `skills` 变更时不触发
- [ ] `onChange()` 返回的取消函数能正确取消监听
- [ ] 单元测试覆盖全部 7 个方法 + 单例 + 集成场景
- [ ] `npx tsc --noEmit` 编译通过

## 7. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| `add/save/update/remove` 并发调用导致数据不一致 | 数据丢失 | 当前 `chrome.storage.local` 单进程环境下串行执行，暂不处理。后续如有并发问题可引入队列/锁 |
| `update` 和 `remove` 静默忽略不存在的 id | 调用方无感知 | 设计选择：不抛异常，调用方可自行校验 |
| `browser.storage.local.onChanged` 类型在 `browser.d.ts` 中未声明 | 编译报错 | ConfigStore 已使用相同模式且测试通过；如遇类型问题，在 `browser.d.ts` 补充 `onChanged` 声明 |
| `chrome.storage` 容量限制（约 10MB） | 大量 skill 可能超限 | Skill 数据以文本为主，单个 prompt 一般不超过 10KB，1000 个 skill 约 10MB，当前场景可接受 |

## 8. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/shared/storage/skill-store.ts` | 新增 | SkillStore 实现 |
| `src/shared/storage/__tests__/skill-store.test.ts` | 新增 | 单元测试 |
| `src/shared/storage/index.ts` | 修改 | 新增 `export { SkillStore }` |

## 9. 设计决策记录

1. **单 key 存储 (`skills`) vs 多 key 存储**：选择单 key。Skill 数量有限（预计 < 100），数组整体读写性能足够，实现更简单。`ConfigStore` 使用多 key 是因为不同配置项生命周期和访问频率不同。

2. **update/remove 静默忽略不存在 id**：遵循 `ConfigStore` 的防御性风格。不抛异常，调用方可自行校验。

3. **`add` 不校验 id 重复**：保持简单。id 唯一性由上层（调用方/UI）保证。

4. **`onChange` 仅监听 `skills` key**：避免无关 storage 变更触发回调，与 `ConfigStore.onChange` 监听所有 key 不同（ConfigStore 需要响应多个配置项变更）。
