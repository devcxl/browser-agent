import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pickConnectionTestModelId, testProviderConnection } from '../connection-test';
import type { ProviderConfig } from '@/shared/types';

const API_KEY = 'sk-secret-should-never-leak';

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-provider',
    name: 'Test',
    npm: '@ai-sdk/openai-compatible',
    api: 'https://host/v1',
    apiKey: API_KEY,
    isLocalTrusted: false,
    ...overrides,
  };
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'test-model',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

/** 一串合法的 OpenAI-compatible 流式响应；text 为空表示只走了 start/finish */
function sseLines(text: string): string[] {
  const lines = [chunk({ role: 'assistant' })];
  if (text) lines.push(chunk({ content: text }));
  lines.push(chunk({}, 'stop'), 'data: [DONE]\n\n');
  return lines;
}

function sseResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function htmlResponse(status = 200): Response {
  return new Response('<!doctype html><html><body>edge proxy</body></html>', {
    status,
    headers: { 'content-type': 'text/html' },
  });
}

type FetchCall = { url: string; init: RequestInit | undefined };

function installFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): FetchCall[] {
  const calls: FetchCall[] = [];
  const stub = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    calls.push({ url, init });
    return handler(url, init);
  });
  vi.stubGlobal('fetch', stub);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('testProviderConnection', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports ok when the provider streams real text', async () => {
    installFetch(async () => sseResponse(sseLines('OK')));

    const result = await testProviderConnection(makeConfig(), 'test-model');

    expect(result).toEqual({ ok: true });
  });

  it('requests <base>/chat/completions with a short streaming, tool-free request', async () => {
    const calls = installFetch(async () => sseResponse(sseLines('OK')));

    await testProviderConnection(makeConfig({ api: 'https://host/v1/' }), 'test-model');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://host/v1/chat/completions');

    const body = JSON.parse(String(calls[0]!.init?.body)) as Record<string, unknown>;
    expect(body.model).toBe('test-model');
    expect(body.stream).toBe(true);
    expect(body.tools).toBeUndefined();
    expect(typeof body.max_tokens).toBe('number');
    expect(body.max_tokens as number).toBeLessThanOrEqual(256);
  });

  it('does not invent a /v1 segment for a bare base URL', async () => {
    const calls = installFetch(async (url) => {
      if (url === 'https://host/chat/completions') return htmlResponse(200);
      if (url === 'https://host/v1/chat/completions') return sseResponse(sseLines('OK'));
      return htmlResponse(404);
    });

    const result = await testProviderConnection(makeConfig({ api: 'https://host' }), 'test-model');

    expect(result.ok).toBe(false);
    expect(calls.map((call) => call.url)).toEqual(['https://host/chat/completions']);
  });

  it('rejects a 200 HTML page that is not a model response', async () => {
    installFetch(async () => htmlResponse(200));

    const result = await testProviderConnection(makeConfig(), 'test-model');

    expect(result).toEqual({ ok: false, reason: 'request-failed' });
  });

  it.each([401, 403])('classifies HTTP %i as auth', async (status) => {
    installFetch(async () => new Response('{"error":"nope"}', { status }));

    const result = await testProviderConnection(makeConfig(), 'test-model');

    expect(result).toEqual({ ok: false, reason: 'auth' });
  });

  it('classifies other HTTP errors as request-failed', async () => {
    installFetch(async () => new Response('{"error":"boom"}', { status: 500 }));

    const result = await testProviderConnection(makeConfig(), 'test-model');

    expect(result).toEqual({ ok: false, reason: 'request-failed' });
  });

  it('classifies a stream with no generated text as empty-response', async () => {
    installFetch(async () => sseResponse(sseLines('')));

    const result = await testProviderConnection(makeConfig(), 'test-model');

    expect(result).toEqual({ ok: false, reason: 'empty-response' });
  });

  it('classifies whitespace-only generated text as empty-response', async () => {
    installFetch(async () => sseResponse(sseLines('  \n\t ')));

    const result = await testProviderConnection(makeConfig(), 'test-model');

    expect(result).toEqual({ ok: false, reason: 'empty-response' });
  });

  it('does not report ok when an upstream error event follows generated text', async () => {
    const calls = installFetch(async () => sseResponse([
      chunk({ role: 'assistant' }),
      chunk({ content: 'OK' }),
      `data: ${JSON.stringify({ error: { message: 'upstream failed after partial output' } })}\n\n`,
      'data: [DONE]\n\n',
    ]));

    const result = await testProviderConnection(makeConfig(), 'test-model');

    expect(result).toEqual({ ok: false, reason: 'request-failed' });
    // 早退后不得留下仍在进行的请求
    expect(calls[0]!.init?.signal?.aborted).toBe(true);
  });

  it('does not report ok when the stream is cut off after generated text', async () => {
    // 只有 text-delta，没有 finish_reason：连接在中途断开
    installFetch(async () => sseResponse([
      chunk({ role: 'assistant' }),
      chunk({ content: 'OK' }),
    ]));

    const result = await testProviderConnection(makeConfig(), 'test-model');

    expect(result).toEqual({ ok: false, reason: 'request-failed' });
  });

  it('does not report ok when the response body throws after generated text', async () => {
    let served = 0;
    installFetch(async () => new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (served++ === 0) controller.enqueue(new TextEncoder().encode(chunk({ content: 'OK' })));
          else controller.error(new Error('socket hang up'));
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const result = await testProviderConnection(makeConfig(), 'test-model');

    expect(result).toEqual({ ok: false, reason: 'request-failed' });
  });

  it('reports ok for a generation truncated by the token cap (length finish)', async () => {
    installFetch(async () => sseResponse([
      chunk({ role: 'assistant' }),
      chunk({ content: 'OK' }, 'length'),
      'data: [DONE]\n\n',
    ]));

    const result = await testProviderConnection(makeConfig(), 'test-model');

    expect(result).toEqual({ ok: true });
  });

  it('aborts and reports timeout when the provider never answers', async () => {
    let aborted = false;
    installFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('aborted', 'AbortError'));
      });
    }));

    const result = await testProviderConnection(makeConfig(), 'test-model', { timeoutMs: 20 });

    expect(result).toEqual({ ok: false, reason: 'timeout' });
    expect(aborted).toBe(true);
  });

  it('reports timeout when the stream stalls mid-response', async () => {
    installFetch((_url, init) => Promise.resolve(new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(chunk({ role: 'assistant' })));
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    )));

    const result = await testProviderConnection(makeConfig(), 'test-model', { timeoutMs: 20 });

    expect(result).toEqual({ ok: false, reason: 'timeout' });
  });

  it('reports missing-model for a blank model id without touching the network', async () => {
    const calls = installFetch(async () => sseResponse(sseLines('OK')));

    expect(await testProviderConnection(makeConfig(), '')).toEqual({ ok: false, reason: 'missing-model' });
    expect(await testProviderConnection(makeConfig(), '   ')).toEqual({ ok: false, reason: 'missing-model' });
    expect(calls).toHaveLength(0);
  });

  it('never leaks credentials, headers or upstream bodies through the result or console', async () => {
    installFetch(async () => new Response(
      `{"error":"invalid api key ${API_KEY}"}`,
      { status: 401, headers: { 'x-request-id': 'req-1' } },
    ));

    const result = await testProviderConnection(makeConfig(), 'test-model');
    const serialized = JSON.stringify(result);

    expect(result).toEqual({ ok: false, reason: 'auth' });
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain('req-1');
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });
});

