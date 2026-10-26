/**
 * 页面滚动：供 page_scroll 工具通过 content.execute 调用。
 *
 * 三种定位方式（targetSelector 优先）：
 * - targetSelector：把匹配元素滚到视口中央；
 * - direction top/bottom：直达页顶/页底；
 * - direction up/down：按 amount（像素）或 pages（屏数）滚动，缺省一屏。
 */

export interface ScrollParams {
  direction?: 'up' | 'down' | 'top' | 'bottom';
  /** 滚动像素数（up/down 时生效） */
  amount?: number;
  /** 滚动屏数（up/down 时生效，1 屏 = 视口高度） */
  pages?: number;
  /** 目标元素选择器：把该元素滚到视口中央 */
  targetSelector?: string;
}

export interface ScrollResult {
  success: boolean;
  error?: string;
  /** 滚动后的位置信息，供模型判断是否到达目标 */
  scrollY?: number;
  totalHeight?: number;
  viewportHeight?: number;
}

function positionSnapshot(): Pick<ScrollResult, 'scrollY' | 'totalHeight' | 'viewportHeight'> {
  const doc = document.documentElement;
  return {
    scrollY: Math.round(window.scrollY),
    totalHeight: doc.scrollHeight,
    viewportHeight: window.innerHeight,
  };
}

export function scrollPage(params: ScrollParams): ScrollResult {
  const { direction = 'down', amount, pages, targetSelector } = params ?? {};

  // 1. 定位元素：滚到视口中央（与点击前定位行为一致）
  if (targetSelector) {
    const el = document.querySelector(targetSelector);
    if (!el) {
      return { success: false, error: `未找到元素: "${targetSelector}"` };
    }
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    return { success: true, ...positionSnapshot() };
  }

  // 2. 直达页顶 / 页底
  if (direction === 'top' || direction === 'bottom') {
    window.scrollTo({ top: direction === 'top' ? 0 : document.documentElement.scrollHeight, behavior: 'instant' });
    return { success: true, ...positionSnapshot() };
  }

  // 3. 按距离滚动：amount 优先，其次 pages，缺省一屏
  let delta = window.innerHeight;
  if (typeof amount === 'number' && amount > 0) {
    delta = amount;
  } else if (typeof pages === 'number' && pages > 0) {
    delta = window.innerHeight * pages;
  }
  window.scrollBy({ top: direction === 'up' ? -delta : delta, behavior: 'instant' });
  return { success: true, ...positionSnapshot() };
}
