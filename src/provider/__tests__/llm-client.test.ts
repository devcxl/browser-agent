import { describe, it, expect, vi } from 'vitest';
import { LlmClient } from '../llm-client';
import type {
  ProviderConfig,
  ChatCompletionRequest,
  ILlmClient,
} from '@/shared/types';

const mockFactoryClient: ILlmClient = {
  chat: vi.fn().mockResolvedValue({
    id: 'test-id',
    choices: [{ message: { role: 'assistant' as const, content: 'Hello!' }, finish_reason: 'stop' as const }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }),
  chatStream: vi.fn().mockImplementation(async (_req, onChunk) => {
    onChunk({ id: '1', choices: [{ delta: { content: 'Hi' }, finish_reason: null }] });
    onChunk({ id: '1', choices: [{ delta: { content: '!' }, finish_reason: 'stop' }] });
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
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'hello' }],
    ...overrides,
  };
}

describe('LlmClient', () => {
  it('should delegate chat to factory client', async () => {
    const client = new LlmClient(makeConfig(), 'gpt-4');
    const result = await client.chat(makeRequest());

    expect(result.choices[0]!.message.content).toBe('Hello!');
    expect(mockFactoryClient.chat).toHaveBeenCalled();
  });

  it('should delegate chatStream to factory client', async () => {
    const client = new LlmClient(makeConfig(), 'gpt-4o');

    const chunks: Array<{ content?: string }> = [];
    await client.chatStream(makeRequest(), (chunk) => {
      chunks.push(chunk.choices[0]!.delta);
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.content).toBe('Hi');
  });

  it('should delegate checkHealth to factory client', async () => {
    const client = new LlmClient(makeConfig(), 'gpt-4');

    const result = await client.checkHealth();
    expect(result).toBe(true);
  });
});
