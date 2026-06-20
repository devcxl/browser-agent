import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JsonRpcRouter } from '../router';
import type { IJsonRpcClient, RpcMethodHandler } from '@/shared/types';

function createMockClient(): IJsonRpcClient {
  return {
    request: vi.fn(),
    notify: vi.fn(),
    onRequest: vi.fn(),
    onNotification: vi.fn(),
    offRequest: vi.fn(),
    offNotification: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  };
}

describe('JsonRpcRouter', () => {
  let mockClient: IJsonRpcClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  describe('register', () => {
    it('should register handler via client.onRequest', () => {
      const router = new JsonRpcRouter(mockClient);
      const handler: RpcMethodHandler = async () => 'pong';

      router.register('ping', handler);

      expect(mockClient.onRequest).toHaveBeenCalledWith('ping', handler);
    });

    it('should throw on duplicate registration', () => {
      const router = new JsonRpcRouter(mockClient);
      const handler: RpcMethodHandler = async () => 'pong';

      router.register('ping', handler);
      expect(() => router.register('ping', handler)).toThrow(
        'Method already registered: ping',
      );
    });
  });

  describe('registerAll', () => {
    it('should register multiple handlers', () => {
      const router = new JsonRpcRouter(mockClient);
      const h1: RpcMethodHandler = async () => 'a';
      const h2: RpcMethodHandler = async () => 'b';

      router.registerAll({ methodA: h1, methodB: h2 });

      expect(mockClient.onRequest).toHaveBeenCalledWith('methodA', h1);
      expect(mockClient.onRequest).toHaveBeenCalledWith('methodB', h2);
    });
  });

  describe('unregister', () => {
    it('should remove handler via client.offRequest', () => {
      const router = new JsonRpcRouter(mockClient);
      const handler: RpcMethodHandler = async () => 'pong';

      router.register('ping', handler);
      router.unregister('ping');

      expect(mockClient.offRequest).toHaveBeenCalledWith('ping');
    });
  });

  describe('has', () => {
    it('should return true for registered method', () => {
      const router = new JsonRpcRouter(mockClient);
      router.register('ping', async () => 'pong');

      expect(router.has('ping')).toBe(true);
    });

    it('should return false for unregistered method', () => {
      const router = new JsonRpcRouter(mockClient);

      expect(router.has('unknown')).toBe(false);
    });

    it('should return false after unregister', () => {
      const router = new JsonRpcRouter(mockClient);
      router.register('ping', async () => 'pong');
      router.unregister('ping');

      expect(router.has('ping')).toBe(false);
    });
  });

  describe('registeredMethods', () => {
    it('should return all registered method names', () => {
      const router = new JsonRpcRouter(mockClient);
      router.register('a', async () => 1);
      router.register('b', async () => 2);
      router.register('c', async () => 3);

      const methods = router.registeredMethods();
      expect(methods).toEqual(['a', 'b', 'c']);
    });

    it('should return empty array when no methods registered', () => {
      const router = new JsonRpcRouter(mockClient);

      expect(router.registeredMethods()).toEqual([]);
    });
  });
});
