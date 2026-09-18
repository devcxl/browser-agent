import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmClient } from '../llm-client';
import type { ProviderConfig, ChatCompletionRequest } from '@/shared/types';

const h = vi.hoisted(() => ({
  generateText: vi.fn(),
  createLanguageModel: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: h.generateText,
}));

vi.mock('../language-model', () => ({
  createLanguageModel: h.createLanguageModel,
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
    h.createLanguageModel.mockResolvedValue({ modelId: 'mock-model' });
    h.generateText.mockResolvedValue({
      text: 'Hello!',
      finishReason: 'stop',
      response: { id: 'test-id' },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
  });

  it('should call generateText and map the result to a ChatCompletionResponse', async () => {
    const client = new LlmClient(makeConfig(), 'gpt-4');

    const result = await client.chat(makeRequest());

    expect(h.generateText).toHaveBeenCalledTimes(1);
    expect(result.choices[0]!.message.content).toBe('Hello!');
    expect(result.choices[0]!.finish_reason).toBe('stop');
    expect(result.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
  });

  it('should forward temperature, max_tokens and abort signal', async () => {
    const controller = new AbortController();
    const client = new LlmClient(makeConfig(), 'gpt-4');

    await client.chat(
      makeRequest({ temperature: 0.3, max_tokens: 2000 }),
      controller.signal,
    );

    expect(h.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.3,
        maxOutputTokens: 2000,
        abortSignal: controller.signal,
      }),
    );
  });

  it('should map finishReason length to length', async () => {
    h.generateText.mockResolvedValue({
      text: 'truncated',
      finishReason: 'length',
      response: { id: 'x' },
      usage: undefined,
    });
    const client = new LlmClient(makeConfig(), 'gpt-4');

    const result = await client.chat(makeRequest());

    expect(result.choices[0]!.finish_reason).toBe('length');
    expect(result.usage).toBeUndefined();
  });

  it('should propagate generateText errors', async () => {
    h.generateText.mockRejectedValue(new Error('provider down'));
    const client = new LlmClient(makeConfig(), 'gpt-4');

    await expect(client.chat(makeRequest())).rejects.toThrow('provider down');
  });

  it('should use the configured modelId when the request carries none', async () => {
    const client = new LlmClient(makeConfig(), 'claude-3.5-sonnet');

    await client.chat(makeRequest({ model: '' }));

    expect(h.createLanguageModel).toHaveBeenCalledWith(makeConfig(), 'claude-3.5-sonnet');
  });

  it('should prefer the request model over the configured modelId', async () => {
    const client = new LlmClient(makeConfig(), 'gpt-4');

    await client.chat(makeRequest({ model: 'gpt-4o-mini' }));

    expect(h.createLanguageModel).toHaveBeenCalledWith(makeConfig(), 'gpt-4o-mini');
  });
});
