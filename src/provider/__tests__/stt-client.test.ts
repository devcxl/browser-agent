import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SttClient } from '../stt-client';
import type { ProviderConfig } from '@/shared/types';
import { transcribe } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

// ---- AI SDK module mocks ----

vi.mock('ai', () => ({
  transcribe: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(),
}));

const mockTranscribe = vi.mocked(transcribe);
const mockCreateOpenAI = vi.mocked(createOpenAI);

// ---- helpers ----

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-stt-provider',
    name: 'Test STT',
    providerId: 'openai',
    endpoint: 'https://api.test.com',
    apiKey: 'sk-test-key',
    isLocalTrusted: false,
    sttModel: 'whisper-1',
    ...overrides,
  };
}

function makeAudioBlob(): Blob {
  return new Blob(['fake-audio-data'], { type: 'audio/webm' });
}

/** 返回一个永不 resolve 但尊重 AbortSignal 的 fetch mock */
function mockFetchPending() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    (_url, init) =>
      new Promise<Response>((_, reject) => {
        const signal = init?.signal as AbortSignal;
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        const onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
      }),
  );
}

/** mock transcribe 为永不 resolve 但尊重 AbortSignal 的 promise */
function mockTranscribePending() {
  mockTranscribe.mockImplementation(
    (({ abortSignal }: { abortSignal?: AbortSignal }) =>
      new Promise((_, reject) => {
        if (!abortSignal) return;
        if (abortSignal.aborted) {
          reject(abortSignal.reason);
          return;
        }
        const onAbort = () => reject(abortSignal.reason);
        abortSignal.addEventListener('abort', onAbort, { once: true });
      })) as any,
  );
}

function mockTranscribeOk(text: string) {
  mockTranscribe.mockResolvedValue({ text } as any);
}

// ---- tests ----

