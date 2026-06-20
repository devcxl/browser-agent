import { describe, it, expect, vi } from 'vitest';
import { createPageGetMarkdownTool } from '../page-get-markdown';

describe('page_getMarkdown tool', () => {
  it('should return tool definition with correct metadata', () => {
    const executeFn = vi.fn();
    const tool = createPageGetMarkdownTool(executeFn);

    expect(tool.name).toBe('page_getMarkdown');
    expect(tool.category).toBe('page');
    expect(tool.riskLevel).toBe('high');
    expect(tool.confirmationRequired).toBe(true);
    expect(tool.requireContentScript).toBe(true);
    expect(tool.resultSensitivity).toBe('sensitive');
  });

  it('should execute the provided function with correct params', async () => {
    const executeFn = vi.fn().mockResolvedValue({ success: true, data: '# markdown' });
    const tool = createPageGetMarkdownTool(executeFn);

    const result = await tool.execute({ tabId: 1 });
    expect(executeFn).toHaveBeenCalledWith({
      tabId: 1,
      method: 'page.getMarkdown',
      params: {},
    });
    expect(result).toEqual({ success: true, data: '# markdown' });
  });

  it('should return preflight info with affected objects', async () => {
    const executeFn = vi.fn();
    const tool = createPageGetMarkdownTool(executeFn);

    const preflight = await tool.preflight!({ tabId: 42 });
    expect(preflight.affectedObjects).toHaveLength(1);
    expect(preflight.affectedObjects[0].type).toBe('page');
    expect(preflight.affectedObjects[0].id).toBe('42');
    expect(preflight.warnings).toContain('页面内容可能包含敏感信息');
  });

  it('should use "current" for missing tabId in preflight', async () => {
    const executeFn = vi.fn();
    const tool = createPageGetMarkdownTool(executeFn);

    const preflight = await tool.preflight!({});
    expect(preflight.affectedObjects[0].id).toBe('current');
  });
});
