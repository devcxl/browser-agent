import type { ProviderConfig, ILlmClient, ReasoningEffort } from './llm';
import type { LowSensitivityContext } from './browser';
import type { RiskLevel, ToolResult } from './tool';

// ==================== Agent 配置 ====================

export interface AgentConfig {
  maxToolRounds: number;
  systemPrompt: string;
  maxContextMessages: number;
  reasoningEffort?: ReasoningEffort;
  summaryThreshold: {
    messageCount: number;
    estimatedTokens: number;
    toolCallCount: number;
  };
}

// ==================== Agent 运行输入/输出 ====================

export interface AgentRunInput {
  conversationId: string;
  userMessage: string;
  providerConfig: ProviderConfig;
  browserContext: LowSensitivityContext;
  abortSignal?: AbortSignal;
}

export interface AgentRunOutput {
  finalMessage: string;
  toolCalls: ToolCallRecord[];
  tokenUsage?: { prompt: number; completion: number };
}

// ==================== 工具调用记录 ====================

export interface ToolCallRecord {
  toolName: string;
  params: Record<string, unknown>;
  result: ToolResult;
  riskLevel: RiskLevel;
  confirmed: boolean;
  timestamp: number;
  /** 原始 tool_call ID（LLM 返回） */
  toolCallId?: string;
}

// ==================== Agent Runtime 接口 ====================

export interface IAgentRuntime {
  run(input: AgentRunInput): Promise<AgentRunOutput>;
  abort(): void;
}
