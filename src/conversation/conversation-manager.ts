import type { Conversation, StoredMessage, IConversationManager } from '@/shared/types/conversation';
import type { ILlmClient } from '@/shared/types/llm';
import type { Database } from '@/shared/db/database';
import { estimateTokens } from '@/shared/token-estimate';

const SUMMARY_THRESHOLDS = {
  messageCount: 30,
  estimatedTokens: 12_000,
} as const;

const MAX_TITLE_LENGTH = 40;

function normalizeTitle(rawTitle: string): string {
  const firstLine = rawTitle.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const sanitizedTitle = firstLine
    .trim()
    .replace(/^标题[：:]\s*/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^["'“”`]+|["'“”`]+$/g, '')
    .trim();
  return Array.from(sanitizedTitle).slice(0, MAX_TITLE_LENGTH).join('');
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
      titleGenerated: title !== undefined,
      createdAt: now,
      updatedAt: now,
      summary: null,
      summaryUpToIndex: 0,
      sensitiveDataGranted: false,
    });

    return {
      id,
      title: convTitle,
      titleGenerated: title !== undefined,
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
      titleGenerated: conv.titleGenerated,
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
      titleGenerated: c.titleGenerated,
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
      titleGenerated: patch.title !== undefined
        ? true
        : (patch.titleGenerated ?? existing.titleGenerated),
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
      timestamp: message.timestamp ?? Date.now(),
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

  async generateTitle(
    conversationId: string,
    llmClient: ILlmClient,
    model: string,
  ): Promise<string | undefined> {
    console.debug('[Title] 进入 generateTitle', { conversationId, model });

    const conversation = await this.get(conversationId);
    if (!conversation || conversation.titleGenerated) {
      console.debug('[Title] 跳过: 标题已生成', { titleGenerated: conversation?.titleGenerated });
      return undefined;
    }

    const firstUserIndex = conversation.messages.findIndex(
      (message) => message.role === 'user' && message.content.trim(),
    );
    const userMessage = conversation.messages[firstUserIndex];
    const assistantMessage = conversation.messages
      .slice(firstUserIndex + 1)
      .find((message) => message.role === 'assistant' && !message.toolCalls?.length && message.content.trim());
    if (!userMessage || !assistantMessage) {
      console.debug('[Title] 跳过: 不满足生成条件', {
        hasUserText: !!userMessage,
        hasAssistantText: !!assistantMessage,
        totalMsgCount: conversation.messages.length,
      });
      return undefined;
    }

    const response = await llmClient.chat({
      model,
      messages: [{
        role: 'user',
        content: `根据以下首轮问答生成一个准确、简洁的会话标题。标题不超过 40 个字符，不要引号、Markdown 或额外解释。\n\n用户：${userMessage.content}\n\n助手：${assistantMessage.content}`,
      }],
      temperature: 0.2,
      max_tokens: 512,
      reasoning_effort: 'none',
    });

    const rawContent = response.choices[0]?.message?.content ?? '';
    console.debug('[Title] LLM 响应', {
      rawContent: rawContent.slice(0, 80),
      contentLength: rawContent.length,
      finishReason: response.choices[0]?.finish_reason,
    });

    const title = normalizeTitle(rawContent);
    if (!title) {
      console.debug('[Title] 跳过: normalizeTitle 返回空', { rawContent: rawContent.slice(0, 80) });
      return undefined;
    }

    const updated = await this.db.updateConversationTitleIfPending(conversationId, title);
    if (!updated) {
      console.debug('[Title] 跳过: 写入前标题已更新');
      return undefined;
    }
    console.debug('[Title] 已持久化标题', { conversationId, title });
    return title;
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
