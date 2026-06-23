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
    } as Skill;
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
