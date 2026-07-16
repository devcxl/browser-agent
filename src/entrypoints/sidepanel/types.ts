import type { RiskLevel, ToolResult, ReasoningEffort } from '@/shared/types';

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

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  reasoningContent?: string;
  toolCallDisplay?: ToolCallDisplay;
  timestamp: number;
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
