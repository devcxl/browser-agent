import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { ToolClassifier } from '../tool-classifier';
import { JEV_MODEL, type JevDecision } from '../jev-api-client';
import { TOOL_CATEGORY_DESCRIPTIONS } from '@/shared/tool-categories';
import type { ToolCategory } from '@/shared/types/tool';

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

function createJevDecision(overrides: Partial<Record<ToolCategory, number>>): JevDecision {
  return {
    model: JEV_MODEL,
    probabilities: Object.fromEntries(
      Object.keys(TOOL_CATEGORY_DESCRIPTIONS).map((category) => [
        category,
        overrides[category as ToolCategory] ?? 0.01,
      ]),
    ) as Record<ToolCategory, number>,
  };
}

describe('ToolClassifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('解析正常文本中的工具类别（本地规则未命中时走 LLM）', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '["tabs", "windows"]',
      reasoningText: undefined,
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await new ToolClassifier().classify('帮我做点事情', {} as never);

    expect(result).toEqual(['tabs', 'windows']);
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      maxOutputTokens: 512,
      reasoning: 'none',
    }));
  });

  it('分类诊断日志不记录用户消息或模型响应正文', async () => {
    const userMessage = 'private-user-message-7e98';
    const modelResponse = 'private-model-response-a241 ["history"]';
    vi.mocked(generateText).mockResolvedValue({
      text: modelResponse,
      reasoningText: undefined,
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    try {
      await new ToolClassifier().classify(userMessage, {} as never);

      const diagnosticLog = debugSpy.mock.calls.flat().join(' ');
      expect(diagnosticLog).not.toContain(userMessage);
      expect(diagnosticLog).not.toContain('private-model-response-a241');
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('正常文本为空时从 reasoningText 提取工具类别', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '',
      reasoningText: '先考虑 ["windows"]，最终应输出 ["tabs"]',
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(new ToolClassifier().classify('帮我做点事情', {} as never)).resolves.toEqual(['tabs']);
  });

  it('文本与推理均为空时返回空数组', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '',
      reasoningText: undefined,
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(new ToolClassifier().classify('帮我做点事情', {} as never)).resolves.toEqual([]);
  });

  it('正文含空白字符且推理含类别时从推理提取', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '   ',
      reasoningText: '可用 ["page"]',
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(new ToolClassifier().classify('帮我做点事情', {} as never)).resolves.toEqual(['page']);
  });

  it('正文已有有效类别时不混入推理内容', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '["tabs"]',
      reasoningText: '也可以考虑 ["windows"]',
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(new ToolClassifier().classify('帮我做点事情', {} as never)).resolves.toEqual(['tabs']);
  });

  it('输出被截断但正文已含有效类别时仍返回正文类别', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '["tabs"]',
      reasoningText: '继续分析其他类别',
      finishReason: 'length',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(new ToolClassifier().classify('帮我做点事情', {} as never)).resolves.toEqual(['tabs']);
  });

  it('推理输出被截断时不使用其中的不完整分类', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '',
      reasoningText: '可能需要 ["tabs"]，继续分析',
      finishReason: 'length',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(new ToolClassifier().classify('帮我做点事情', {} as never)).resolves.toEqual([]);
  });

  it('过滤模型返回的未知类别', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '["tabs", "unknown"]',
      reasoningText: undefined,
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(new ToolClassifier().classify('帮我做点事情', {} as never)).resolves.toEqual(['tabs']);
  });

  it('本地规则命中时跳过 LLM 调用', async () => {
    const result = await new ToolClassifier().classify('查询标签页', {} as never);

    expect(result).toEqual(['tabs']);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('本地规则可命中多个类别', async () => {
    const result = await new ToolClassifier().classify('整理标签页和窗口', {} as never);

    expect(result).toEqual(['tabs', 'windows']);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('同一消息的分类结果在缓存中复用', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '["tabs"]',
      reasoningText: undefined,
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    const classifier = new ToolClassifier();
    await classifier.classify('帮我做点事情', {} as never);
    await classifier.classify('帮我做点事情', {} as never);

    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('LLM 抛错时降级返回空数组', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('provider down'));

    await expect(new ToolClassifier().classify('帮我做点事情', {} as never)).resolves.toEqual([]);
  });

  it('LLM 输出为非法 JSON 数组片段时返回空数组（parse 失败降级）', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '[tabs, windows]', // 非 JSON，parse 全部失败
      reasoningText: undefined,
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(new ToolClassifier().classify('帮我做点事情', {} as never)).resolves.toEqual([]);
  });

  it('多个数组片段时优先取最后一个合法 JSON 数组', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '可能用 ["tabs"]，先看看，最终 ["windows","page"]',
      reasoningText: undefined,
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(new ToolClassifier().classify('帮我做点事情', {} as never)).resolves.toEqual(['windows', 'page']);
  });

  it('Jev 启用时在关键词未命中后按唯一高置信类别分类', async () => {
    const jevClient = {
      classify: vi.fn().mockResolvedValue(createJevDecision({ history: 0.96 })),
    };
    const controller = new AbortController();
    const classifier = new ToolClassifier(jevClient);

    const result = await classifier.classify('Review my recent activity.', {} as never, {
      jevSettings: { enabled: true, apiKey: 'ts-secret' },
      abortSignal: controller.signal,
    });

    expect(result).toEqual(['history']);
    expect(jevClient.classify).toHaveBeenCalledWith(
      'Review my recent activity.',
      'ts-secret',
      controller.signal,
    );
    expect(generateText).not.toHaveBeenCalled();
  });

  it('本地关键词命中优先于 Jev', async () => {
    const jevClient = { classify: vi.fn() };
    const classifier = new ToolClassifier(jevClient);

    await expect(classifier.classify('查询标签页', {} as never, {
      jevSettings: { enabled: true, apiKey: 'ts-secret' },
    })).resolves.toEqual(['tabs']);

    expect(jevClient.classify).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it('将 0.80 视为肯定、0.20 视为否定', async () => {
    const jevClient = {
      classify: vi.fn().mockResolvedValue(createJevDecision({ history: 0.8, bookmarks: 0.2 })),
    };

    await expect(new ToolClassifier(jevClient).classify('Review my recent activity.', {} as never, {
      jevSettings: { enabled: true, apiKey: 'ts-secret' },
    })).resolves.toEqual(['history']);
  });

  it('Jev 结果不确定时返回空分类且不回退到生成式分类', async () => {
    const jevClient = {
      classify: vi.fn().mockResolvedValue(createJevDecision({ history: 0.96, bookmarks: 0.5 })),
    };
    const classifier = new ToolClassifier(jevClient);

    await expect(classifier.classify('Review my recent activity.', {} as never, {
      jevSettings: { enabled: true, apiKey: 'ts-secret' },
    })).resolves.toEqual([]);

    expect(generateText).not.toHaveBeenCalled();
  });

  it('多个肯定类别同时启用对应工具', async () => {
    const jevClient = {
      classify: vi.fn().mockResolvedValue(createJevDecision({ history: 0.96, bookmarks: 0.91 })),
    };
    const classifier = new ToolClassifier(jevClient);

    await expect(classifier.classify('Review my recent activity.', {} as never, {
      jevSettings: { enabled: true, apiKey: 'ts-secret' },
    })).resolves.toEqual(['bookmarks', 'history']);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('Jev 请求失败时不转发给生成式分类器', async () => {
    const jevClient = { classify: vi.fn().mockRejectedValue(new Error('network failure')) };
    const classifier = new ToolClassifier(jevClient);

    await expect(classifier.classify('Review my recent activity.', {} as never, {
      jevSettings: { enabled: true, apiKey: 'ts-secret' },
    })).resolves.toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('reset() 清除缓存后重新走 LLM', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '["tabs"]',
      reasoningText: undefined,
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    const classifier = new ToolClassifier();
    await classifier.classify('帮我做点事情', {} as never);
    classifier.reset();
    await classifier.classify('帮我做点事情', {} as never);

    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('缓存超过 100 条时按 FIFO 淘汰最旧条目', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '["tabs"]',
      reasoningText: undefined,
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    const classifier = new ToolClassifier();
    // 用本地规则未命中的消息灌满缓存并溢出 1 条，触发 FIFO 淘汰（避免本地规则短路 LLM）
    for (let index = 0; index < 101; index++) {
      await classifier.classify(`一次性消息-${index}`, {} as never);
    }
    expect(generateText).toHaveBeenCalledTimes(101);

    // 最早插入的消息-0 已被淘汰，再次请求应触发 LLM 而非命中缓存
    await classifier.classify('一次性消息-0', {} as never);
    expect(generateText).toHaveBeenCalledTimes(102);
  });
});
