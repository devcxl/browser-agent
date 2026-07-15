import type { ProviderConfig, ReasoningEffort } from './llm';
import type { LowSensitivityContext } from './browser';
import type { RiskLevel, ToolResult } from './tool';
import type { Skill } from './skill';
import type { ExpertModeSettings } from './storage';

// ==================== Agent 配置 ====================

export interface AgentConfig {
  maxToolRounds: number;
  systemPrompt: string;
  maxContextMessages: number;
  /** 模型上下文窗口 token 上限，默认 128000 */
  contextWindowTokens: number;
  /** 预算截断安全边际（保留给 system prompt + 输出），默认 4096 */
  tokenBudgetMargin: number;
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
  /** 可用技能列表，用于 skill tool call 拦截和 context 注入 */
  skills?: Skill[];
  /** Expert Mode 设置 */
  expertModeSettings?: ExpertModeSettings;
  /** 已授予的扩展可选权限列表 */
  grantedPermissions?: string[];
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
