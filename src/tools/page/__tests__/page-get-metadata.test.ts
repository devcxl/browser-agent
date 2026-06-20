import { describe, it, expect, vi } from 'vitest';
import { createPageGetMetadataTool } from '../page-get-metadata';

describe('page_getMetadata tool', () => {
  it('should return tool definition with correct metadata', () => {
    const executeFn = vi.fn();
    const tool = createPageGetMetadataTool(executeFn);

    expect(tool.name).toBe('page_getMetadata');
    expect(tool.category).toBe('page');
    expect(tool.riskLevel).toBe('low');
    expect(tool.confirmationRequired).toBe(false);
    expect(tool.requireContentScript).toBe(true);
    expect(tool.resultSensitivity).toBe('low');
  });

  it('should execute the provided function', async () => {
    const executeFn = vi.fn().mockResolvedValue({
      success: true,
      data: { title: 'Page Title', url: 'https://example.com' },
    });
    const tool = createPageGetMetadataTool(executeFn);

    const result = await tool.execute({ tabId: 1 });
    expect(result.data.title).toBe('Page Title');
  });

  it('should not have preflight defined', () => {
    const executeFn = vi.fn();
    const tool = createPageGetMetadataTool(executeFn);
    expect(tool.preflight).toBeUndefined();
  });
});
