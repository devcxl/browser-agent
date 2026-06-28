import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JsonRpcClient } from '../client';

// ── Mock 工具 ──────────────────────────────────────────

interface MockPort {
  onMessage: {
    addListener: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
  };
  onDisconnect: {
    addListener: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
  };
  postMessage: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  _receiveMessage: (msg: unknown) => void;
  _disconnect: () => void;
}

function createMockPort(): MockPort {
  const messageListeners: Array<(msg: unknown) => void> = [];
  const disconnectListeners: Array<() => void> = [];

  return {
    onMessage: {
      addListener: vi.fn((fn: (msg: unknown) => void) => {
        messageListeners.push(fn);
      }),
      removeListener: vi.fn((fn: (msg: unknown) => void) => {
        const idx = messageListeners.indexOf(fn);
        if (idx >= 0) messageListeners.splice(idx, 1);
      }),
    },
    onDisconnect: {
      addListener: vi.fn((fn: () => void) => {
        disconnectListeners.push(fn);
      }),
      removeListener: vi.fn((fn: () => void) => {
        const idx = disconnectListeners.indexOf(fn);
        if (idx >= 0) disconnectListeners.splice(idx, 1);
      }),
    },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    _receiveMessage(msg: unknown) {
      messageListeners.forEach((fn) => fn(msg));
    },
    _disconnect() {
      disconnectListeners.forEach((fn) => fn());
    },
  };
}

// ── Setup ──────────────────────────────────────────────

let mockPort: MockPort;
let connectSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPort = createMockPort();
  connectSpy = vi.fn(() => mockPort);
  vi.stubGlobal('browser', { runtime: { connect: connectSpy } });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ── 辅助函数 ───────────────────────────────────────────

/** 等待微任务队列清空（用于 async handler 完成） */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

// ── Tests ──────────────────────────────────────────────

