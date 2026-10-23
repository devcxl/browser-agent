import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOOL_CATEGORY_DESCRIPTIONS } from '@/shared/tool-categories';
import type { ToolCategory } from '@/shared/types/tool';
import {
  JEV_API_ENDPOINT,
  JEV_MODEL,
  JEV_REQUEST_TIMEOUT_MS,
  JevApiClient,
} from '../jev-api-client';

const categories = Object.keys(TOOL_CATEGORY_DESCRIPTIONS) as ToolCategory[];

function createValidResponse(overrides: Partial<Record<ToolCategory, number>> = {}, model = JEV_MODEL) {
  return {
    model,
    answers: Object.fromEntries(categories.map((category) => [category, {
      type: 'noul',
      noul: overrides[category] ?? 0.01,
    }])),
    usage: { input_tokens: 20, output_tokens: 10 },
  };
}

function createJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('JevApiClient', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('posts the minimum state with a pinned model and bounded category questions', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse(createValidResponse()));
    const client = new JevApiClient(fetchMock);

    const result = await client.classify('Please inspect my recent activity.', 'ts-secret');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(JEV_API_ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ts-secret');
    expect(init?.redirect).toBe('error');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: JEV_MODEL, state: 'Please inspect my recent activity.' });
    expect(Object.keys(body.questions).sort()).toEqual([...categories].sort());
    for (const category of categories) {
      expect(body.questions[category]).toMatchObject({
        type: 'noul',
        instructions: expect.any(String),
        criteria: { true: TOOL_CATEGORY_DESCRIPTIONS[category], false: expect.any(String) },
      });
    }
    expect(result.model).toBe(JEV_MODEL);
    expect(result.probabilities.history).toBe(0.01);
  });

  it('binds the default browser fetch to the global receiver', async () => {
    let fetchReceiver: unknown;
    const fetchMock = vi.fn(function (this: unknown) {
      fetchReceiver = this;
      return Promise.resolve(createJsonResponse(createValidResponse()));
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    await new JevApiClient().classify('Check my history.', 'ts-secret');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchReceiver).toBe(globalThis);
  });

  it('does not write the user message or API key to diagnostics', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse(createValidResponse()));
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const userMessage = 'private-user-message-49ad';
    const apiKey = 'ts-private-key-138e';

    try {
      await new JevApiClient(fetchMock).classify(userMessage, apiKey);

      const diagnosticLog = debugSpy.mock.calls.flat().join(' ');
      expect(diagnosticLog).not.toContain(userMessage);
      expect(diagnosticLog).not.toContain(apiKey);
    } finally {
      debugSpy.mockRestore();
    }
  });

  it.each([
    ['wrong model version', createValidResponse({}, 'jev-latest')],
    ['missing category answer', { ...createValidResponse(), answers: {} }],
    ['unknown category answer', {
      ...createValidResponse(),
      answers: { ...createValidResponse().answers, unknown: { type: 'noul', noul: 1 } },
    }],
    ['wrong answer type', {
      ...createValidResponse(),
      answers: { ...createValidResponse().answers, history: { type: 'choice', choice: 'history' } },
    }],
    ['non-probability value', {
      ...createValidResponse(),
      answers: { ...createValidResponse().answers, history: { type: 'noul', noul: 1.1 } },
    }],
  ])('rejects %s responses', async (_label, responseBody) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse(responseBody));
    const client = new JevApiClient(fetchMock);

    await expect(client.classify('Check my history.', 'ts-secret')).rejects.toMatchObject({
      reason: 'invalid_response',
    });
  });

  it('does not retry a rate-limited request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse({}, 429));
    const client = new JevApiClient(fetchMock);

    await expect(client.classify('Check my history.', 'ts-secret')).rejects.toMatchObject({ reason: 'http' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts the request when the caller cancels', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const client = new JevApiClient(fetchMock);
    const controller = new AbortController();
    const request = client.classify('Check my history.', 'ts-secret', controller.signal);
    controller.abort();

    await expect(request).rejects.toMatchObject({ reason: 'cancelled' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts the request at the fixed timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const client = new JevApiClient(fetchMock);
    const request = client.classify('Check my history.', 'ts-secret');
    const rejection = expect(request).rejects.toMatchObject({ reason: 'timeout' });

    await vi.advanceTimersByTimeAsync(JEV_REQUEST_TIMEOUT_MS);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
