import type { ToolDefinition, ToolResult } from '../../shared/types';

/**
 * page_scroll：滚动页面。
 * 懒加载/无限流页面需要滚动触发加载；截图、找元素前也常需要先滚动。
 */
export function createPageScrollTool(
  executeFn: (params: Record<string, unknown>) => Promise<ToolResult>,
): ToolDefinition {
  return {
    name: 'page_scroll',
    description:
      '滚动页面。三种用法：① 提供 targetSelector 把指定元素滚到视口中央；② direction: top/bottom 直达页顶/页底；③ direction: up/down 按 amount（像素）或 pages（屏数）滚动，缺省向下滚一屏。懒加载页面需多次滚动触发内容加载。',
    schema: {
      type: 'object',
      properties: {
        targetSelector: { type: 'string', description: '目标元素 CSS 选择器，把该元素滚到视口中央' },
        direction: {
          type: 'string',
          enum: ['up', 'down', 'top', 'bottom'],
          description: '滚动方向，缺省 down',
        },
        amount: { type: 'number', description: '滚动像素数（up/down 时生效，优先于 pages）' },
        pages: { type: 'number', description: '滚动屏数（up/down 时生效，1 屏 = 视口高度）' },
        tabId: { type: 'number', description: '目标标签页 ID，缺省为当前标签页' },
      },
    },
    category: 'page',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    requireContentScript: true,
    execute: (params) => executeFn({
      tabId: params.tabId,
      method: 'page.scroll',
      params: {
        direction: params.direction,
        amount: params.amount,
        pages: params.pages,
        targetSelector: params.targetSelector,
      },
    }),
  };
}
