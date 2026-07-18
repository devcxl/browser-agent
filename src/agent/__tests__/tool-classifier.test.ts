import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { ToolClassifier } from '../tool-classifier';

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

describe('ToolClassifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('解析正常文本中的工具类别', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '["tabs", "windows"]',
      reasoningText: undefined,
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await new ToolClassifier().classify('整理标签页和窗口', {} as never);

    expect(result).toEqual(['tabs', 'windows']);
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      maxOutputTokens: 512,
      reasoning: 'none',
    }));
  });

  it('正常文本为空时从 reasoningText 提取工具类别', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '',
      reasoningText: '先考虑 ["windows"]，最终应输出 ["tabs"]',
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(new ToolClassifier().classify('关闭重复标签页', {} as never)).resolves.toEqual(['tabs']);
  });

  it('推理输出被截断时不使用其中的不完整分类', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '',
      reasoningText: '可能需要 ["tabs"]，继续分析',
      finishReason: 'length',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(new ToolClassifier().classify('整理一下', {} as never)).resolves.toEqual([]);
  });

  it('过滤模型返回的未知类别', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '["tabs", "unknown"]',
      reasoningText: undefined,
      finishReason: 'stop',
      usage: {},
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(new ToolClassifier().classify('查询标签页', {} as never)).resolves.toEqual(['tabs']);
  });
});
