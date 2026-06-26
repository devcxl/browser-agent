export interface SkillResource {
  path: string;
  content: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  resources: SkillResource[];
  source?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SkillSubscription {
  id: string;
  source: string;
  type: 'github';
  enabled: boolean;
  lastSyncedAt: number | null;
  createdAt: number;
}

export interface ISkillStore {
  getAll(): Promise<Skill[]>;
  getEnabled(): Promise<Skill[]>;
  save(skills: Skill[]): Promise<void>;
  add(skill: Skill): Promise<void>;
  update(id: string, patch: Partial<Skill>): Promise<void>;
  remove(id: string): Promise<void>;
  onChange(callback: (skills: Skill[]) => void): () => void;
  getContent(skillId: string): Promise<{ prompt: string; resources: SkillResource[] } | null>;
  loadReady(skills: Skill[]): Promise<Skill[]>;
}
