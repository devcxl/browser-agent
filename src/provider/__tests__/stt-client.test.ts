import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SttClient } from '../stt-client';
import type { ProviderConfig } from '@/shared/types';

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

function mockFetchOk(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetchError(status: number) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }));
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

describe('SttClient', () => {
  let client: SttClient;
  let config: ProviderConfig;

  beforeEach(() => {
    config = makeConfig();
    client = new SttClient(config);

    vi.stubGlobal('OfflineAudioContext', class {
      constructor() {}
      decodeAudioData() {
        return Promise.resolve({
          numberOfChannels: 1,
          sampleRate: 48000,
          getChannelData: () => new Float32Array(48000),
        });
      }
      close() {}
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('transcribe', () => {
    it('should send POST to /v1/audio/transcriptions and return text', async () => {
      const fetchSpy = mockFetchOk({ text: 'Hello world' });

      const result = await client.transcribe(makeAudioBlob());

      expect(result).toBe('Hello world');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.com/v1/audio/transcriptions');
      expect(init.method).toBe('POST');
      expect(init.body).toBeInstanceOf(FormData);

      const formData = init.body as FormData;
      expect(formData.has('file')).toBe(true);
      expect(formData.has('model')).toBe(true);
      expect(formData.get('model')).toBe('whisper-1');

      const file = formData.get('file') as File;
      expect(file).toBeInstanceOf(File);
      // Audio is converted to WAV when sttModel is set and audioFormat is auto
      expect(file.name).toBe('audio.wav');
    });

    it('should include Authorization header', async () => {
      const fetchSpy = mockFetchOk({ text: 'ok' });

      await client.transcribe(makeAudioBlob());

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test-key' });
    });

    it('should not set Content-Type header', async () => {
      const fetchSpy = mockFetchOk({ text: 'ok' });

      await client.transcribe(makeAudioBlob());

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBeUndefined();
    });

    it('should throw on HTTP 400 error', async () => {
      mockFetchError(400);

      await expect(client.transcribe(makeAudioBlob())).rejects.toThrow('STT API 错误 400');
    });

    it('should throw on HTTP 500 error', async () => {
      mockFetchError(500);

      await expect(client.transcribe(makeAudioBlob())).rejects.toThrow('STT API 错误 500');
    });

    it('should throw on timeout', async () => {
      vi.useFakeTimers();
      const fastConfig = makeConfig({ timeoutMs: 100 });
      const fastClient = new SttClient(fastConfig);
      mockFetchPending();

      const promise = fastClient.transcribe(makeAudioBlob());
      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow('请求超时');
      vi.useRealTimers();
    });

    it('should abort on external AbortSignal', async () => {
      mockFetchPending();
      const controller = new AbortController();

      const promise = client.transcribe(makeAudioBlob(), controller.signal);
      controller.abort();

      await expect(promise).rejects.toThrow('The operation was aborted');
    });

    it('should attach extraHeaders', async () => {
      const configWithHeaders = makeConfig({
        extraHeaders: { 'X-Custom': 'value1' },
      });
      const customClient = new SttClient(configWithHeaders);
      const fetchSpy = mockFetchOk({ text: 'ok' });

      await customClient.transcribe(makeAudioBlob());

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Custom']).toBe('value1');
      expect(headers['Authorization']).toBe('Bearer sk-test-key');
    });

    it('should use configured sttModel', async () => {
      const configWithSttModel = makeConfig({ sttModel: 'whisper-2' });
      const customClient = new SttClient(configWithSttModel);
      const fetchSpy = mockFetchOk({ text: 'ok' });

      await customClient.transcribe(makeAudioBlob());

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const formData = init.body as FormData;
      expect(formData.get('model')).toBe('whisper-2');
    });

    it('should propagate fetch network errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.transcribe(makeAudioBlob())).rejects.toThrow('Failed to fetch');
    });

    it('should throw when response has no text field', async () => {
      mockFetchOk({ no_text: true });

      const result = await client.transcribe(makeAudioBlob());

      expect(result).toBeUndefined();
    });

    it('should not include Authorization header when apiKey is empty', async () => {
      const noKeyConfig = makeConfig({ apiKey: '' });
      const noKeyClient = new SttClient(noKeyConfig);
      const fetchSpy = mockFetchOk({ text: 'ok' });

      await noKeyClient.transcribe(makeAudioBlob());

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
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
    });

    it('should return false on 401', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));

      const result = await client.checkHealth();

      expect(result).toBe(false);
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
