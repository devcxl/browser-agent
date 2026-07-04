import type { ProviderConfig } from './llm';
import type { ReasoningEffort } from './llm';
import type { Skill, SkillSubscription } from './skill';

// ==================== chrome.storage.local 存储 Schema ====================

/** chrome.storage.local 中存储的所有数据 */
export interface StorageSchema {
  /** Provider 配置列表 */
  providers: ProviderConfig[];
  /** Agent 设置 */
  agentSettings: AgentSettings;
  /** Expert Mode 设置 */
  expertModeSettings: ExpertModeSettings;
  /** 全局偏好 */
  preferences: UserPreferences;
  /** 最近活跃会话 ID */
  activeConversationId?: string;
  /** Skill 列表 */
  skills: Skill[];
  /** Skill 订阅列表 */
  skillSubscriptions: SkillSubscription[];
}

export interface AgentSettings {
  /** 最大工具调用轮次，默认 15 */
  maxToolRounds: number;
  /** 系统提示词 */
  systemPrompt: string;
  /** 上下文窗口最大消息数，默认 40 */
  maxContextMessages: number;
  /** 思考强度，默认 medium */
  reasoningEffort: ReasoningEffort;
  /** 摘要触发阈值 */
  summaryThreshold: {
    messageCount: number;    // 默认 30
    estimatedTokens: number; // 默认 12000
    toolCallCount: number;   // 默认 50
  };
}

export interface ExpertModeSettings {
  enabled: boolean;
  switches: Record<string, boolean>;
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
  /** 语言 */
  language: 'zh-CN' | 'en';
  /** 侧边栏默认展开 */
  sidebarExpanded: boolean;
}

// ==================== IndexedDB Schema ====================

/** IndexedDB 数据库名 */
export const DB_NAME = 'browser-agent-db';
export const DB_VERSION = 3;

/** conversations 表 */
export interface DbConversation {
  id: string;
  title: string;
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
  timestamp: number;
}

/** toolCallLogs 表 */
export interface DbToolCallLog {
  id: string;
  conversationId: string;
  toolName: string;
  riskLevel: string;
  paramsSummary: string;
  resultSummary: string;
  success: boolean;
  confirmedByUser: boolean;
  timestamp: number;
}

/** snapshots 表 */
export interface DbSnapshot {
  id: string;
  type: 'tab' | 'window' | 'tabGroup';
  data: string; // JSON
  capturedAt: number;
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
