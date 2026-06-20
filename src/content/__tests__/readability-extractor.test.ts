import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock @mozilla/readability 模块
const mockParse = vi.fn();
vi.mock('@mozilla/readability', () => ({
  Readability: vi.fn().mockImplementation(() => ({
    parse: mockParse,
  })),
}));

// 动态导入被测试模块（因为依赖 mock 先建立）
const { ReadabilityExtractor } = await import('../readability-extractor');

describe('ReadabilityExtractor', () => {
  let extractor: InstanceType<typeof ReadabilityExtractor>;

  beforeEach(() => {
    extractor = new ReadabilityExtractor();
    mockParse.mockReset();

    // 设置 document 基本内容
    document.title = 'Test Page Title';
    document.body.innerHTML = '<p>Some body text for extraction fallback.</p>';
  });

  it('should return PageContent when Readability parses successfully', async () => {
    mockParse.mockReturnValue({
      title: 'Extracted Article',
      textContent: 'Full article text content here. It contains the readable text.',
      excerpt: 'A short excerpt of the article.',
      byline: 'John Doe',
      siteName: 'Example Site',
    });

    const result = await extractor.extract();

    expect(result).toEqual({
      title: 'Extracted Article',
      textContent: 'Full article text content here. It contains the readable text.',
      excerpt: 'A short excerpt of the article.',
      byline: 'John Doe',
      siteName: 'Example Site',
    });
  });

  it('should return fallback page info when Readability.parse returns null', async () => {
    mockParse.mockReturnValue(null);

    const result = await extractor.extract();

    expect(result.title).toBe('Test Page Title');
    expect(result.byline).toBeNull();
    expect(result.siteName).toBeNull();
    expect(result.textContent).toContain('Some body text');
  });

  it('should reject when Readability constructor throws', async () => {
    // 模拟 Readability 构造函数抛异常
    const ReadabilityMock = (await import('@mozilla/readability')).Readability as any;
    ReadabilityMock.mockImplementationOnce(() => {
      throw new Error('DOM parsing failed');
    });

    await expect(extractor.extract()).rejects.toThrow('DOM parsing failed');
  });
});
