import type { ProviderConfig } from './llm';
import type { Skill, SkillSubscription } from './skill';

// ==================== chrome.storage.local 存储 Schema ====================

/** 浮窗按钮设置 */
export interface FloatingButtonSettings {
  /** 是否启用浮窗按钮 */
  enabled: boolean;
  /** 按钮位置（null 表示使用默认位置） */
  position: { side: 'left' | 'right'; top: number } | null;
  /** 不显示浮窗的站点 blacklist */
  blacklist: string[];
  /** 聊天面板宽度（px），320–720、步进 10；缺省 420 */
  panelWidth?: number;
}

/** chrome.storage.local 中存储的所有数据 */
export interface StorageSchema {
  /** Provider 配置列表 */
  providers: ProviderConfig[];
  /** Agent 设置 */
  agentSettings: AgentSettings;
  /** Expert Mode 设置 */
  expertModeSettings: ExpertModeSettings;
  /** Jev 结构化决策服务设置 */
  jevSettings: JevSettings;
  /** 全局偏好 */
  preferences: UserPreferences;
  /** 最近活跃会话 ID */
  activeConversationId?: string;
  /** Skill 列表 */
  skills: Skill[];
  /** Skill 订阅列表 */
  skillSubscriptions: SkillSubscription[];
  /** 浮窗按钮设置 */
  floatingButtonSettings: FloatingButtonSettings;
}

export interface AgentSettings {
  /** 单次任务最大执行步数，默认 99 */
  maxToolRounds: number;
  /** 模型上下文窗口 token 上限，默认 128000 */
  contextWindowTokens: number;
  /** 自定义系统提示词；空串表示使用默认值 */
  systemPrompt: string;
}

/** 默认系统提示词：用户未自定义（留空）时使用 */
export const DEFAULT_SYSTEM_PROMPT = '你是一个浏览器中的ai助手';

export interface ExpertModeSettings {
  enabled: boolean;
  switches: Record<string, boolean>;
}

export interface JevSettings {
  enabled: boolean;
  apiKey: string;
}

/** Expert Mode 支持的 API 域列表 */
export const EXPERT_API_DOMAINS = [
  'proxy',
  'debugger',
  'management',
  'privacy',
  'webRequest',
  'declarativeNetRequest',
  'nativeMessaging',
] as const;

export type ExpertApiDomain = typeof EXPERT_API_DOMAINS[number];

export interface UserPreferences {
  /** UI 主题 */
  theme: 'light' | 'dark' | 'system';
  /** 主色（支持 #rgb / #rrggbb），缺省暖橙 #c2410c */
  accentColor?: string;
  /** 侧边栏默认展开 */
  sidebarExpanded: boolean;
  /** 推理内容自动展开（流式输出时），默认 false */
  reasoningAutoExpand: boolean;
}

// ==================== IndexedDB Schema ====================

/** IndexedDB 数据库名 */
export const DB_NAME = 'browser-agent-db';
export const DB_VERSION = 4;

/** conversations 表 */
export interface DbConversation {
  id: string;
  title: string;
  /** 是否已生成或手动设置标题 */
  titleGenerated: boolean;
  createdAt: number;
  updatedAt: number;
  summary: string | null;
  summaryUpToIndex: number;
  sensitiveDataGranted: boolean;
}

/** messages 表 */
export interface DbMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** 工具调用信息 JSON 数组（仅 assistant 消息可能包含） */
  toolCalls?: string;  // JSON string: Array<{id: string, name: string, arguments: string, result?: string}>
  /** 工具调用 ID（仅 tool 消息包含） */
  toolCallId?: string;
  /**
   * 关联的 assistant 消息 ID（仅 tool 消息包含）。
   * 可选字段，不涉及索引/版本迁移；旧行缺省时按 toolCallId 兼容配对。
   */
  parentMessageId?: string;
  timestamp: number;
}

// ==================== ConfigStore 接口 ====================

export interface IConfigStore {
  /** 获取指定 key 的值 */
  get<T>(key: keyof StorageSchema): Promise<T>;
  /** 设置指定 key 的值 */
  set<T>(key: keyof StorageSchema, value: T): Promise<void>;
  /** 获取所有配置 */
  getAll(): Promise<StorageSchema>;
  /** 部分更新 */
  patch(patch: Partial<StorageSchema>): Promise<void>;
  /** 监听变更 */
  onChange(callback: (changes: Partial<StorageSchema>) => void): () => void;
}
