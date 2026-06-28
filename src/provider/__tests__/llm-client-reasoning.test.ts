import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LlmClient } from '../llm-client';
import type { ProviderConfig, ChatCompletionRequest } from '@/shared/types';

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-provider',
    name: 'Test',
    endpoint: 'https://api.test.com/v1',
    apiKey: 'sk-test-key',
    model: 'deepseek-reasoner',
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

describe('LlmClient reasoning', () => {
  let client: LlmClient;
  let config: ProviderConfig;

  beforeEach(() => {
    config = makeConfig();
    client = new LlmClient(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('reasoning_effort in request body', () => {
    it('chat() 请求体透传 reasoning_effort', async () => {
      const fetchSpy = mockFetchOk({
        id: 'resp-1',
        choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
      });

      await client.chat(makeRequest({ reasoning_effort: 'high' }));

      const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.reasoning_effort).toBe('high');
    });

    it('chat() 不传 reasoning_effort 时请求体不含该字段', async () => {
      const fetchSpy = mockFetchOk({
        id: 'resp-1',
        choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
      });

      await client.chat(makeRequest());

      const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.reasoning_effort).toBeUndefined();
    });

    it('chatStream() 请求体透传 reasoning_effort', async () => {
      const fetchSpy = mockFetchStream(['data: [DONE]\n\n']);

      await client.chatStream(makeRequest({ reasoning_effort: 'max' }), vi.fn());

      const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.reasoning_effort).toBe('max');
    });
  });

  describe('reasoning_content extraction', () => {
    it('chatStream() 提取 reasoning_content 并通过 onReasoning 回调传递', async () => {
      const sseData = [
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          choices: [{ delta: { role: 'assistant', reasoning_content: '让我思考一下' }, finish_reason: null }],
        })}\n\n`,
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          choices: [{ delta: { content: '答案是42', reasoning_content: '继续思考' }, finish_reason: null }],
        })}\n\n`,
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          choices: [{ delta: { content: '！' }, finish_reason: 'stop' }],
        })}\n\n`,
      ];
      mockFetchStream(sseData);

      const reasoningChunks: string[] = [];
      await client.chatStream(
        makeRequest({ reasoning_effort: 'high' }),
        vi.fn(),
        undefined,
        (content) => reasoningChunks.push(content),
      );

      expect(reasoningChunks).toHaveLength(2);
      expect(reasoningChunks[0]).toBe('让我思考一下');
      expect(reasoningChunks[1]).toBe('继续思考');
    });

    it('chatStream() 无 reasoning_content 时不调用 onReasoning', async () => {
      const sseData = [
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          choices: [{ delta: { content: 'Hi' }, finish_reason: null }],
        })}\n\n`,
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          choices: [{ delta: { content: '!' }, finish_reason: 'stop' }],
        })}\n\n`,
      ];
      mockFetchStream(sseData);

      const reasoningChunks: string[] = [];
      await client.chatStream(makeRequest(), vi.fn(), undefined, (content) =>
        reasoningChunks.push(content),
      );

      expect(reasoningChunks).toHaveLength(0);
    });

    it('chatStream() 不传 onReasoning 时不报错', async () => {
      const sseData = [
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          choices: [{ delta: { reasoning_content: '思考中', content: '答' }, finish_reason: null }],
        })}\n\n`,
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          choices: [{ delta: { content: '案' }, finish_reason: 'stop' }],
        })}\n\n`,
      ];
      mockFetchStream(sseData);

      // Should not throw when onReasoning is undefined
      await expect(
        client.chatStream(makeRequest(), vi.fn()),
      ).resolves.toBeUndefined();
    });
  });
});
