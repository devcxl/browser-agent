import type { Skill, ISkillStore, SkillResource } from '@/shared/types';
import { Database } from '@/shared/db/database';

const STORAGE_KEY = 'skills';

const CONTENT_FIELDS = ['prompt', 'resources'] as const;

function pickMeta(skill: Skill): Skill {
  const meta = { ...skill };
  for (const field of CONTENT_FIELDS) {
    delete (meta as Record<string, unknown>)[field];
  }
  return { ...meta, prompt: '', resources: [] };
}

export class SkillStore implements ISkillStore {
  private static instance: SkillStore | null = null;
  private storage: typeof browser.storage.local;

  static getInstance(): SkillStore {
    if (!SkillStore.instance) {
      SkillStore.instance = new SkillStore();
    }
    return SkillStore.instance;
  }

  static resetInstance(): void {
    SkillStore.instance = null;
  }

  constructor() {
    this.storage = browser.storage.local;
  }

  private async readMeta(): Promise<Skill[]> {
    const result = await this.storage.get(STORAGE_KEY);
    const skills = result[STORAGE_KEY];
    return Array.isArray(skills) ? (skills as Skill[]) : [];
  }

  private async writeMeta(skills: Skill[]): Promise<void> {
    const metaOnly = skills.map(pickMeta);
    await this.storage.set({ [STORAGE_KEY]: metaOnly });
  }

  private async ensureDb(): Promise<Database> {
    return Database.getInstance();
  }

  async getAll(): Promise<Skill[]> {
    return this.readMeta();
  }

  async getEnabled(): Promise<Skill[]> {
    const skills = await this.readMeta();
    return skills.filter((s) => s.enabled === true);
  }

  async save(skills: Skill[]): Promise<void> {
    const db = await this.ensureDb();
    const metaOnly = skills.map(pickMeta);
    await this.storage.set({ [STORAGE_KEY]: metaOnly });
    // bulk write content to IDB
    for (const skill of skills) {
      if (skill.prompt || skill.resources.length > 0) {
        await db.putSkillContent({ skillId: skill.id, prompt: skill.prompt, resources: skill.resources });
      }
    }
  }

  async add(skill: Skill): Promise<void> {
    const db = await this.ensureDb();
    const skills = await this.readMeta();
    skills.push(pickMeta(skill));
    await this.writeMeta(skills);
    if (skill.prompt || skill.resources.length > 0) {
      await db.putSkillContent({ skillId: skill.id, prompt: skill.prompt, resources: skill.resources });
    }
  }

  async update(id: string, patch: Partial<Skill>): Promise<void> {
    const db = await this.ensureDb();
    const skills = await this.readMeta();
    const index = skills.findIndex((s) => s.id === id);
    if (index === -1) return;

    const hasContentPatch = 'prompt' in patch || 'resources' in patch;

    const metaPatch = { ...patch };
    for (const field of CONTENT_FIELDS) {
      delete (metaPatch as Record<string, unknown>)[field];
    }

    skills[index] = {
      ...skills[index],
      ...metaPatch,
      updatedAt: Date.now(),
    } as Skill;

    if (metaPatch !== patch || hasContentPatch) {
      // also update timestamps in meta when only content changes
      if (!metaPatch || Object.keys(metaPatch).length === 0) {
        skills[index].updatedAt = Date.now();
      }
    }

    await this.writeMeta(skills);

    if (hasContentPatch) {
      const existing = await db.getSkillContent(id);
      await db.putSkillContent({
        skillId: id,
        prompt: patch.prompt ?? existing?.prompt ?? '',
        resources: patch.resources ?? existing?.resources ?? [],
      });
    }
  }

  async remove(id: string): Promise<void> {
    const db = await this.ensureDb();
    const skills = await this.readMeta();
    const filtered = skills.filter((s) => s.id !== id);
    if (filtered.length === skills.length) return;
    await this.writeMeta(filtered);
    await db.deleteSkillContent(id);
  }

  async getContent(skillId: string): Promise<{ prompt: string; resources: SkillResource[] } | null> {
    const db = await this.ensureDb();
    const content = await db.getSkillContent(skillId);
    if (!content) return null;
    return { prompt: content.prompt, resources: content.resources };
  }

  async loadReady(skills: Skill[]): Promise<Skill[]> {
    const db = await this.ensureDb();
    return Promise.all(
      skills.map(async (skill) => {
        const content = await db.getSkillContent(skill.id);
        return {
          ...skill,
          prompt: content?.prompt ?? '',
          resources: content?.resources ?? [],
        };
      }),
    );
  }

  onChange(callback: (skills: Skill[]) => void): () => void {
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      const skillsChange = changes[STORAGE_KEY];
      if (skillsChange) {
        callback((skillsChange.newValue as Skill[]) ?? []);
      }
    };
    this.storage.onChanged.addListener(handler);
    return () => this.storage.onChanged.removeListener(handler);
  }
}
