import { describe, it, expect } from 'vitest';
import { JsonRpcRouter } from '../jsonrpc-router';
import type { JsonRpcRequest } from '@/shared/types';

describe('JsonRpcRouter', () => {
  it('should route request to registered handler and return result', async () => {
    const router = new JsonRpcRouter();
    router.register('ping', async () => 'pong');

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
    };

    const response = await router.handle(request);
    expect(response.result).toBe('pong');
    expect(response.error).toBeUndefined();
  });

  it('should return -32601 when method not found', async () => {
    const router = new JsonRpcRouter();

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'unknown.method',
    };

    const response = await router.handle(request);
    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe(-32601);
    expect(response.error!.message).toContain('unknown.method');
    expect(response.result).toBeUndefined();
  });

  it('should return -32603 when handler throws', async () => {
    const router = new JsonRpcRouter();
    router.register('fail', async () => {
      throw new Error('Something went wrong');
    });

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'fail',
    };

    const response = await router.handle(request);
    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe(-32603);
    expect(response.error!.message).toBe('Something went wrong');
    expect(response.result).toBeUndefined();
  });

  it('should preserve request id in response', async () => {
    const router = new JsonRpcRouter();
    router.register('echo', async (params) => params);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 'req-42',
      method: 'echo',
      params: { foo: 'bar' },
    };

    const response = await router.handle(request);
    expect(response.id).toBe('req-42');
    expect(response.result).toEqual({ foo: 'bar' });
  });

  it('should handle multiple registered methods', async () => {
    const router = new JsonRpcRouter();
    router.register('a', async () => 1);
    router.register('b', async () => 2);

    expect((await router.handle({ jsonrpc: '2.0', id: 1, method: 'a' })).result).toBe(1);
    expect((await router.handle({ jsonrpc: '2.0', id: 2, method: 'b' })).result).toBe(2);
  });
});
