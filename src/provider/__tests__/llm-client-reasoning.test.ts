import { describe, it, expect, vi } from 'vitest';
import { LlmClient } from '../llm-client';
import type { ProviderConfig, ChatCompletionRequest, ILlmClient } from '@/shared/types';

const mockFactoryClient: ILlmClient = {
  chat: vi.fn().mockResolvedValue({
    id: 'resp-1',
    choices: [{ message: { role: 'assistant' as const, content: 'Hello' }, finish_reason: 'stop' as const }],
  }),
  chatStream: vi.fn().mockImplementation(async (_req, _onChunk, _signal, onReasoning) => {
    if (onReasoning) {
      onReasoning('让我思考一下');
      onReasoning('继续思考');
    }
  }),
  checkHealth: vi.fn().mockResolvedValue(true),
};

vi.mock('../provider-client-factory', () => ({
  getProviderClientFactory: () => ({
    createClient: vi.fn().mockResolvedValue(mockFactoryClient),
  }),
}));

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-provider',
    name: 'Test',
    providerId: 'openai',
    endpoint: 'https://api.test.com/v1',
    apiKey: 'sk-test-key',
    isLocalTrusted: false,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest {
  return {
    model: 'deepseek-reasoner',
    messages: [{ role: 'user', content: 'hello' }],
    ...overrides,
  };
}

describe('LlmClient reasoning', () => {
  it('should pass reasoning_effort to factory client', async () => {
    const client = new LlmClient(makeConfig(), 'deepseek-reasoner');

    await client.chat(makeRequest({ reasoning_effort: 'high' }));

    expect(mockFactoryClient.chat).toHaveBeenCalledWith(
      expect.objectContaining({ reasoning_effort: 'high' }),
      undefined,
    );
  });

  it('should pass reasoning content to onReasoning callback', async () => {
    const client = new LlmClient(makeConfig(), 'deepseek-reasoner');
    const reasoningChunks: string[] = [];

    await client.chatStream(
      makeRequest({ reasoning_effort: 'high' }),
      vi.fn(),
      undefined,
      (content) => reasoningChunks.push(content),
    );

    expect(reasoningChunks).toEqual(['让我思考一下', '继续思考']);
  });

  it('should not throw when onReasoning is undefined', async () => {
    const client = new LlmClient(makeConfig(), 'deepseek-reasoner');

    await expect(
      client.chatStream(makeRequest(), vi.fn()),
    ).resolves.toBeUndefined();
  });
});
