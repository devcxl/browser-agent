import { describe, it, expect, vi } from 'vitest';
import type { ToolDefinition, ToolResult } from '@/shared/types';
import { createPageTools } from '../index';

function createMockExecute(): (params: Record<string, unknown>) => Promise<ToolResult> {
  return vi.fn().mockResolvedValue({ success: true, data: { scrollY: 800 } });
}

function getTool(name: string, executeFn: (params: Record<string, unknown>) => Promise<ToolResult>): ToolDefinition {
  return createPageTools(executeFn).find((t) => t.name === name)!;
}

describe('page_scroll', () => {
  it('注册于 page 类工具集中', () => {
    const tools = createPageTools(createMockExecute());
    expect(tools.find((t) => t.name === 'page_scroll')).toBeDefined();
  });

  it('透传滚动参数到 content.execute', async () => {
    const executeFn = createMockExecute();
    const tool = getTool('page_scroll', executeFn);

    await tool.execute({ direction: 'down', pages: 2, tabId: 7 });

    expect(executeFn).toHaveBeenCalledWith({
      tabId: 7,
      method: 'page.scroll',
      params: { direction: 'down', amount: undefined, pages: 2, targetSelector: undefined },
    });
  });

  it('targetSelector 透传', async () => {
    const executeFn = createMockExecute();
    const tool = getTool('page_scroll', executeFn);

    await tool.execute({ targetSelector: '#footer' });

    expect(executeFn).toHaveBeenCalledWith({
      tabId: undefined,
      method: 'page.scroll',
      params: { direction: undefined, amount: undefined, pages: undefined, targetSelector: '#footer' },
    });
  });

  it('元数据：page 类、低风险、免确认、需要内容脚本', () => {
    const tool = getTool('page_scroll', createMockExecute());
    expect(tool.category).toBe('page');
    expect(tool.riskLevel).toBe('low');
    expect(tool.confirmationRequired).toBe(false);
    expect(tool.requireContentScript).toBe(true);
  });
});