describe('SttClient', () => {
  let client: SttClient;

  beforeEach(() => {
    client = new SttClient(makeConfig());

    const mockTranscriptionFn = vi.fn().mockReturnValue({});
    mockCreateOpenAI.mockReturnValue({
      transcription: mockTranscriptionFn,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('transcribe', () => {
    it('should call AI SDK transcribe() and return text', async () => {
      mockTranscribeOk('Hello from SDK');

      const result = await client.transcribe(makeAudioBlob());

      expect(result).toBe('Hello from SDK');
      expect(mockTranscribe).toHaveBeenCalledTimes(1);
    });

    it('should pass Uint8Array audio and AbortSignal', async () => {
      mockTranscribeOk('ok');

      await client.transcribe(makeAudioBlob());

      const callArgs = mockTranscribe.mock.calls[0]![0];
      expect(callArgs.model).toBeDefined();
      expect(callArgs.audio).toBeInstanceOf(Uint8Array);
      expect(callArgs.abortSignal).toBeInstanceOf(AbortSignal);
    });

    it('should pass apiKey and baseURL to createOpenAI', async () => {
      mockTranscribeOk('ok');
      const sdkClient = new SttClient(
        makeConfig({ endpoint: 'https://custom.api.com', apiKey: 'sk-custom' }),
      );

      await sdkClient.transcribe(makeAudioBlob());

      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'sk-custom',
          baseURL: 'https://custom.api.com',
        }),
      );
    });

    it('should prefer api over endpoint as baseURL', async () => {
      mockTranscribeOk('ok');
      const sdkClient = new SttClient(
        makeConfig({ api: 'https://api.example.com/v1', endpoint: 'https://api.test.com' }),
      );

      await sdkClient.transcribe(makeAudioBlob());

      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://api.example.com/v1' }),
      );
    });

    it('should pass sttModel to transcription()', async () => {
      mockTranscribeOk('ok');
      const sdkClient = new SttClient(makeConfig({ sttModel: 'whisper-3' }));

      await sdkClient.transcribe(makeAudioBlob());

      const provider = mockCreateOpenAI.mock.results[0]?.value as any;
      expect(provider?.transcription).toHaveBeenCalledWith('whisper-3');
    });

    it('should pass extraHeaders to createOpenAI', async () => {
      mockTranscribeOk('ok');
      const sdkClient = new SttClient(
        makeConfig({ extraHeaders: { 'X-Custom': 'val' } }),
      );

      await sdkClient.transcribe(makeAudioBlob());

      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'X-Custom': 'val' },
        }),
      );
    });

    it('should propagate transcribe errors', async () => {
      mockTranscribe.mockRejectedValue(new Error('SDK transcription failed'));

      await expect(client.transcribe(makeAudioBlob())).rejects.toThrow(
        'SDK transcription failed',
      );
    });

    it('should throw on timeout', async () => {
      vi.useFakeTimers();
      mockTranscribePending();
      const sdkClient = new SttClient(makeConfig({ timeoutMs: 100 }));

      const promise = sdkClient.transcribe(makeAudioBlob());
      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow('请求超时');
      vi.useRealTimers();
    });

    it('should abort on external AbortSignal', async () => {
      mockTranscribePending();
      const controller = new AbortController();

      const promise = client.transcribe(makeAudioBlob(), controller.signal);
      controller.abort();

      await expect(promise).rejects.toThrow(/aborted/i);
    });

    it('should throw when sttModel is not configured', async () => {
      const sdkClient = new SttClient(makeConfig({ sttModel: undefined }));

      await expect(sdkClient.transcribe(makeAudioBlob())).rejects.toThrow(
        '未配置 STT 语音识别模型',
      );
    });

    it('should convert Blob to Uint8Array for audio', async () => {
      mockTranscribeOk('ok');
      const blob = makeAudioBlob();

      await client.transcribe(blob);

      const callArgs = mockTranscribe.mock.calls[0]![0];
      expect(callArgs.audio).toBeInstanceOf(Uint8Array);
      const decoder = new TextDecoder();
      expect(decoder.decode(callArgs.audio as Uint8Array)).toBe('fake-audio-data');
    });

    it('should handle empty apiKey gracefully (provider handles auth)', async () => {
      mockTranscribeOk('ok');
      const sdkClient = new SttClient(makeConfig({ apiKey: '' }));

      await sdkClient.transcribe(makeAudioBlob());

      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: '' }),
      );
    });
  });

  describe('checkHealth', () => {
    it('should return true on 200', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));

      const result = await client.checkHealth();

      expect(result).toBe(true);
      expect(fetchSpy.mock.calls[0]![0]).toBe('https://api.test.com/v1/models');
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('GET');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test-key' });
    });

    it('should strip trailing slash from api base url', async () => {
      const slashClient = new SttClient(makeConfig({ api: 'https://api.test.com///' }));
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));

      await slashClient.checkHealth();

      expect(fetchSpy.mock.calls[0]![0]).toBe('https://api.test.com/v1/models');
    });

    it('should prefer api over endpoint', async () => {
      const apiClient = new SttClient(
        makeConfig({ api: 'https://custom.example.com', endpoint: 'https://api.test.com' }),
      );
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));

      await apiClient.checkHealth();

      expect(fetchSpy.mock.calls[0]![0]).toBe('https://custom.example.com/v1/models');
    });

    it('should use relative path when neither api nor endpoint is set', async () => {
      const bareClient = new SttClient(makeConfig({ api: undefined, endpoint: undefined }));
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));

      await bareClient.checkHealth();

      expect(fetchSpy.mock.calls[0]![0]).toBe('/v1/models');
    });

    it('should return false on 401', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));

      const result = await client.checkHealth();

      expect(result).toBe(false);
    });

    it('should omit Authorization header when apiKey is empty', async () => {
      const noKeyClient = new SttClient(makeConfig({ apiKey: '' }));
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));

      const result = await noKeyClient.checkHealth();

      expect(result).toBe(true);
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
    });

    it('should return false on timeout', async () => {
      vi.useFakeTimers();
      mockFetchPending();

      const promise = client.checkHealth();
      vi.advanceTimersByTime(10_000);

      await expect(promise).resolves.toBe(false);
      vi.useRealTimers();
    });
  });
});
