import type { Conversation, StoredMessage, IConversationManager } from '@/shared/types/conversation';
import type { ILlmClient } from '@/shared/types/llm';
import type { Database } from '@/shared/db/database';
import { estimateTokens } from '@/shared/token-estimate';

const SUMMARY_THRESHOLDS = {
  messageCount: 30,
  estimatedTokens: 12_000,
  toolCallCount: 50,
} as const;

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

    const dialogueText = messagesToSummarize
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n');

    const existingSummary = conversation.summary
      ? `\n## 已有摘要\n${conversation.summary}`
      : '';

    const summaryPrompt = `分析以下对话片段，提取关键信息并与已有摘要合并。

## 分类体系
- **用户偏好**：用户的操作习惯、风格倾向、常用工作流
- **决策**：用户明确的选择或否定（如拒绝关闭窗口、选择归档、确认高风险操作）
- **已完成操作**：Agent 已执行成功的具体动作及结果
- **关键上下文**：值得跨轮次记住的事实（如当前项目名、工作主题）

## 合并规则
1. 优先级：用户偏好 > 决策 > 已完成操作 > 关键上下文
2. 新事实与已有事实合并去重，保留旧摘要中有价值的信息
3. 每个分类下如果没有相关事实，输出「(无)」
4. 不要编造对话中未提及的内容

## 对话内容
${dialogueText}${existingSummary}

## 输出格式
按以下 Markdown 格式输出合并后的完整摘要，不要添加额外解释：

## 用户偏好
- 事实 1
- 事实 2

## 决策
- 事实 1

## 已完成操作
- 事实 1

## 关键上下文
- 事实 1`;

    const response = await llmClient.chat({
      model: '',
      messages: [{ role: 'user', content: summaryPrompt }],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const newSummary = response.choices[0]?.message?.content ?? '';
    await this.update(conversationId, {
      summary: newSummary,
      summaryUpToIndex: conversation.messages.length,
    });

    return newSummary;
  }
}
