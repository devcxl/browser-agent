import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentBridge } from '../content-bridge';

describe('ContentBridge', () => {
  beforeEach(() => {
    (globalThis as any).browser = {
      tabs: {
        sendMessage: vi.fn(),
      },
    };
  });

  it('should send JSON-RPC message to content script', async () => {
    (browser.tabs.sendMessage as any).mockResolvedValue({
      jsonrpc: '2.0',
      result: { text: 'page content' },
    });

    const bridge = new ContentBridge();
    const result = await bridge.sendToContent(1, 'page.getContent', { selector: 'body' });

    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, {
      jsonrpc: '2.0',
      method: 'page.getContent',
      params: { selector: 'body' },
    });
    expect(result).toEqual({ text: 'page content' });
  });

  it('should throw when content script returns error', async () => {
    (browser.tabs.sendMessage as any).mockResolvedValue({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Execution failed' },
    });

    const bridge = new ContentBridge();

    await expect(bridge.sendToContent(1, 'page.getContent')).rejects.toThrow('Execution failed');
  });

  it('should return undefined when content script returns no response', async () => {
    (browser.tabs.sendMessage as any).mockResolvedValue(undefined);

    const bridge = new ContentBridge();
    const result = await bridge.sendToContent(1, 'page.getContent');

    expect(result).toBeUndefined();
  });

  it('should return result when content script returns result only', async () => {
    (browser.tabs.sendMessage as any).mockResolvedValue({
      result: 42,
    });

    const bridge = new ContentBridge();
    const result = await bridge.sendToContent(1, 'page.getCount');

    expect(result).toBe(42);
  });
});
