import { describe, it, expect, vi } from 'vitest';
import { createPageGetContentTool } from '../page-get-content';
import type { ToolResult } from '@/shared/types';

describe('page_getContent tool', () => {
  it('should return tool definition with correct metadata', () => {
    const executeFn = vi.fn();
    const tool = createPageGetContentTool(executeFn);

    expect(tool.name).toBe('page_getContent');
    expect(tool.category).toBe('page');
    expect(tool.riskLevel).toBe('high');
    expect(tool.confirmationRequired).toBe(true);
    expect(tool.requireContentScript).toBe(true);
    expect(tool.resultSensitivity).toBe('sensitive');
  });

  it('should execute the provided function', async () => {
    const executeFn = vi.fn().mockResolvedValue({ success: true, data: 'content' });
    const tool = createPageGetContentTool(executeFn);

    const result = await tool.execute({ tabId: 1 });
    expect(executeFn).toHaveBeenCalledWith({
      tabId: 1,
      method: 'page.getContent',
      params: {},
    });
    expect(result).toEqual({ success: true, data: 'content' });
  });

  it('should return preflight info with affected objects', async () => {
    const executeFn = vi.fn();
    const tool = createPageGetContentTool(executeFn);

    const preflight = await tool.preflight!({ tabId: 42 });
    expect(preflight.affectedObjects).toHaveLength(1);
    expect(preflight.affectedObjects[0].type).toBe('page');
    expect(preflight.affectedObjects[0].id).toBe('42');
    expect(preflight.warnings).toContain('页面内容可能包含敏感信息');
  });

  it('should use "current" for missing tabId in preflight', async () => {
    const executeFn = vi.fn();
    const tool = createPageGetContentTool(executeFn);

    const preflight = await tool.preflight!({});
    expect(preflight.affectedObjects[0].id).toBe('current');
  });
});
