import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackgroundRpcServer } from '../rpc-server';

interface MockPort {
  onMessage: { addListener: vi.Mock; removeListener: vi.Mock };
  onDisconnect: { addListener: vi.Mock; removeListener: vi.Mock };
  postMessage: vi.Mock;
  disconnect: vi.Mock;
  _receiveMessage: (msg: unknown) => void;
  _disconnect: () => void;
}

function createMockPort(): MockPort {
  const msgListeners: Array<(msg: unknown) => void> = [];
  const discListeners: Array<() => void> = [];
  return {
    onMessage: {
      addListener: vi.fn((fn: (msg: unknown) => void) => { msgListeners.push(fn); }),
      removeListener: vi.fn((fn: (msg: unknown) => void) => {
        const idx = msgListeners.indexOf(fn);
        if (idx >= 0) msgListeners.splice(idx, 1);
      }),
    },
    onDisconnect: {
      addListener: vi.fn((fn: () => void) => { discListeners.push(fn); }),
      removeListener: vi.fn((fn: () => void) => {
        const idx = discListeners.indexOf(fn);
        if (idx >= 0) discListeners.splice(idx, 1);
      }),
    },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    _receiveMessage(msg: unknown) { msgListeners.forEach((fn) => fn(msg)); },
    _disconnect() { discListeners.forEach((fn) => fn()); },
  };
}

let mockPort: MockPort;
let addListenerSpy: vi.Mock;

beforeEach(() => {
  mockPort = createMockPort();
  addListenerSpy = vi.fn((fn: (port: unknown) => void) => {
    fn(mockPort);
  });
  vi.stubGlobal('browser', {
    runtime: {
      connect: vi.fn(),
      onConnect: {
        addListener: addListenerSpy,
        removeListener: vi.fn(),
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe('BackgroundRpcServer', () => {
  describe('constructor', () => {
    it('should listen for incoming connections', () => {
      new BackgroundRpcServer();
      expect(browser.runtime.onConnect.addListener).toHaveBeenCalled();
    });
  });

  describe('connected', () => {
    it('should be true by default', () => {
      const server = new BackgroundRpcServer();
      expect(server.connected).toBe(true);
    });

    it('should be false after disconnect', () => {
      const server = new BackgroundRpcServer();
      server.disconnect();
      expect(server.connected).toBe(false);
    });
  });

  describe('onRequest', () => {
    it('should handle request and send response', async () => {
      const handler = vi.fn().mockResolvedValue('pong');
      const server = new BackgroundRpcServer();
      server.onRequest('ping', handler);

      mockPort._receiveMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
        params: { data: 1 },
      });

      await flushMicrotasks();
      expect(handler).toHaveBeenCalledWith({ data: 1 });
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 1,
        result: 'pong',
      });
    });

    it('should return METHOD_NOT_FOUND for unregistered method', async () => {
      new BackgroundRpcServer();

      mockPort._receiveMessage({
        jsonrpc: '2.0',
        id: 99,
        method: 'unknown',
      });

      await flushMicrotasks();
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 99,
        error: { code: -32601, message: 'Method not found' },
      });
    });

    it('should return INTERNAL_ERROR when handler throws', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('boom'));
      const server = new BackgroundRpcServer();
      server.onRequest('fragile', handler);

      mockPort._receiveMessage({
        jsonrpc: '2.0',
        id: 7,
        method: 'fragile',
      });

      await flushMicrotasks();
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 7,
        error: { code: -32603, message: 'boom' },
      });
    });
  });

  describe('onNotification', () => {
    it('should handle notification', () => {
      const handler = vi.fn();
      const server = new BackgroundRpcServer();
      server.onNotification('event', handler);

      mockPort._receiveMessage({
        jsonrpc: '2.0',
        method: 'event',
        params: { key: 'val' },
      });

      expect(handler).toHaveBeenCalledWith({ key: 'val' });
    });

    it('should not throw for unregistered notification', () => {
      new BackgroundRpcServer();
      expect(() => {
        mockPort._receiveMessage({ jsonrpc: '2.0', method: 'unknown' });
      }).not.toThrow();
    });
  });

  describe('notify', () => {
    it('should send notification to all connected ports', () => {
      const server = new BackgroundRpcServer();

      server.notify('stateChanged', { active: true });

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'stateChanged',
        params: { active: true },
      });
    });

    it('should handle port postMessage error gracefully', () => {
      mockPort.postMessage.mockImplementation(() => { throw new Error('disconnected'); });
      const server = new BackgroundRpcServer();

      expect(() => server.notify('event')).not.toThrow();
    });
  });

  describe('offRequest', () => {
    it('should remove request handler', async () => {
      const handler = vi.fn();
      const server = new BackgroundRpcServer();
      server.onRequest('ping', handler);
      server.offRequest('ping');

      mockPort._receiveMessage({ jsonrpc: '2.0', id: 1, method: 'ping' });
      await flushMicrotasks();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('offNotification', () => {
    it('should remove notification handler', () => {
      const handler = vi.fn();
      const server = new BackgroundRpcServer();
      server.onNotification('event', handler);
      server.offNotification('event');

      mockPort._receiveMessage({ jsonrpc: '2.0', method: 'event' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('request', () => {
    it('should throw (server does not support outgoing requests)', async () => {
      const server = new BackgroundRpcServer();
      await expect(server.request('method')).rejects.toThrow('does not support outgoing requests');
    });
  });

  describe('disconnect', () => {
    it('should clean up all handlers and ports', () => {
      const server = new BackgroundRpcServer();
      server.disconnect();

      expect(server.connected).toBe(false);
      expect(mockPort.disconnect).toHaveBeenCalled();
    });

    it('should handle port disconnect errors gracefully', () => {
      mockPort.disconnect = vi.fn(() => { throw new Error('fail'); });
      const server = new BackgroundRpcServer();

      expect(() => server.disconnect()).not.toThrow();
    });
  });

  describe('message validation', () => {
    it('should ignore non-object messages', () => {
      new BackgroundRpcServer();
      expect(() => {
        mockPort._receiveMessage(null);
        mockPort._receiveMessage('string');
        mockPort._receiveMessage(42);
      }).not.toThrow();
    });

    it('should ignore messages without jsonrpc 2.0', () => {
      new BackgroundRpcServer();
      expect(() => {
        mockPort._receiveMessage({ id: 1, result: 'x' });
      }).not.toThrow();
    });
  });
});