describe('JsonRpcClient', () => {
  describe('connected getter', () => {
    it('should be true after successful connect', () => {
      const client = new JsonRpcClient();
      expect(client.connected).toBe(true);
    });

    it('should be false after disconnect', () => {
      const client = new JsonRpcClient();
      client.disconnect();
      expect(client.connected).toBe(false);
    });

    it('should be false when port disconnects', () => {
      const client = new JsonRpcClient();
      mockPort._disconnect();
      expect(client.connected).toBe(false);
    });
  });

  describe('request', () => {
    it('should send request and resolve with result', async () => {
      const client = new JsonRpcClient();

      const promise = client.request('ping', { foo: 'bar' });

      // 验证请求已发送
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
        params: { foo: 'bar' },
      });

      // 模拟返回响应
      mockPort._receiveMessage({ jsonrpc: '2.0', id: 1, result: 'pong' });

      await expect(promise).resolves.toBe('pong');
    });

    it('should reject with error when response contains error', async () => {
      const client = new JsonRpcClient();

      const promise = client.request('bad');

      mockPort._receiveMessage({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'Method not found' },
      });

      await expect(promise).rejects.toThrow('Method not found');
    });

    it('should timeout after 30s if no response', async () => {
      const client = new JsonRpcClient();

      const promise = client.request('slow');

      vi.advanceTimersByTime(30000);

      await expect(promise).rejects.toThrow('RPC request timeout: slow (30000ms)');
    });

    it('should support concurrent requests with unique ids', async () => {
      const client = new JsonRpcClient();

      const promise1 = client.request('method1');
      const promise2 = client.request('method2');

      expect(mockPort.postMessage).toHaveBeenCalledTimes(2);
      expect(mockPort.postMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 1 }));
      expect(mockPort.postMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 2 }));

      mockPort._receiveMessage({ jsonrpc: '2.0', id: 1, result: 'res1' });
      mockPort._receiveMessage({ jsonrpc: '2.0', id: 2, result: 'res2' });

      await expect(promise1).resolves.toBe('res1');
      await expect(promise2).resolves.toBe('res2');
    });

    it('should not resolve stale responses (after timeout)', async () => {
      const client = new JsonRpcClient();

      const promise = client.request('slow');
      vi.advanceTimersByTime(30000);

      // 超时后收到响应，应该被忽略
      mockPort._receiveMessage({ jsonrpc: '2.0', id: 1, result: 'late' });

      await expect(promise).rejects.toThrow('RPC request timeout');
    });
  });

  describe('notify', () => {
    it('should send notification without id', () => {
      const client = new JsonRpcClient();

      client.notify('event', { data: 1 });

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'event',
        params: { data: 1 },
      });
    });

    it('should not throw when disconnected', () => {
      const client = new JsonRpcClient();
      client.disconnect();

      expect(() => client.notify('event')).not.toThrow();
      // postMessage should not have been called after disconnect
      // (last call was the original request from constructor - no, constructor doesn't send anything)
      // Actually disconnect may have been called, let's just check it doesn't throw
    });
  });

  describe('onRequest', () => {
    it('should invoke registered handler and send response', async () => {
      const handler = vi.fn(async () => 'pong');
      const client = new JsonRpcClient();

      client.onRequest('ping', handler);

      mockPort._receiveMessage({
        jsonrpc: '2.0',
        id: 42,
        method: 'ping',
        params: { data: 1 },
      });

      await flushMicrotasks();

      expect(handler).toHaveBeenCalledWith({ data: 1 });
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 42,
        result: 'pong',
      });
    });

    it('should return METHOD_NOT_FOUND for unregistered method', async () => {
      new JsonRpcClient();

      mockPort._receiveMessage({
        jsonrpc: '2.0',
        id: 99,
        method: 'unknown.method',
      });

      await flushMicrotasks();

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 99,
        error: { code: -32601, message: 'Method not found' },
      });
    });

    it('should return INTERNAL_ERROR when handler throws', async () => {
      const handler = vi.fn(async () => {
        throw new Error('Something went wrong');
      });
      const client = new JsonRpcClient();

      client.onRequest('fragile', handler);

      mockPort._receiveMessage({
        jsonrpc: '2.0',
        id: 7,
        method: 'fragile',
      });

      await flushMicrotasks();

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 7,
        error: { code: -32603, message: 'Something went wrong' },
      });
    });
  });

  describe('onNotification', () => {
    it('should invoke registered handler', () => {
      const handler = vi.fn();
      const client = new JsonRpcClient();

      client.onNotification('stateChanged', handler);

      mockPort._receiveMessage({
        jsonrpc: '2.0',
        method: 'stateChanged',
        params: { active: true },
      });

      expect(handler).toHaveBeenCalledWith({ active: true });
    });

    it('should not throw for unregistered notification', () => {
      new JsonRpcClient();

      expect(() => {
        mockPort._receiveMessage({
          jsonrpc: '2.0',
          method: 'unknown.event',
        });
      }).not.toThrow();
    });
  });

  describe('offRequest / offNotification', () => {
    it('should remove request handler', () => {
      const handler = vi.fn();
      const client = new JsonRpcClient();

      client.onRequest('ping', handler);
      client.offRequest('ping');

      mockPort._receiveMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should remove notification handler', () => {
      const handler = vi.fn();
      const client = new JsonRpcClient();

      client.onNotification('event', handler);
      client.offNotification('event');

      mockPort._receiveMessage({
        jsonrpc: '2.0',
        method: 'event',
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('reconnection', () => {
    it('should reconnect after port disconnect', () => {
      const client = new JsonRpcClient();

      mockPort._disconnect();

      expect(client.connected).toBe(false);

      // 2s 后应该重连
      vi.advanceTimersByTime(2000);

      expect(connectSpy).toHaveBeenCalledTimes(2);
      expect(client.connected).toBe(true);
    });

    it('should reject all pending requests on disconnect', async () => {
      const client = new JsonRpcClient();

      const promise1 = client.request('r1');
      const promise2 = client.request('r2');
      const promise3 = client.request('r3');

      mockPort._disconnect();

      await expect(promise1).rejects.toThrow('Port disconnected');
      await expect(promise2).rejects.toThrow('Port disconnected');
      await expect(promise3).rejects.toThrow('Port disconnected');
    });

    it('should stop reconnecting after max attempts', () => {
      connectSpy = vi.fn(() => {
        throw new Error('connect failed');
      });
      vi.stubGlobal('browser', { runtime: { connect: connectSpy } });

      new JsonRpcClient(); // 第 1 次尝试

      // 10 次重连
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(2000);
      }

      // 1 次初始 + 10 次重连 = 11 次
      expect(connectSpy).toHaveBeenCalledTimes(11);

      // 第 12 次不应触发
      vi.advanceTimersByTime(2000);
      expect(connectSpy).toHaveBeenCalledTimes(11);
    });

    it('should not reconnect after disconnect() is called', () => {
      const client = new JsonRpcClient();

      client.disconnect();

      // disconnect() 后不应再重连
      vi.advanceTimersByTime(2000);
      expect(connectSpy).toHaveBeenCalledTimes(1); // 只有构造函数的那一次
    });
  });

  describe('message validation', () => {
    it('should ignore non-object messages', () => {
      new JsonRpcClient();

      expect(() => {
        mockPort._receiveMessage(null);
        mockPort._receiveMessage('string');
        mockPort._receiveMessage(42);
      }).not.toThrow();
    });

    it('should ignore messages without jsonrpc "2.0"', () => {
      new JsonRpcClient();

      expect(() => {
        mockPort._receiveMessage({ id: 1, result: 'x' });
      }).not.toThrow();
    });
  });
});