describe('pickConnectionTestModelId', () => {
  const withModels = (overrides: Partial<ProviderConfig> = {}): ProviderConfig => makeConfig({
    models: {
      'model-a': { id: 'model-a', name: 'A' },
      'model-b': { id: 'model-b', name: 'B' },
    },
    ...overrides,
  });

  it('uses the current selection when the provider is the active one', () => {
    expect(pickConnectionTestModelId(withModels(), 'test-provider', 'model-b')).toBe('model-b');
  });

  it('ignores the selection when another provider is active', () => {
    expect(pickConnectionTestModelId(withModels({ defaultModelId: 'model-a' }), 'other', 'model-b'))
      .toBe('model-a');
  });

  it('ignores a stale selection that is not in the provider model list', () => {
    expect(pickConnectionTestModelId(withModels({ defaultModelId: 'model-a' }), 'test-provider', 'gone'))
      .toBe('model-a');
  });

  it('falls back to the first model when there is no usable default', () => {
    expect(pickConnectionTestModelId(withModels({ defaultModelId: 'gone' }), 'other', 'model-b'))
      .toBe('model-a');
  });

  it('returns an empty id when the provider has no models', () => {
    expect(pickConnectionTestModelId(makeConfig(), 'test-provider', 'model-b')).toBe('');
  });

  it('trusts a declared default when the model list is not known yet', () => {
    expect(pickConnectionTestModelId(makeConfig({ defaultModelId: 'model-z' }), 'test-provider', ''))
      .toBe('model-z');
  });
});
