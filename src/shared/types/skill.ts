// ==================== Skill 定义 ====================

export interface Skill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// ==================== Skill Store 接口 ====================

export interface ISkillStore {
  /** 获取所有 skill */
  getAll(): Promise<Skill[]>;
  /** 获取所有已启用的 skill */
  getEnabled(): Promise<Skill[]>;
  /** 全量保存 skill 列表 */
  save(skills: Skill[]): Promise<void>;
  /** 新增一个 skill */
  add(skill: Skill): Promise<void>;
  /** 更新指定 id 的 skill（部分更新） */
  update(id: string, patch: Partial<Skill>): Promise<void>;
  /** 删除指定 id 的 skill */
  remove(id: string): Promise<void>;
  /**
   * 监听 skill 变更
   * @returns 取消监听的函数
   */
  onChange(callback: (skills: Skill[]) => void): () => void;
}
