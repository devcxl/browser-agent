import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LlmClient } from '../llm-client';
import type {
  ProviderConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChunk,
} from '@/shared/types';

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-provider',
    name: 'Test',
    endpoint: 'https://api.test.com/v1',
    apiKey: 'sk-test-key',
    model: 'gpt-4',
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

function mockFetchOk(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetchStream(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } }),
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

const mockCompletionResponse: ChatCompletionResponse = {
  id: 'chatcmpl-123',
  choices: [
    {
      message: { role: 'assistant', content: 'Hello!' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

const mockToolCallResponse: ChatCompletionResponse = {
  id: 'chatcmpl-456',
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
          },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
};

const mockStreamChunk: StreamChunk = {
  id: 'chatcmpl-789',
  choices: [{ delta: { role: 'assistant', content: 'Hi' }, finish_reason: null }],
};

describe('LlmClient', () => {
  let client: LlmClient;
  let config: ProviderConfig;

  beforeEach(() => {
    config = makeConfig();
    client = new LlmClient(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('chat', () => {
    it('should send request and return response', async () => {
      const fetchSpy = mockFetchOk(mockCompletionResponse);

      const result = await client.chat(makeRequest());

      expect(result).toEqual(mockCompletionResponse);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.com/v1/v1/chat/completions');
      const body = JSON.parse(init.body as string);
      expect(body.stream).toBe(false);
      expect(body.model).toBe('gpt-4');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test-key' });
    });

    it('should handle tool_calls response', async () => {
      mockFetchOk(mockToolCallResponse);

      const result = await client.chat(makeRequest());

      expect(result.choices[0]!.finish_reason).toBe('tool_calls');
      expect(result.choices[0]!.message.tool_calls).toHaveLength(1);
      expect(result.choices[0]!.message.tool_calls![0]!.function.name).toBe('get_weather');
    });

    it('should throw on HTTP 500', async () => {
      mockFetchError(500);

      await expect(client.chat(makeRequest())).rejects.toThrow('LLM API 错误 500');
    });

    it('should throw on timeout', async () => {
      vi.useFakeTimers();
      const fastConfig = makeConfig({ timeoutMs: 100 });
      const fastClient = new LlmClient(fastConfig);
      mockFetchPending();

      const promise = fastClient.chat(makeRequest());
      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow();
      vi.useRealTimers();
    });

    it('should abort on external AbortSignal', async () => {
      mockFetchPending();
      const controller = new AbortController();

      const promise = client.chat(makeRequest(), controller.signal);
      controller.abort();

      await expect(promise).rejects.toThrow('The operation was aborted');
    });
  });

  describe('chatStream', () => {
    it('should process SSE stream chunks', async () => {
      const sseData = [
        `data: ${JSON.stringify(mockStreamChunk)}\n\n`,
        `data: ${JSON.stringify({ ...mockStreamChunk, choices: [{ delta: { content: '!' }, finish_reason: 'stop' as const }] })}\n\n`,
      ];
      mockFetchStream(sseData);

      const chunks: StreamChunk[] = [];
      await client.chatStream(makeRequest(), (chunk) => chunks.push(chunk));

      expect(chunks).toHaveLength(2);
      expect(chunks[0]!.choices[0]!.delta.content).toBe('Hi');
      expect(chunks[1]!.choices[0]!.finish_reason).toBe('stop');
    });

    it('should stop on [DONE] signal', async () => {
      const sseData = [
        `data: ${JSON.stringify(mockStreamChunk)}\n\n`,
        'data: [DONE]\n\n',
      ];
      mockFetchStream(sseData);

      const chunks: StreamChunk[] = [];
      await client.chatStream(makeRequest(), (chunk) => chunks.push(chunk));

      expect(chunks).toHaveLength(1);
    });

    it('should throw on HTTP error', async () => {
      mockFetchError(401);

      await expect(client.chatStream(makeRequest(), vi.fn())).rejects.toThrow(
        'LLM API 错误 401',
      );
    });
  });

  describe('checkHealth', () => {
    it('should return true on 200', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));

      const result = await client.checkHealth(makeConfig());

      expect(result).toBe(true);
      expect(fetchSpy.mock.calls[0]![0]).toBe('https://api.test.com/v1/v1/models');
    });

    it('should return false on 401', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));

      const result = await client.checkHealth(makeConfig());

      expect(result).toBe(false);
    });

    it('should return false on timeout', async () => {
      vi.useFakeTimers();
      mockFetchPending();

      const promise = client.checkHealth(makeConfig());
      vi.advanceTimersByTime(10000);

      const result = await promise;
      expect(result).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('extraHeaders', () => {
    it('should attach extra headers to request', async () => {
      const configWithHeaders = makeConfig({
        extraHeaders: { 'X-Custom': 'value1', 'X-Org': 'org-123' },
      });
      const customClient = new LlmClient(configWithHeaders);
      const fetchSpy = mockFetchOk(mockCompletionResponse);

      await customClient.chat(makeRequest());

      const headers = fetchSpy.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers['X-Custom']).toBe('value1');
      expect(headers['X-Org']).toBe('org-123');
      expect(headers['Authorization']).toBe('Bearer sk-test-key');
    });
  });
});
