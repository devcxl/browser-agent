import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentBridge } from '../content-bridge';

function createMockPort() {
  const messageListeners: Array<(msg: unknown) => void> = [];
  const disconnectListeners: Array<() => void> = [];
  return {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: {
      addListener: vi.fn((fn: (msg: unknown) => void) => messageListeners.push(fn)),
      removeListener: vi.fn(),
    },
    onDisconnect: {
      addListener: vi.fn((fn: () => void) => disconnectListeners.push(fn)),
      removeListener: vi.fn(),
    },
    _messageListeners: messageListeners,
    _disconnectListeners: disconnectListeners,
  };
}

describe('ContentBridge (Port mode)', () => {
  let mockPort: ReturnType<typeof createMockPort>;

  beforeEach(() => {
    mockPort = createMockPort();
    (globalThis as any).browser = {
      tabs: {
        connect: vi.fn().mockReturnValue(mockPort),
      },
    };
  });

  it('should connect to content script via tabs.connect', async () => {
    const bridge = new ContentBridge();

    const promise = bridge.sendToContent(1, 'page.getContent', { selector: 'body' });

    expect(browser.tabs.connect).toHaveBeenCalledWith(1, { name: 'content-script-bridge' });
    expect(mockPort.postMessage).toHaveBeenCalledWith({
      id: 1,
      method: 'page.getContent',
      params: { selector: 'body' },
    });

    mockPort._messageListeners[0]({
      jsonrpc: '2.0',
      id: 1,
      result: { text: 'page content' },
    });

    const result = await promise;
    expect(result).toEqual({ text: 'page content' });
  });

  it('should throw when content script returns error', async () => {
    const bridge = new ContentBridge();

    const promise = bridge.sendToContent(1, 'page.getContent');

    mockPort._messageListeners[0]({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32603, message: 'Execution failed' },
    });

    await expect(promise).rejects.toThrow('Execution failed');
  });

  it('should reuse port for same tab', async () => {
    const bridge = new ContentBridge();

    const p1 = bridge.sendToContent(1, 'page.getContent');
    mockPort._messageListeners[0]({ jsonrpc: '2.0', id: 1, result: 'ok' });
    await p1;

    const p2 = bridge.sendToContent(1, 'page.getMetadata');
    mockPort._messageListeners[0]({ jsonrpc: '2.0', id: 2, result: 'meta' });
    await p2;

    expect(browser.tabs.connect).toHaveBeenCalledTimes(1);
  });

  it('should create separate ports for different tabs', async () => {
    const port2 = createMockPort();
    (browser.tabs.connect as any).mockReturnValueOnce(mockPort).mockReturnValueOnce(port2);

    const bridge = new ContentBridge();

    const p1 = bridge.sendToContent(1, 'page.getContent');
    mockPort._messageListeners[0]({ jsonrpc: '2.0', id: 1, result: 'ok' });
    await p1;

    const p2 = bridge.sendToContent(2, 'page.getContent');
    port2._messageListeners[0]({ jsonrpc: '2.0', id: 2, result: 'ok' });
    await p2;

    expect(browser.tabs.connect).toHaveBeenCalledTimes(2);
  });

  it('should timeout when content script does not respond', async () => {
    const bridge = new ContentBridge(100);

    const promise = bridge.sendToContent(1, 'page.getContent');

    await expect(promise).rejects.toThrow('timeout');
  });

  it('should handle port disconnect', async () => {
    const bridge = new ContentBridge();

    const promise = bridge.sendToContent(1, 'page.getContent');

    mockPort._disconnectListeners[0]();

    await expect(promise).rejects.toThrow('disconnected');
  });

  it('should clean up ports on disconnect(tabId)', async () => {
    const bridge = new ContentBridge();

    const p1 = bridge.sendToContent(1, 'page.getContent');
    mockPort._messageListeners[0]({ jsonrpc: '2.0', id: 1, result: 'ok' });
    await p1;

    bridge.disconnect(1);

    expect(mockPort.disconnect).toHaveBeenCalled();
  });
});
