import { describe, it, expect, vi } from 'vitest';
import type { ToolDefinition, ToolResult } from '@/shared/types';
import { createPageTools } from '../index';

function createMockExecute(): (params: Record<string, unknown>) => Promise<ToolResult> {
  return vi.fn().mockResolvedValue({ success: true, data: { result: 'ok' } });
}

function getTool(name: string, executeFn: (params: Record<string, unknown>) => Promise<ToolResult>): ToolDefinition {
  return createPageTools(executeFn).find((t) => t.name === name)!;
}

describe('page_eval', () => {
  it('注册于 page 类工具集中', () => {
    const tools = createPageTools(createMockExecute());
    expect(tools.find((t) => t.name === 'page_eval')).toBeDefined();
  });

  it('透传 code 到 content.execute', async () => {
    const executeFn = createMockExecute();
    const tool = getTool('page_eval', executeFn);

    await tool.execute({ code: 'document.title', tabId: 7 });

    expect(executeFn).toHaveBeenCalledWith({
      tabId: 7,
      method: 'page.eval',
      params: { code: 'document.title' },
    });
  });

  it('元数据：page 类、高风险需确认、敏感结果、需要内容脚本', () => {
    const tool = getTool('page_eval', createMockExecute());
    expect(tool.category).toBe('page');
    expect(tool.riskLevel).toBe('high');
    expect(tool.confirmationRequired).toBe(true);
    expect(tool.resultSensitivity).toBe('sensitive');
    expect(tool.requireContentScript).toBe(true);
  });

  it('preflight 警告任意代码执行', async () => {
    const tool = getTool('page_eval', createMockExecute());
    const result = await tool.preflight!({ code: 'document.title' });

    expect(result.affectedObjects[0]?.reason).toContain('JS 代码');
    expect(result.warnings[0]).toContain('任意 JS 代码');
  });
});
