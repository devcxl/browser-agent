import type { SkillSubscription } from '@/shared/types';

const STORAGE_KEY = 'skillSubscriptions';

export class SkillSubscriptionStore {
  private static instance: SkillSubscriptionStore | null = null;
  private storage: typeof browser.storage.local;

  static getInstance(): SkillSubscriptionStore {
    if (!SkillSubscriptionStore.instance) {
      SkillSubscriptionStore.instance = new SkillSubscriptionStore();
    }
    return SkillSubscriptionStore.instance;
  }

  static resetInstance(): void {
    SkillSubscriptionStore.instance = null;
  }

  constructor() {
    this.storage = browser.storage.local;
  }

  private async readAll(): Promise<SkillSubscription[]> {
    const result = await this.storage.get(STORAGE_KEY);
    const subs = result[STORAGE_KEY];
    return Array.isArray(subs) ? (subs as SkillSubscription[]) : [];
  }

  private async writeAll(subs: SkillSubscription[]): Promise<void> {
    await this.storage.set({ [STORAGE_KEY]: subs });
  }

  async getAll(): Promise<SkillSubscription[]> {
    return this.readAll();
  }

  async add(sub: SkillSubscription): Promise<void> {
    const subs = await this.readAll();
    subs.push(sub);
    await this.writeAll(subs);
  }

  async update(id: string, patch: Partial<SkillSubscription>): Promise<void> {
    const subs = await this.readAll();
    const index = subs.findIndex((s) => s.id === id);
    if (index === -1) return;
    subs[index] = { ...subs[index], ...patch } as SkillSubscription;
    await this.writeAll(subs);
  }

  async remove(id: string): Promise<void> {
    const subs = await this.readAll();
    const filtered = subs.filter((s) => s.id !== id);
    if (filtered.length === subs.length) return;
    await this.writeAll(filtered);
  }

  onChange(callback: (subs: SkillSubscription[]) => void): () => void {
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      const subChange = changes[STORAGE_KEY];
      if (subChange) {
        callback((subChange.newValue as SkillSubscription[]) ?? []);
      }
    };
    this.storage.onChanged.addListener(handler);
    return () => this.storage.onChanged.removeListener(handler);
  }
}
