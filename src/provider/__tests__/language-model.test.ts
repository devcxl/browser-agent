import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLanguageModel } from '../language-model';
import type { ProviderConfig } from '@/shared/types';

const h = vi.hoisted(() => ({
  createOpenAI: vi.fn(),
  createOpenAICompatible: vi.fn(),
  createAnthropic: vi.fn(),
  createGoogleGenerativeAI: vi.fn(),
  createCohere: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: h.createOpenAI }));
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: h.createOpenAICompatible }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: h.createAnthropic }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: h.createGoogleGenerativeAI }));
vi.mock('@ai-sdk/cohere', () => ({ createCohere: h.createCohere }));

vi.mock('../provider-catalog', () => ({
  ProviderCatalog: {
    getInstance: () => ({ getProvider: h.getProvider }),
  },
}));

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-provider',
    name: 'Test',
    apiKey: 'sk-test-key',
    isLocalTrusted: false,
    ...overrides,
  };
}

/** 各 provider 工厂返回带 languageModel/chatModel 的桩对象 */
function stubProvider(languageModel = vi.fn().mockReturnValue({ modelId: 'm' })) {
  return { languageModel, chatModel: languageModel };
}

describe('createLanguageModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getProvider.mockResolvedValue(null);
    h.createOpenAI.mockReturnValue(stubProvider());
    h.createOpenAICompatible.mockReturnValue(stubProvider());
    h.createAnthropic.mockReturnValue(stubProvider());
    h.createGoogleGenerativeAI.mockReturnValue(stubProvider());
    h.createCohere.mockReturnValue(stubProvider());
  });

  it('routes @ai-sdk/anthropic providers to createAnthropic', async () => {
    await createLanguageModel(makeConfig({ npm: '@ai-sdk/anthropic' }), 'claude-3');

    expect(h.createAnthropic).toHaveBeenCalledTimes(1);
    expect(h.createOpenAICompatible).not.toHaveBeenCalled();
  });

  it('routes @ai-sdk/google providers to createGoogleGenerativeAI', async () => {
    await createLanguageModel(makeConfig({ npm: '@ai-sdk/google' }), 'gemini-2');

    expect(h.createGoogleGenerativeAI).toHaveBeenCalledTimes(1);
    expect(h.createOpenAICompatible).not.toHaveBeenCalled();
  });

  it('routes @ai-sdk/cohere providers to createCohere', async () => {
    await createLanguageModel(makeConfig({ npm: '@ai-sdk/cohere' }), 'command-r');

    expect(h.createCohere).toHaveBeenCalledTimes(1);
  });

  it('routes @ai-sdk/openai providers to createOpenAI', async () => {
    await createLanguageModel(makeConfig({ npm: '@ai-sdk/openai' }), 'gpt-4o');

    expect(h.createOpenAI).toHaveBeenCalledTimes(1);
  });

  it('falls back to createOpenAICompatible with includeUsage for unknown npm', async () => {
    await createLanguageModel(makeConfig({ npm: '@unknown/provider' }), 'model-x');

    expect(h.createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({ includeUsage: true }),
    );
  });

  it('requests streaming usage on the openai-compatible path (context ring data source)', async () => {
    await createLanguageModel(makeConfig({ npm: '@ai-sdk/openai-compatible' }), 'model-x');

    expect(h.createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({ includeUsage: true }),
    );
  });

  it('resolves npm from the catalog when config has none', async () => {
    h.getProvider.mockResolvedValue({ id: 'anthropic', npm: '@ai-sdk/anthropic' });

    await createLanguageModel(makeConfig({ providerId: 'anthropic' }), 'claude-3');

    expect(h.createAnthropic).toHaveBeenCalledTimes(1);
  });

  it('falls back to openai-compatible when the catalog lookup throws', async () => {
    h.getProvider.mockRejectedValue(new Error('offline'));

    await createLanguageModel(makeConfig({ providerId: 'anthropic' }), 'claude-3');

    expect(h.createOpenAICompatible).toHaveBeenCalledTimes(1);
  });

  it('passes apiKey, baseURL and extra headers through', async () => {
    await createLanguageModel(
      makeConfig({
        npm: '@ai-sdk/anthropic',
        apiKey: 'sk-custom',
        api: 'https://custom.example.com/',
        extraHeaders: { 'X-Custom': 'v' },
      }),
      'claude-3',
    );

    expect(h.createAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-custom',
        baseURL: 'https://custom.example.com',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-custom',
          'X-Custom': 'v',
        }),
      }),
    );
  });

  it('prefers api over endpoint as baseURL', async () => {
    await createLanguageModel(
      makeConfig({ npm: '@ai-sdk/google', api: 'https://api.example.com', endpoint: 'https://old.example.com' }),
      'gemini-2',
    );

    expect(h.createGoogleGenerativeAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.example.com' }),
    );
  });

  it('omits baseURL when neither api nor endpoint is configured', async () => {
    await createLanguageModel(makeConfig({ npm: '@ai-sdk/anthropic' }), 'claude-3');

    const arg = h.createAnthropic.mock.calls[0]![0] as Record<string, unknown>;
    expect('baseURL' in arg).toBe(false);
  });

  it('omits the Authorization header when apiKey is empty', async () => {
    await createLanguageModel(makeConfig({ npm: '@ai-sdk/anthropic', apiKey: '' }), 'claude-3');

    const arg = h.createAnthropic.mock.calls[0]![0] as { headers: Record<string, string> };
    expect(arg.headers.Authorization).toBeUndefined();
  });
});
