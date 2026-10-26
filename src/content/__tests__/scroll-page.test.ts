import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scrollPage } from '../scroll-page';

describe('scrollPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockViewport(scrollY: number, innerHeight: number, totalHeight: number) {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(scrollY);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(innerHeight);
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: totalHeight,
    });
  }

  it('targetSelector 优先：把元素滚到视口中央', () => {
    document.body.innerHTML = '<div id="target">内容</div>';
    mockViewport(500, 800, 4000);

    const result = scrollPage({ targetSelector: '#target' });

    expect(result.success).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'center',
    });
    expect(result.scrollY).toBe(500);
    expect(result.totalHeight).toBe(4000);
    expect(result.viewportHeight).toBe(800);
  });

  it('targetSelector 未命中时返回失败', () => {
    const result = scrollPage({ targetSelector: '#missing' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('#missing');
  });

  it('top/bottom 直达页顶/页底', () => {
    mockViewport(0, 800, 4000);
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);

    scrollPage({ direction: 'top' });
    expect(scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 0, behavior: 'instant' }),
    );

    scrollPage({ direction: 'bottom' });
    expect(scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 4000, behavior: 'instant' }),
    );

    vi.unstubAllGlobals();
  });

  it('缺省向下滚动一屏（视口高度）', () => {
    mockViewport(0, 800, 4000);
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);

    const result = scrollPage({});

    expect(scrollBy).toHaveBeenCalledWith({ top: 800, behavior: 'instant' });
    expect(result.success).toBe(true);
    vi.unstubAllGlobals();
  });

  it('amount 优先于 pages', () => {
    mockViewport(0, 800, 4000);
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);

    scrollPage({ direction: 'down', amount: 300, pages: 2 });
    expect(scrollBy).toHaveBeenCalledWith({ top: 300, behavior: 'instant' });

    scrollPage({ direction: 'down', pages: 2 });
    expect(scrollBy).toHaveBeenLastCalledWith({ top: 1600, behavior: 'instant' });

    vi.unstubAllGlobals();
  });

  it('向上滚动为负位移', () => {
    mockViewport(1600, 800, 4000);
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);

    scrollPage({ direction: 'up', pages: 1 });

    expect(scrollBy).toHaveBeenCalledWith({ top: -800, behavior: 'instant' });
    vi.unstubAllGlobals();
  });
});
