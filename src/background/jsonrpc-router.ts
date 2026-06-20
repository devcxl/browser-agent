import type { JsonRpcRequest, JsonRpcResponse, RpcMethodHandler } from '@/shared/types';

/**
 * Background 端 JSON-RPC 路由器
 *
 * 接收来自 Chat Page 的请求并路由到对应 handler。
 * 与 src/shared/jsonrpc/router.ts 不同，此 router 不依赖 IJsonRpcClient，
 * 直接维护 handler 映射并处理 request/response。
 */
export class JsonRpcRouter {
  private handlers = new Map<string, RpcMethodHandler>();

  register(method: string, handler: RpcMethodHandler): void {
    this.handlers.set(method, handler);
  }

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const handler = this.handlers.get(request.method);

    if (!handler) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      };
    }

    try {
      const result = await handler(request.params);
      return { jsonrpc: '2.0', id: request.id, result };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : 'Internal error',
        },
      };
    }
  }
}
