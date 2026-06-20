import type { Conversation, StoredMessage, IConversationManager } from '@/shared/types/conversation';
import type { ILlmClient } from '@/shared/types/llm';
import type { Database } from '@/shared/db/database';

const SUMMARY_THRESHOLDS = {
  messageCount: 30,
  estimatedTokens: 12_000,
  toolCallCount: 50,
} as const;

function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.5);
}

function dbMsgToStored(msg: {
  id: string;
  role: string;
  content: string;
  toolCalls?: string | null;
  toolCallId?: string | null;
  timestamp: number;
}): StoredMessage {
  return {
    id: msg.id,
    role: msg.role as StoredMessage['role'],
    content: msg.content,
    toolCalls: msg.toolCalls
      ? (JSON.parse(msg.toolCalls) as StoredMessage['toolCalls'])
      : undefined,
    toolCallId: msg.toolCallId ?? undefined,
    timestamp: msg.timestamp,
  };
}

export class ConversationManager implements IConversationManager {
  constructor(private db: Database) {}

  async create(title?: string): Promise<Conversation> {
    const now = Date.now();
    const id = crypto.randomUUID();
    const convTitle = title ?? `新对话 ${new Date(now).toLocaleString()}`;

    await this.db.putConversation({
      id,
      title: convTitle,
      createdAt: now,
      updatedAt: now,
      summary: null,
      summaryUpToIndex: 0,
      sensitiveDataGranted: false,
    });

    return {
      id,
      title: convTitle,
      createdAt: now,
      updatedAt: now,
      messages: [],
      sensitiveDataGranted: false,
    };
  }

  async get(id: string): Promise<Conversation | undefined> {
    const conv = await this.db.getConversation(id);
    if (!conv) return undefined;

    const messages = await this.db.getMessagesByConversation(id);
    return {
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messages: messages.map(dbMsgToStored),
      summary: conv.summary ?? undefined,
      summaryUpToIndex: conv.summaryUpToIndex,
      sensitiveDataGranted: conv.sensitiveDataGranted,
    };
  }

  async list(): Promise<Conversation[]> {
    const convs = await this.db.listConversationsByUpdatedAt();
    return convs.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messages: [],
      summary: c.summary ?? undefined,
      summaryUpToIndex: c.summaryUpToIndex,
      sensitiveDataGranted: c.sensitiveDataGranted,
    }));
  }

  async update(id: string, patch: Partial<Conversation>): Promise<void> {
    const existing = await this.db.getConversation(id);
    if (!existing) {
      throw new Error(`会话 ${id} 不存在`);
    }

    await this.db.putConversation({
      ...existing,
      title: patch.title ?? existing.title,
      summary: patch.summary ?? existing.summary,
      summaryUpToIndex: patch.summaryUpToIndex ?? existing.summaryUpToIndex,
      sensitiveDataGranted:
        patch.sensitiveDataGranted ?? existing.sensitiveDataGranted,
      updatedAt: Date.now(),
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteConversation(id);
  }

  async addMessage(
    conversationId: string,
    message: StoredMessage,
  ): Promise<void> {
    await this.db.putMessage({
      id: message.id,
      conversationId,
      role: message.role,
      content: message.content,
      toolCalls: message.toolCalls?.length
        ? JSON.stringify(message.toolCalls)
        : undefined,
      toolCallId: message.toolCallId,
      timestamp: message.timestamp,
    });

    const existing = await this.db.getConversation(conversationId);
    if (existing) {
      existing.updatedAt = Date.now();
      await this.db.putConversation(existing);
    }
  }

  async getRecentMessages(
    conversationId: string,
    count: number,
  ): Promise<StoredMessage[]> {
    const messages = await this.db.getRecentMessages(conversationId, count);
    return messages.map(dbMsgToStored);
  }

  async needsSummary(conversationId: string): Promise<boolean> {
    const msgCount =
      await this.db.countMessagesByConversation(conversationId);
    if (msgCount > SUMMARY_THRESHOLDS.messageCount) return true;

    const messages = await this.db.getMessagesByConversation(conversationId);
    const totalTokens = messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0,
    );
    if (totalTokens > SUMMARY_THRESHOLDS.estimatedTokens) return true;

    const logs =
      await this.db.getToolCallLogsByConversation(conversationId);
    if (logs.length > SUMMARY_THRESHOLDS.toolCallCount) return true;

    return false;
  }

  async generateSummary(
    conversationId: string,
    llmClient: ILlmClient,
  ): Promise<string> {
    const conversation = await this.get(conversationId);
    if (!conversation) {
      throw new Error(`会话 ${conversationId} 不存在`);
    }

    const startIndex = conversation.summaryUpToIndex ?? 0;
    const messagesToSummarize = conversation.messages.slice(startIndex);

    if (messagesToSummarize.length === 0) {
      return conversation.summary ?? '';
    }

    const summaryPrompt = `请用 2-3 句话总结以下对话的核心内容和已完成的操作：\n\n${messagesToSummarize.map((m) => `[${m.role}]: ${m.content}`).join('\n')}\n\n已有摘要（如有）：${conversation.summary ?? '无'}\n\n请输出合并后的简洁摘要：`;

    const response = await llmClient.chat({
      model: '',
      messages: [{ role: 'user', content: summaryPrompt }],
      temperature: 0.3,
      max_tokens: 500,
    });

    const newSummary = response.choices[0]?.message?.content ?? '';
    await this.update(conversationId, {
      summary: newSummary,
      summaryUpToIndex: conversation.messages.length,
    });

    return newSummary;
  }
}
