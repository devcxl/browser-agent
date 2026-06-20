import type { StorageSchema, IConfigStore } from '@/shared/types';

/**
 * 默认配置值
 */
const DEFAULTS: StorageSchema = {
  providers: [],
  agentSettings: {
    maxToolRounds: 15,
    systemPrompt: '',
    maxContextMessages: 40,
    reasoningEffort: 'medium',
    summaryThreshold: {
      messageCount: 30,
      estimatedTokens: 12000,
      toolCallCount: 50,
    },
  },
  expertModeSettings: {
    enabled: false,
    switches: {},
  },
  preferences: {
    theme: 'system',
    language: 'zh-CN',
    sidebarExpanded: true,
  },
};

/**
 * chrome.storage.local 配置存储
 *
 * 单例模式。封装 chrome.storage.local 的读写操作，
 * 支持类型安全的 get/set、部分更新 patch、变更监听 onChange。
 */
export class ConfigStore implements IConfigStore {
  private static instance: ConfigStore | null = null;

  static getInstance(): ConfigStore {
    if (!ConfigStore.instance) {
      ConfigStore.instance = new ConfigStore();
    }
    return ConfigStore.instance;
  }

  static resetInstance(): void {
    ConfigStore.instance = null;
  }

  private storage: typeof browser.storage.local;

  constructor() {
    this.storage = browser.storage.local;
  }

  // ── 读取 ────────────────────────────────────────────

  async get<T>(key: keyof StorageSchema): Promise<T> {
    const result = await this.storage.get(key);
    const value = result[key];
    if (value !== undefined) {
      return value as T;
    }
    return DEFAULTS[key] as unknown as T;
  }

  async getAll(): Promise<StorageSchema> {
    const result = await this.storage.get(null);
    return {
      ...DEFAULTS,
      ...(result as Partial<StorageSchema>),
    };
  }

  // ── 写入 ────────────────────────────────────────────

  async set<T>(key: keyof StorageSchema, value: T): Promise<void> {
    await this.storage.set({ [key]: value });
  }

  async patch(patch: Partial<StorageSchema>): Promise<void> {
    await this.storage.set(patch as Record<string, unknown>);
  }

  // ── 监听 ────────────────────────────────────────────

  /**
   * 监听配置变更
   * @returns 取消监听的函数
   */
  onChange(callback: (changes: Partial<StorageSchema>) => void): () => void {
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      const typedChanges: Partial<StorageSchema> = {};
      for (const [key, change] of Object.entries(changes)) {
        (typedChanges as Record<string, unknown>)[key] = change.newValue;
      }
      callback(typedChanges);
    };

    this.storage.onChanged.addListener(handler);
    return () => this.storage.onChanged.removeListener(handler);
  }

  // ── 工具方法 ────────────────────────────────────────

  /** 清除所有配置（重置为默认值） */
  async clear(): Promise<void> {
    await this.storage.clear();
  }

  /** 获取默认配置快照 */
  getDefaults(): StorageSchema {
    return structuredClone(DEFAULTS);
  }
}
