import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ProviderClientFactory,
  getProviderClientFactory,
  resetProviderClientFactory,
} from '../provider-client-factory';
import type { ProviderConfig, ChatCompletionRequest, StreamChunk } from '@/shared/types/llm';

/**
 * vi.hoisted 在 vi.mock 提升之前初始化：
 * 供各 @ai-sdk mock factory 引用 fake provider，供 provider-catalog mock 引用可变的目录数据。
 */
const h = vi.hoisted(() => {
  const fakeModel = {
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  };
  const fakeProvider = {
    chatModel: vi.fn(() => fakeModel),
  };
  const creators: Record<string, ReturnType<typeof vi.fn>> = {};
  function makeCreator(name: string) {
    const fn = vi.fn(() => fakeProvider);
    creators[name] = fn;
    return fn;
  }
  // 可变的目录数据 / factory 单例 holder，供 beforeEach 重置
  const state: { catalogData: Record<string, unknown>; factoryInstance: unknown } = {
    catalogData: {},
    factoryInstance: null,
  };
  return { fakeModel, fakeProvider, creators, makeCreator, state };
});

// mock 各 @ai-sdk 模块（provider-client-factory 内为动态 import）
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: h.makeCreator('openai') }));
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: h.makeCreator('openai-compatible'),
}));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: h.makeCreator('anthropic') }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: h.makeCreator('google') }));
vi.mock('@ai-sdk/cohere', () => ({ createCohere: h.makeCreator('cohere') }));

// mock ProviderCatalog：client-factory 只用到静态 getInstance().getCatalog()
vi.mock('../provider-catalog', () => ({
  ProviderCatalog: {
    getInstance: () => h.state.factoryInstance,
  },
}));

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'p1',
    name: 'P',
    apiKey: 'sk-test',
    isLocalTrusted: false,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest {
  return {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'hello' }],
    ...overrides,
  };
}

/** 由任意事件序列构造 AI SDK doStream 返回的 ReadableStream */
function makeStream(...events: unknown[]): ReadableStream {
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(e);
      controller.close();
    },
  });
}

