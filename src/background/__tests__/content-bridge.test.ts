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

  it('should disconnect all ports and reject all pending on disconnect()', async () => {
    const port2 = createMockPort();
    (browser.tabs.connect as any)
      .mockReturnValueOnce(mockPort)
      .mockReturnValueOnce(port2);
    const bridge = new ContentBridge();

    // 两个标签页各一个未决请求 + 一个已完成的连接
    const p1 = bridge.sendToContent(1, 'a');
    const p2 = bridge.sendToContent(2, 'b');
    const p3 = bridge.sendToContent(2, 'c');
    port2._messageListeners[0]({ jsonrpc: '2.0', id: 3, result: 'done' });
    await p3;

    bridge.disconnect();

    expect(mockPort.disconnect).toHaveBeenCalled();
    expect(port2.disconnect).toHaveBeenCalled();
    await expect(p1).rejects.toThrow('disconnected');
    await expect(p2).rejects.toThrow('disconnected');
  });

  it('should reject pending requests when their port disconnects', async () => {
    const bridge = new ContentBridge();

    const p1 = bridge.sendToContent(1, 'page.getContent');
    const p2 = bridge.sendToContent(1, 'page.getContent');

    mockPort._disconnectListeners[0]();

    await expect(p1).rejects.toThrow('Port disconnected');
    await expect(p2).rejects.toThrow('Port disconnected');
  });

  it('should recreate the port for a tab after it disconnects', async () => {
    const port2 = createMockPort();
    (browser.tabs.connect as any)
      .mockReturnValueOnce(mockPort)
      .mockReturnValueOnce(port2);
    const bridge = new ContentBridge();

    // 第一次连接
    const p1 = bridge.sendToContent(1, 'page.getContent');
    expect(browser.tabs.connect).toHaveBeenCalledTimes(1);
    mockPort._disconnectListeners[0](); // 端口断开 → ports 清掉
    await expect(p1).rejects.toThrow();

    // 再次请求同一 tab → 重新 connect
    const p2 = bridge.sendToContent(1, 'page.getContent');
    expect(browser.tabs.connect).toHaveBeenCalledTimes(2);
    port2._messageListeners[0]({ jsonrpc: '2.0', id: 2, result: 'ok' });
    await expect(p2).resolves.toBe('ok');
  });

  it('should resolve with undefined result for responses without result field', async () => {
    const bridge = new ContentBridge();

    const promise = bridge.sendToContent(1, 'page.method');

    mockPort._messageListeners[0]({ jsonrpc: '2.0', id: 1 });

    await expect(promise).resolves.toBeUndefined();
  });

  it('should ignore non-object messages and messages with unknown id', async () => {
    const bridge = new ContentBridge();

    const promise = bridge.sendToContent(1, 'page.method');

    // 无关消息不会 resolve/reject 当前请求
    mockPort._messageListeners[0](null);
    mockPort._messageListeners[0]('string');
    mockPort._messageListeners[0]({ noId: true });
    mockPort._messageListeners[0]({ jsonrpc: '2.0', id: 999, result: 'ghost' });

    // 最终正确响应才 resolve
    mockPort._messageListeners[0]({ jsonrpc: '2.0', id: 1, result: 'real' });
    await expect(promise).resolves.toBe('real');
  });

  it('should not fail when disconnect(tabId) is called for an unknown tab', () => {
    const bridge = new ContentBridge();
    expect(() => bridge.disconnect(999)).not.toThrow();
    expect(mockPort.disconnect).not.toHaveBeenCalled();
  });

  it('should ignore disconnect errors for a specific tab', async () => {
    const bridge = new ContentBridge();
    mockPort.disconnect = vi.fn(() => { throw new Error('port already gone'); });

    const p1 = bridge.sendToContent(1, 'page.getContent');
    mockPort._messageListeners[0]({ jsonrpc: '2.0', id: 1, result: 'ok' });
    await p1;

    expect(() => bridge.disconnect(1)).not.toThrow();
    expect(mockPort.disconnect).toHaveBeenCalled();
  });

  it('should ignore disconnect errors when disconnecting all ports', async () => {
    const bridge = new ContentBridge();
    mockPort.disconnect = vi.fn(() => { throw new Error('port already gone'); });

    const p1 = bridge.sendToContent(1, 'page.getContent');
    mockPort._messageListeners[0]({ jsonrpc: '2.0', id: 1, result: 'ok' });
    await p1;

    expect(() => bridge.disconnect()).not.toThrow();
  });
});
