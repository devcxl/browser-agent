import { describe, it, expect, vi } from 'vitest';
import { createPageSimulateClickTool } from '../page-simulate-click';

describe('page_simulateClick tool', () => {
  it('should return tool definition with correct metadata', () => {
    const executeFn = vi.fn();
    const tool = createPageSimulateClickTool(executeFn);

    expect(tool.name).toBe('page_simulateClick');
    expect(tool.category).toBe('page');
    expect(tool.riskLevel).toBe('high');
    expect(tool.confirmationRequired).toBe(true);
    expect(tool.requireContentScript).toBe(true);
    expect(tool.resultSensitivity).toBe('sensitive');
  });

  it('should execute with selector and passthrough tabId', async () => {
    const executeFn = vi.fn().mockResolvedValue({ success: true, data: { clicked: true } });
    const tool = createPageSimulateClickTool(executeFn);

    const result = await tool.execute({ tabId: 7, selector: '#myButton' });

    expect(executeFn).toHaveBeenCalledWith({
      tabId: 7,
      method: 'page.simulateClick',
      params: { tabId: 7, selector: '#myButton' },
    });
    expect(result).toEqual({ success: true, data: { clicked: true } });
  });

  it('should execute with xpath and text params', async () => {
    const executeFn = vi.fn().mockResolvedValue({ success: true });
    const tool = createPageSimulateClickTool(executeFn);

    await tool.execute({ xpath: '//button[contains(text(), "提交")]', text: '提交' });

    expect(executeFn).toHaveBeenCalledWith({
      tabId: undefined,
      method: 'page.simulateClick',
      params: { tabId: undefined, xpath: '//button[contains(text(), "提交")]', text: '提交' },
    });
  });
});
