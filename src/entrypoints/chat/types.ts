import type { RiskLevel, PreflightResult, ToolResult } from '@/shared/types';

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
  toolCalls?: ToolCallDisplay[];
  timestamp: number;
  status?: 'streaming' | 'complete' | 'error';
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export interface AgentSettings {
  maxToolRounds: number;
  maxContextMessages: number;
  systemPrompt: string;
}

export interface ExpertModeSettings {
  enabled: boolean;
  switches: Record<string, boolean>;
}

export interface ProviderFormData {
  id?: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  isLocalTrusted: boolean;
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
