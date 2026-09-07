import { describe, it, expect, vi } from 'vitest';
import { LlmClient } from '../llm-client';
import type {
  ProviderConfig,
  ChatCompletionRequest,
  ILlmClient,
} from '@/shared/types';

const h = vi.hoisted(() => {
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
  const createClient = vi.fn().mockResolvedValue(mockFactoryClient);
  return { mockFactoryClient, createClient };
});

vi.mock('../provider-client-factory', () => ({
  getProviderClientFactory: () => ({
    createClient: h.createClient,
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delegate chat to factory client', async () => {
    const client = new LlmClient(makeConfig(), 'gpt-4');
    const result = await client.chat(makeRequest());

    expect(result.choices[0]!.message.content).toBe('Hello!');
    expect(h.mockFactoryClient.chat).toHaveBeenCalled();
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

  it('should return false when factory createClient fails in checkHealth', async () => {
    h.createClient.mockRejectedValueOnce(new Error('create failed'));
    const client = new LlmClient(makeConfig(), 'gpt-4');

    const result = await client.checkHealth();
    expect(result).toBe(false);
  });

  it('should forward the configured modelId to the factory', async () => {
    const client = new LlmClient(makeConfig(), 'claude-3.5-sonnet');

    await client.chat(makeRequest());

    expect(h.createClient).toHaveBeenCalledWith(makeConfig(), 'claude-3.5-sonnet');
  });

  it('should reuse the resolved client for subsequent calls (single createClient)', async () => {
    const client = new LlmClient(makeConfig(), 'gpt-4');

    await client.chat(makeRequest());
    await client.chatStream(makeRequest(), vi.fn());
    const health = await client.checkHealth();

    expect(health).toBe(true);
    expect(h.createClient).toHaveBeenCalledTimes(1);
    expect(h.mockFactoryClient.chat).toHaveBeenCalledTimes(1);
    expect(h.mockFactoryClient.chatStream).toHaveBeenCalledTimes(1);
    expect(h.mockFactoryClient.checkHealth).toHaveBeenCalledTimes(1);
  });

  it('should not issue duplicate createClient when calls overlap concurrently', async () => {
    let resolveCreate: (c: typeof h.mockFactoryClient) => void = () => {};
    h.createClient.mockImplementationOnce(
      () => new Promise((res) => (resolveCreate = res)),
    );
    const client = new LlmClient(makeConfig(), 'gpt-4');

    const first = client.chat(makeRequest());
    const second = client.chat(makeRequest());

    resolveCreate(h.mockFactoryClient);
    await Promise.all([first, second]);

    expect(h.createClient).toHaveBeenCalledTimes(1);
    expect(h.mockFactoryClient.chat).toHaveBeenCalledTimes(2);
  });
});
