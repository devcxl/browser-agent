import { describe, it, expect, vi } from 'vitest';
import { createPageGetSelectionTool } from '../page-get-selection';

describe('page_getSelection tool', () => {
  it('should return tool definition with correct metadata', () => {
    const executeFn = vi.fn();
    const tool = createPageGetSelectionTool(executeFn);

    expect(tool.name).toBe('page_getSelection');
    expect(tool.category).toBe('page');
    expect(tool.riskLevel).toBe('medium');
    expect(tool.confirmationRequired).toBe(false);
    expect(tool.requireContentScript).toBe(true);
    expect(tool.resultSensitivity).toBe('sensitive');
  });

  it('should execute the provided function', async () => {
    const executeFn = vi.fn().mockResolvedValue({
      success: true,
      data: { text: 'selected text' },
    });
    const tool = createPageGetSelectionTool(executeFn);

    const result = await tool.execute({ tabId: 1 });
    expect(result.data.text).toBe('selected text');
  });

  it('should not have preflight defined', () => {
    const executeFn = vi.fn();
    const tool = createPageGetSelectionTool(executeFn);
    expect(tool.preflight).toBeUndefined();
  });
});
