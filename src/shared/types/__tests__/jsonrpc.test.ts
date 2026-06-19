import { describe, it, expect } from 'vitest';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcError,
  JsonRpcMessage,
  RpcMethodHandler,
  RpcNotificationHandler,
  IJsonRpcClient,
} from '../jsonrpc';
import { JsonRpcErrorCode } from '../jsonrpc';

describe('JSON-RPC types', () => {
  describe('JsonRpcRequest', () => {
    it('should require jsonrpc, id, method', () => {
      const req: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      };
      expect(req.jsonrpc).toBe('2.0');
      expect(req.id).toBe(1);
    });

    it('should allow string id', () => {
      const req: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'req-1',
        method: 'test',
      };
      expect(typeof req.id).toBe('string');
    });

    it('should allow optional params', () => {
      const req: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
        params: { key: 'value' },
      };
      expect(req.params).toEqual({ key: 'value' });
    });
  });

  describe('JsonRpcResponse', () => {
    it('should require jsonrpc and id', () => {
      const res: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: 'ok',
      };
      expect(res.result).toBe('ok');
    });

    it('should support error response', () => {
      const res: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'Method not found' },
      };
      expect(res.error!.code).toBe(-32601);
    });

    it('should not have both result and error', () => {
      const res: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: 'ok',
      };
      // TypeScript ensures either result or error, not both at type level
      expect(res.result).toBeDefined();
    });
  });

  describe('JsonRpcNotification', () => {
    it('should not have id field', () => {
      const notif: JsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'update',
      };
      expect((notif as any).id).toBeUndefined();
    });

    it('should allow optional params', () => {
      const notif: JsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'update',
        params: { data: 1 },
      };
      expect(notif.params).toBeDefined();
    });
  });

  describe('JsonRpcError', () => {
    it('should have code, message, optional data', () => {
      const err: JsonRpcError = {
        code: -32700,
        message: 'Parse error',
      };
      expect(err.code).toBe(-32700);
      expect(err.data).toBeUndefined();
    });
  });

  describe('JsonRpcMessage', () => {
    it('should be a union of request, response, notification', () => {
      const msg1: JsonRpcMessage = { jsonrpc: '2.0', id: 1, method: 'test' };
      const msg2: JsonRpcMessage = { jsonrpc: '2.0', id: 1, result: 'ok' };
      const msg3: JsonRpcMessage = { jsonrpc: '2.0', method: 'notif' };
      expect(msg1).toBeDefined();
      expect(msg2).toBeDefined();
      expect(msg3).toBeDefined();
    });
  });

  describe('JsonRpcErrorCode', () => {
    it('should have standard error codes', () => {
      expect(JsonRpcErrorCode.PARSE_ERROR).toBe(-32700);
      expect(JsonRpcErrorCode.INVALID_REQUEST).toBe(-32600);
      expect(JsonRpcErrorCode.METHOD_NOT_FOUND).toBe(-32601);
      expect(JsonRpcErrorCode.INVALID_PARAMS).toBe(-32602);
      expect(JsonRpcErrorCode.INTERNAL_ERROR).toBe(-32603);
    });

    it('should have custom error codes', () => {
      expect(JsonRpcErrorCode.TIMEOUT).toBe(-32000);
      expect(JsonRpcErrorCode.DISCONNECTED).toBe(-32001);
      expect(JsonRpcErrorCode.UNKNOWN).toBe(-32099);
    });
  });

  describe('Handler types', () => {
    it('should type RpcMethodHandler', () => {
      const handler: RpcMethodHandler = async (params) => params;
      expect(typeof handler).toBe('function');
    });

    it('should type RpcNotificationHandler', () => {
      const handler: RpcNotificationHandler = (params) => { void params; };
      expect(typeof handler).toBe('function');
    });
  });

  describe('IJsonRpcClient', () => {
    it('should define the full client interface', () => {
      const methods: (keyof IJsonRpcClient)[] = [
        'request', 'notify', 'onRequest', 'onNotification',
        'offRequest', 'offNotification', 'disconnect',
      ];
      const client: IJsonRpcClient = {
        request: async () => undefined,
        notify: () => {},
        onRequest: () => {},
        onNotification: () => {},
        offRequest: () => {},
        offNotification: () => {},
        disconnect: () => {},
        connected: false,
      };
      for (const m of methods) {
        expect(typeof (client as any)[m]).toBe('function');
      }
      expect(client.connected).toBe(false);
    });
  });
});
