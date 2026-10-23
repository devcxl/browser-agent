import type {
  FloatingButtonSettings,
  StorageSchema,
  IConfigStore,
  UserPreferences,
} from '@/shared/types';
import { DEFAULT_ACCENT_COLOR, normalizeAccentColor } from '@/shared/accent-palette';
import { PANEL_WIDTH_DEFAULT, clampPanelWidth } from '@/shared/panel-width';

/** 读/写共用的浮窗设置归一化：补齐缺省 panelWidth 并钳制到合法区间 */
function normalizeFloatingButtonSettings(
  settings: FloatingButtonSettings,
): FloatingButtonSettings {
  return { ...settings, panelWidth: clampPanelWidth(settings.panelWidth) };
}

/**
 * 默认配置值
 */
const DEFAULTS: StorageSchema = {
  providers: [],
  agentSettings: {
    maxToolRounds: 99,
    systemPrompt: '',
    contextWindowTokens: 128000,
    tokenBudgetMargin: 4096,
    microcompactKeepRecent: 10,
    microcompactMinChars: 500,
    microcompactExcludeTools: [],
    reasoningEffort: 'medium',
    summaryThreshold: {
      messageCount: 30,
      estimatedTokens: 12000,
    },
  },
  expertModeSettings: {
    enabled: false,
    switches: {},
  },
  preferences: {
    theme: 'system',
    accentColor: DEFAULT_ACCENT_COLOR,
    sidebarExpanded: true,
    reasoningAutoExpand: false,
  },
  skills: [],
  skillSubscriptions: [],
  floatingButtonSettings: {
    enabled: true,
    position: null,
    blacklist: [],
    panelWidth: PANEL_WIDTH_DEFAULT,
  },
};

/**
 * 合并偏好默认值并校验主色。
 * accentColor 缺省或非法时回退默认暖橙；其余字段透传（兼容旧版本存储）。
 */
function withValidAccent(prefs: Partial<UserPreferences> | undefined): UserPreferences {
  return {
    ...DEFAULTS.preferences,
    ...prefs,
    accentColor: normalizeAccentColor(prefs?.accentColor),
  };
}

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
    if (key === 'preferences') {
      return withValidAccent(value as Partial<UserPreferences> | undefined) as unknown as T;
    }
    if (key === 'floatingButtonSettings') {
      const fallback = DEFAULTS.floatingButtonSettings;
      const stored =
        value && typeof value === 'object'
          ? (value as FloatingButtonSettings)
          : fallback;
      return normalizeFloatingButtonSettings(stored) as T;
    }
    if (value !== undefined) {
      return value as T;
    }
    return DEFAULTS[key] as unknown as T;
  }

  async getAll(): Promise<StorageSchema> {
    const result = await this.storage.get(null);
    const stored = result as Partial<StorageSchema>;
    const merged = {
      ...DEFAULTS,
      ...stored,
      preferences: withValidAccent(stored.preferences),
    };
    return {
      ...merged,
      floatingButtonSettings: normalizeFloatingButtonSettings(merged.floatingButtonSettings),
    };
  }

  // ── 写入 ────────────────────────────────────────────

  async set<T>(key: keyof StorageSchema, value: T): Promise<void> {
    const next =
      key === 'preferences'
        ? withValidAccent(value as Partial<UserPreferences>)
        : key === 'floatingButtonSettings'
          ? normalizeFloatingButtonSettings(value as FloatingButtonSettings)
          : value;
    await this.storage.set({ [key]: next });
  }

  async patch(patch: Partial<StorageSchema>): Promise<void> {
    const next = { ...patch };
    // 仅在显式携带主色时校验，保持部分更新的原有语义
    if (next.preferences && 'accentColor' in next.preferences) {
      next.preferences = withValidAccent(next.preferences);
    }
    await this.storage.set(next as Record<string, unknown>);
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
        let nextValue = change.newValue;
        // 与 get/set 保持同一套校验：变更事件同样不能把非法值透给调用方
        if (key === 'preferences') {
          nextValue = withValidAccent(nextValue as Partial<UserPreferences> | undefined);
        } else if (key === 'floatingButtonSettings') {
          nextValue = normalizeFloatingButtonSettings(
            (nextValue as FloatingButtonSettings | undefined) ?? DEFAULTS.floatingButtonSettings,
          );
        }
        (typedChanges as Record<string, unknown>)[key] = nextValue;
      }
      callback(typedChanges);
    };

    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
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
