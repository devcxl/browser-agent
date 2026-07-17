import type { ILlmClient } from './llm';

// ==================== 消息 ====================

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** 工具调用信息（仅 assistant 消息可能包含） */
  toolCalls?: Array<{
    id: string;
    name: string;
    params: Record<string, unknown>;
    result?: string; // 只存摘要，不存原文
  }>;
  /** 工具调用 ID（仅 tool 消息） */
  toolCallId?: string;
  /** 推理/思考内容（仅 assistant 消息） */
  reasoningContent?: string;
}

// ==================== 会话 ====================

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  /** 摘要（如有） */
  summary?: string;
  /** 摘要生成时的消息截止索引 */
  summaryUpToIndex?: number;
  /** 当前会话是否已授权发送敏感数据给远程 Provider */
  sensitiveDataGranted: boolean;
}

// ==================== Conversation Manager 接口 ====================

export interface IConversationManager {
  create(title?: string): Promise<Conversation>;
  get(id: string): Promise<Conversation | undefined>;
  list(): Promise<Conversation[]>;
  update(id: string, patch: Partial<Conversation>): Promise<void>;
  delete(id: string): Promise<void>;
  addMessage(conversationId: string, message: StoredMessage): Promise<void>;
  getRecentMessages(conversationId: string, count: number): Promise<StoredMessage[]>;
  /** 生成摘要 */
  generateSummary(conversationId: string, llmClient: ILlmClient): Promise<string>;
  /** 检查是否需要生成摘要 */
  needsSummary(conversationId: string): Promise<boolean>;
}