describe('ProviderClientFactory', () => {
  beforeEach(() => {
    resetProviderClientFactory();
    // 默认 catalog 为空；每个用例可覆盖
    h.state.catalogData = {};
    h.state.factoryInstance = { getCatalog: vi.fn().mockImplementation(() => Promise.resolve(h.state.catalogData)) };
    h.fakeModel.doGenerate.mockReset();
    h.fakeModel.doStream.mockReset();
    h.fakeProvider.chatModel.mockClear();
    for (const fn of Object.values(h.creators)) fn.mockClear();
  });

  afterEach(() => {
    resetProviderClientFactory();
  });

  describe('getProviderClientFactory / reset', () => {
    it('单例：多次调用返回同一实例，reset 后重建', () => {
      const a = getProviderClientFactory();
      const b = getProviderClientFactory();
      expect(a).toBe(b);

      resetProviderClientFactory();
      const c = getProviderClientFactory();
      expect(c).not.toBe(a);
    });
  });

  describe('createClient().chat — 非流式', () => {
    it('文本响应：拼接 text parts、计算 usage、透传模型参数', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({
        content: [
          { type: 'text', text: 'Hel' },
          { type: 'text', text: 'lo' },
        ],
        response: { id: 'resp-1' },
        finishReason: { unified: 'stop' },
        usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } },
      });

      const client = await new ProviderClientFactory().createClient(
        makeConfig({ npm: '@ai-sdk/openai' }),
        'gpt-4o',
      );
      const result = await client.chat(
        makeRequest({ temperature: 0.7, max_tokens: 100 }),
      );

      expect(result.id).toBe('resp-1');
      expect(result.choices[0]?.message.content).toBe('Hello');
      expect(result.choices[0]?.finish_reason).toBe('stop');
      expect(result.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });

      // doGenerate 收到的 options
      const opts = h.fakeModel.doGenerate.mock.calls[0]![0];
      expect(opts.prompt).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      ]);
      expect(opts.tools).toBeUndefined();
      expect(opts.toolChoice).toBeUndefined();
      expect(opts.maxOutputTokens).toBe(100);
      expect(opts.temperature).toBe(0.7);
      expect(opts.reasoning).toBeUndefined();
    });

    it('assistant 空内容、空 tool_calls 响应 message.content 为 null', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({
        content: [],
        finishReason: { unified: 'stop' },
        usage: undefined,
        response: undefined,
      });

      const client = await new ProviderClientFactory().createClient(
        makeConfig(),
        'm',
      );
      const result = await client.chat(makeRequest());

      expect(result.id).toBe('');
      expect(result.choices[0]?.message.content).toBeNull();
      expect(result.choices[0]?.message.tool_calls).toBeUndefined();
      expect(result.choices[0]?.finish_reason).toBe('stop');
      expect(result.usage).toBeUndefined();
    });

    it('tool-call 响应：解析 input 为 JSON、finish_reason=tool_calls', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({
        content: [
          { type: 'text', text: '处理中' },
          {
            type: 'tool-call',
            toolCallId: 'tc1',
            toolName: 'tabs_query',
            input: { active: true },
          },
        ],
        finishReason: { unified: 'tool-calls' },
      });

      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      const result = await client.chat(makeRequest());

      const msg = result.choices[0]!.message;
      expect(msg.content).toBe('处理中');
      expect(msg.tool_calls).toEqual([
        {
          id: 'tc1',
          type: 'function',
          function: { name: 'tabs_query', arguments: '{"active":true}' },
        },
      ]);
      expect(result.choices[0]?.finish_reason).toBe('tool_calls');
    });

    it('messages 映射：system/user/tool JSON/assistant tool_calls，并过滤空消息', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        finishReason: { unified: 'stop' },
      });

      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      await client.chat({
        model: 'm',
        messages: [
          { role: 'system', content: 'sys-prompt' },
          // 以下两条应被过滤：system 空内容、assistant 无内容且无 tool_calls
          { role: 'system', content: null },
          { role: 'assistant', content: null },
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              { id: 'c1', type: 'function', function: { name: 'tabs_query', arguments: '{"a":1}' } },
            ],
          },
          { role: 'tool', content: '{"ok":true}', tool_call_id: 'c1', name: 'tabs_query' },
          { role: 'user', content: '继续' },
        ],
      });

      const prompt = h.fakeModel.doGenerate.mock.calls[0]![0].prompt;
      expect(prompt).toEqual([
        { role: 'system', content: 'sys-prompt' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'c1',
              toolName: 'tabs_query',
              input: { a: 1 },
            },
          ],
        },
        {
          role: 'tool',
          content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'tabs_query', output: { type: 'json', value: { ok: true } } }],
        },
        { role: 'user', content: [{ type: 'text', text: '继续' }] },
      ]);
    });

    it('tool 消息内容为非法 JSON 时保持字符串并按 text 输出', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        finishReason: { unified: 'stop' },
      });

      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      await client.chat({
        model: 'm',
        messages: [
          { role: 'tool', content: 'not json at all', tool_call_id: 'c1', name: 'tabs_query' },
        ],
      });

      const prompt = h.fakeModel.doGenerate.mock.calls[0]![0].prompt;
      expect(prompt).toEqual([
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'c1',
              toolName: 'tabs_query',
              output: { type: 'text', value: 'not json at all' },
            },
          ],
        },
      ]);
    });

    it('messages 映射：assistant tool_calls arguments 非法 JSON 时保留原字符串', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        finishReason: { unified: 'stop' },
      });

      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      await client.chat({
        model: 'm',
        messages: [
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              { id: 'c2', type: 'function', function: { name: 'tabs_query', arguments: 'oops-no-json' } },
            ],
          },
        ],
      });

      const prompt = h.fakeModel.doGenerate.mock.calls[0]![0].prompt;
      expect(prompt[0]).toEqual({
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'c2',
            toolName: 'tabs_query',
            input: 'oops-no-json',
          },
        ],
      });
    });

    it('messages 映射：assistant 同时带文本内容与 tool_calls 时两部分都保留', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        finishReason: { unified: 'stop' },
      });

      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      await client.chat({
        model: 'm',
        messages: [
          {
            role: 'assistant',
            content: '先查一下',
            tool_calls: [
              { id: 'c3', type: 'function', function: { name: 'tabs_query', arguments: '{"a":1}' } },
            ],
          },
        ],
      });

      const prompt = h.fakeModel.doGenerate.mock.calls[0]![0].prompt;
      expect(prompt[0]).toEqual({
        role: 'assistant',
        content: [
          { type: 'text', text: '先查一下' },
          { type: 'tool-call', toolCallId: 'c3', toolName: 'tabs_query', input: { a: 1 } },
        ],
      });
    });

    it('tools 映射为 AI SDK 格式并自动启用 toolChoice', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({
        content: [],
        finishReason: { unified: 'stop' },
      });

      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      await client.chat({
        model: 'm',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'tabs_query',
              description: '查询标签页',
              parameters: {
                type: 'object',
                properties: { active: { type: 'boolean' } },
              },
            },
          },
        ],
      });

      const opts = h.fakeModel.doGenerate.mock.calls[0]![0];
      expect(opts.tools).toEqual([
        {
          type: 'function',
          name: 'tabs_query',
          description: '查询标签页',
          inputSchema: { type: 'object', properties: { active: { type: 'boolean' } } },
        },
      ]);
      expect(opts.toolChoice).toEqual({ type: 'auto' });
    });

    it('reasoning_effort 映射：max→xhigh、none→undefined、low→low', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({ content: [], finishReason: { unified: 'stop' } });
      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');

      await client.chat(makeRequest({ reasoning_effort: 'max' }));
      expect(h.fakeModel.doGenerate.mock.calls[0]![0].reasoning).toBe('xhigh');

      await client.chat(makeRequest({ reasoning_effort: 'none' }));
      expect(h.fakeModel.doGenerate.mock.calls[1]![0].reasoning).toBeUndefined();

      await client.chat(makeRequest({ reasoning_effort: 'low' }));
      expect(h.fakeModel.doGenerate.mock.calls[2]![0].reasoning).toBe('low');
    });
  });

  describe('createClient().chatStream — 流式', () => {
    it('文本流：text-delta 逐段回调，finish=stop 结束', async () => {
      h.fakeModel.doStream.mockResolvedValue({
        stream: makeStream(
          { type: 'stream-start' },
          { type: 'text-start', id: 's1' },
          { type: 'text-delta', delta: 'Hel' },
          { type: 'text-delta', delta: 'lo' },
          { type: 'finish', finishReason: { unified: 'stop' } },
        ),
      });

      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      const chunks: StreamChunk[] = [];
      await client.chatStream(makeRequest(), (c) => chunks.push(c));

      expect(chunks).toHaveLength(3); // 两个 delta + 一个 finish
      expect(chunks[0]!.choices[0]?.delta.content).toBe('Hel');
      expect(chunks[1]!.choices[0]?.delta.content).toBe('lo');
      expect(chunks[2]!.choices[0]?.delta.content).toBeUndefined();
      expect(chunks[2]!.choices[0]?.finish_reason).toBe('stop');
    });

    it('推理流：reasoning-delta 交给 onReasoning，不产生 content chunk', async () => {
      h.fakeModel.doStream.mockResolvedValue({
        stream: makeStream(
          { type: 'reasoning-start', delta: 'think' },
          { type: 'reasoning-delta', delta: 'ing' },
          { type: 'finish', finishReason: { unified: 'stop' } },
        ),
      });

      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      const chunks: StreamChunk[] = [];
      const reasoning: string[] = [];
      await client.chatStream(makeRequest(), (c) => chunks.push(c), undefined, (r) => reasoning.push(r));

      expect(reasoning).toEqual(['think', 'ing']); // reasoning-start 与 reasoning-delta 均携带 delta
      expect(chunks).toHaveLength(1); // 仅 finish
    });

    it('工具流：累积 arguments，finish 时以 tool_calls delta 输出', async () => {
      h.fakeModel.doStream.mockResolvedValue({
        stream: makeStream(
          { type: 'text-start', id: 's2' },
          { type: 'tool-input-start', id: 'tc9', toolName: 'tabs_query' },
          { type: 'tool-input-delta', delta: '{"act' },
          { type: 'tool-input-delta', delta: 'ive":true}' },
          { type: 'finish', finishReason: { unified: 'tool-calls' } },
        ),
      });

      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      const chunks: StreamChunk[] = [];
      await client.chatStream(makeRequest(), (c) => chunks.push(c));

      // 工具流只在 finish 时产生一个 chunk（携带 tool_calls），finish_reason 固定 tool_calls
      expect(chunks).toHaveLength(1);
      const tc = chunks[0]!.choices[0]?.delta.tool_calls;
      expect(tc).toHaveLength(1);
      expect(tc![0]).toEqual({
        index: 0,
        id: 'tc9',
        type: 'function',
        function: { name: 'tabs_query', arguments: '{"active":true}' },
      });
      expect(chunks[0]!.choices[0]?.finish_reason).toBe('tool_calls');
    });

    it('finishReason length → finish_reason=length', async () => {
      h.fakeModel.doStream.mockResolvedValue({
        stream: makeStream({ type: 'finish', finishReason: { unified: 'length' } }),
      });

      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      const chunks: StreamChunk[] = [];
      await client.chatStream(makeRequest(), (c) => chunks.push(c));

      expect(chunks[0]!.choices[0]?.finish_reason).toBe('length');
    });

    it('流中 error 事件抛错', async () => {
      const boom = new Error('stream failed');
      h.fakeModel.doStream.mockResolvedValue({
        stream: makeStream({ type: 'error', error: boom }),
      });

      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      await expect(client.chatStream(makeRequest(), () => {})).rejects.toThrow('stream failed');
    });

    it('doStream 传入 tools 与 toolChoice', async () => {
      h.fakeModel.doStream.mockResolvedValue({
        stream: makeStream({ type: 'finish', finishReason: { unified: 'stop' } }),
      });

      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      await client.chatStream(makeRequest({ tools: [] }), () => {});

      // 空 tools 数组 → mapOpenAITools 返回 undefined → 不传 toolChoice
      const opts = h.fakeModel.doStream.mock.calls[0]![0];
      expect(opts.tools).toBeUndefined();
      expect(opts.toolChoice).toBeUndefined();
    });
  });

  describe('createClient().checkHealth / loadModel 模块选择', () => {
    it('checkHealth 恒为 true', async () => {
      const client = await new ProviderClientFactory().createClient(makeConfig(), 'm');
      await expect(client.checkHealth(makeConfig())).resolves.toBe(true);
    });

    it('npm 指定 openai-compatible（映射到同一模块）时创建对应 provider', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({ content: [], finishReason: { unified: 'stop' } });
      const factory = new ProviderClientFactory();
      const client = await factory.createClient(
        makeConfig({ npm: '@ai-sdk/openai-compatible', api: 'https://x.example.com/v1/', extraHeaders: { 'X-Extra': '1' } }),
        'm',
      );
      await client.chat(makeRequest());

      expect(h.creators['openai-compatible']).toHaveBeenCalledTimes(1);
      const args = h.creators['openai-compatible']!.mock.calls[0]![0];
      // baseURL 去除末尾斜杠
      expect(args.baseURL).toBe('https://x.example.com/v1');
      expect(args.headers).toEqual({
        Authorization: 'Bearer sk-test',
        'X-Extra': '1',
      });
      expect(args.includeUsage).toBe(true);
    });

    it('未知 npm 回退到 openai-compatible', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({ content: [], finishReason: { unified: 'stop' } });
      const client = await new ProviderClientFactory().createClient(
        makeConfig({ npm: '@ai-sdk/unknown-thing' }),
        'm',
      );
      await client.chat(makeRequest());

      expect(h.creators['openai-compatible']).toHaveBeenCalledTimes(1);
      expect(h.creators['openai']).not.toHaveBeenCalled();
    });

    it('无 npm 时从 catalog 的 providerInfo 取 npm，仍未命中则默认 openai-compatible', async () => {
      h.state.catalogData = {
        openai: { id: 'openai', name: 'OpenAI', npm: '@ai-sdk/openai', api: 'https://api.openai.com/v1', env: [], models: {} },
      };
      h.state.factoryInstance = { getCatalog: vi.fn().mockImplementation(() => Promise.resolve(h.state.catalogData)) };
      h.fakeModel.doGenerate.mockResolvedValue({ content: [], finishReason: { unified: 'stop' } });

      const client = await new ProviderClientFactory().createClient(
        makeConfig({ providerId: 'openai' }),
        'gpt-4o',
      );
      await client.chat(makeRequest());

      expect(h.creators['openai']).toHaveBeenCalledTimes(1);

      // providerId 无 npm 也未命中 catalog
      h.state.catalogData = {};
      h.fakeModel.doGenerate.mockResolvedValue({ content: [], finishReason: { unified: 'stop' } });
      const client2 = await new ProviderClientFactory().createClient(
        makeConfig({ providerId: 'nope' }),
        'm',
      );
      await client2.chat(makeRequest());

      expect(h.creators['openai-compatible']).toHaveBeenCalled();
    });

    it('不带 apiKey 时不发送 Authorization 头', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({ content: [], finishReason: { unified: 'stop' } });
      const client = await new ProviderClientFactory().createClient(
        makeConfig({ apiKey: '', api: 'https://x.example.com/v1' }),
        'm',
      );
      await client.chat(makeRequest());

      const args = h.creators['openai-compatible']!.mock.calls[0]![0];
      expect(args.headers).not.toHaveProperty('Authorization');
    });

    it.each([
      ['@ai-sdk/anthropic', 'anthropic'],
      ['@ai-sdk/google', 'google'],
      ['@ai-sdk/google-vertex', 'google'], // 映射到 google
      ['@ai-sdk/cohere', 'cohere'],
      ['@ai-sdk/mistral', 'openai-compatible'], // 映射到 openai-compatible
    ])('npm %s 创建 %s provider', async (npm, creatorKey) => {
      h.fakeModel.doGenerate.mockResolvedValue({ content: [], finishReason: { unified: 'stop' } });
      const client = await new ProviderClientFactory().createClient(
        makeConfig({ npm: npm as string, api: 'https://y.example.com/v1' }),
        'm',
      );
      await client.chat(makeRequest());

      expect(h.creators[creatorKey]).toHaveBeenCalledTimes(1);
      // 确认不会误调到其他 creator
      const called = Object.entries(h.creators).filter(([, fn]) => fn.mock.calls.length > 0).map(([k]) => k);
      expect(called).toEqual([creatorKey]);
    });

    it('anthropic/google/cohere provider 会传入 baseURL 与 apiKey', async () => {
      h.fakeModel.doGenerate.mockResolvedValue({ content: [], finishReason: { unified: 'stop' } });
      const client = await new ProviderClientFactory().createClient(
        makeConfig({ npm: '@ai-sdk/anthropic', api: 'https://api.anthropic.com/v1/' }),
        'm',
      );
      await client.chat(makeRequest());

      const args = h.creators['anthropic']!.mock.calls[0]![0];
      expect(args.baseURL).toBe('https://api.anthropic.com/v1');
      expect(args.apiKey).toBe('sk-test');
    });
  });

  describe('getModels', () => {
    it('providerConfig.models 存在时直接返回', async () => {
      const factory = new ProviderClientFactory();
      const models = {
        a: { id: 'a', name: 'A' },
        b: { id: 'b', name: 'B' },
      };
      const result = await factory.getModels(makeConfig({ models }) as ProviderConfig);
      expect(result).toHaveLength(2);
      expect(result.map((m) => m.id)).toEqual(['a', 'b']);
    });

    it('catalog 无对应 providerInfo 时返回空数组', async () => {
      h.state.catalogData = {};
      const factory = new ProviderClientFactory();
      const result = await factory.getModels(makeConfig({ providerId: 'missing' }) as ProviderConfig);
      expect(result).toEqual([]);
    });

    it('从 catalog providerInfo.models 取值', async () => {
      h.state.catalogData = {
        openai: {
          id: 'openai',
          name: 'OpenAI',
          npm: '@ai-sdk/openai',
          api: '',
          env: [],
          models: { 'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o' } },
        },
      };
      const factory = new ProviderClientFactory();
      const result = await factory.getModels(makeConfig({ providerId: 'openai' }) as ProviderConfig);
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('gpt-4o');
    });
  });
});
