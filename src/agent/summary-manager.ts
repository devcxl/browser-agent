import type { IConversationManager } from '@/shared/types/conversation';
import type { ILlmClient } from '@/shared/types/llm';

export class SummaryManager {
  constructor(private conversationManager: IConversationManager) {}

  async checkAndSummarize(
    conversationId: string,
    llmClient: ILlmClient,
  ): Promise<void> {
    if (await this.conversationManager.needsSummary(conversationId)) {
      await this.conversationManager.generateSummary(conversationId, llmClient);
    }
  }
}
