import { describe, it, expect, vi } from 'vitest';
import { SummaryManager } from '../summary-manager';
import type { IConversationManager } from '@/shared/types/conversation';
import type { ILlmClient } from '@/shared/types/llm';

function createMockConversationManager(): IConversationManager {
  return {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMessage: vi.fn(),
    getRecentMessages: vi.fn(),
    generateSummary: vi.fn(),
    needsSummary: vi.fn(),
  };
}

function createMockLlmClient(): ILlmClient {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    getTokenCount: vi.fn(),
    abort: vi.fn(),
  };
}

describe('SummaryManager', () => {
  it('should call generateSummary when needsSummary returns true', async () => {
    const convManager = createMockConversationManager();
    const llmClient = createMockLlmClient();
    vi.mocked(convManager.needsSummary).mockResolvedValue(true);

    const manager = new SummaryManager(convManager);
    await manager.checkAndSummarize('conv-1', llmClient);

    expect(convManager.needsSummary).toHaveBeenCalledWith('conv-1');
    expect(convManager.generateSummary).toHaveBeenCalledWith('conv-1', llmClient);
  });

  it('should skip generateSummary when needsSummary returns false', async () => {
    const convManager = createMockConversationManager();
    const llmClient = createMockLlmClient();
    vi.mocked(convManager.needsSummary).mockResolvedValue(false);

    const manager = new SummaryManager(convManager);
    await manager.checkAndSummarize('conv-1', llmClient);

    expect(convManager.needsSummary).toHaveBeenCalledWith('conv-1');
    expect(convManager.generateSummary).not.toHaveBeenCalled();
  });

  it('should not throw when generateSummary fails', async () => {
    const convManager = createMockConversationManager();
    const llmClient = createMockLlmClient();
    vi.mocked(convManager.needsSummary).mockResolvedValue(true);
    vi.mocked(convManager.generateSummary).mockRejectedValue(new Error('LLM error'));

    const manager = new SummaryManager(convManager);
    await expect(manager.checkAndSummarize('conv-1', llmClient)).rejects.toThrow('LLM error');
  });
});
