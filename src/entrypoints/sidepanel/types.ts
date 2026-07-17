import type { RiskLevel, ToolResult, ReasoningEffort } from '@/shared/types';
import type { UIMessage as AiUIMessage } from 'ai';

export type AgentStatus = 'idle' | 'running' | 'streaming' | 'waitingConfirmation';

export interface ToolCallDisplay {
  id: string;
  name: string;
  params: Record<string, unknown>;
  result?: ToolResult;
  status: 'running' | 'success' | 'error';
  riskLevel: RiskLevel;
  confirmed: boolean;
}

/** AI SDK 工具调用状态映射到 UI 状态 */
export type ToolCallSDKState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

/** AI SDK 工具调用 UI 数据 */
export interface ToolCallSDK {
  toolCallId: string;
  toolName: string;
  state: ToolCallSDKState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

/**
 * UI 消息类型。
 * 兼容两种格式：
 * - 旧格式：content + reasoningContent + toolCallDisplay + timestamp
 * - AI SDK 格式：parts（直接从 ai SDK UIMessage 传入）
 */
export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  /** 纯文本内容（旧格式），parts 存在时可省略 */
  content?: string;
  /** AI SDK parts 数组，存在时优先使用 */
  parts?: AiUIMessage['parts'];
  reasoningContent?: string;
  toolCallDisplay?: ToolCallDisplay;
  /** 消息时间戳，默认 Date.now() */
  timestamp?: number;
  status?: 'streaming' | 'complete' | 'error';
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
  status?: AgentStatus;
}

export interface AgentSettings {
  maxToolRounds: number;
  maxContextMessages: number;
  contextWindowTokens: number;
  tokenBudgetMargin: number;
  microcompactKeepRecent: number;
  microcompactMinChars: number;
  microcompactExcludeTools: string[];
  systemPrompt: string;
  reasoningEffort: ReasoningEffort;
}

export interface ExpertModeSettings {
  enabled: boolean;
  switches: Record<string, boolean>;
}

export interface ProviderFormData {
  id?: string;
  name: string;
  providerId: string;
  endpoint: string;
  apiKey: string;
  isCustom: boolean;
  isLocalTrusted: boolean;
  /** STT 语音识别模型（可选） */
  sttModel?: string;
  /** 音频格式（可选），留空则自动检测 */
  audioFormat?: string;
}

export interface ConfirmRequest {
  affectedObjects: Array<{
    type: string;
    title?: string;
    url?: string;
    reason?: string;
  }>;
  warnings: string[];
  toolName: string;
  params: Record<string, unknown>;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
}
