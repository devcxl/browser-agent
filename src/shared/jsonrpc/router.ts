import type { RpcMethodHandler, IJsonRpcClient } from '@/shared/types';

/**
 * JSON-RPC 路由器
 *
 * 用于 Background 端：接收来自 Chat Page 的请求并路由到对应 handler。
 * 封装 JsonRpcClient.onRequest 提供 register/registerAll/unregister 等管理方法。
 */
export class JsonRpcRouter {
  private handlers = new Map<string, RpcMethodHandler>();
  private client: IJsonRpcClient;

  constructor(client: IJsonRpcClient) {
    this.client = client;
  }

  /**
   * 注册 RPC 方法处理器
   */
  register(method: string, handler: RpcMethodHandler): void {
    if (this.handlers.has(method)) {
      throw new Error(`Method already registered: ${method}`);
    }
    this.handlers.set(method, handler);
    this.client.onRequest(method, handler);
  }

  /**
   * 批量注册
   */
  registerAll(routes: Record<string, RpcMethodHandler>): void {
    for (const [method, handler] of Object.entries(routes)) {
      this.register(method, handler);
    }
  }

  /**
   * 移除方法
   */
  unregister(method: string): void {
    this.handlers.delete(method);
    this.client.offRequest(method);
  }

  /**
   * 检查方法是否已注册
   */
  has(method: string): boolean {
    return this.handlers.has(method);
  }

  /**
   * 获取所有已注册的方法名
   */
  registeredMethods(): string[] {
    return Array.from(this.handlers.keys());
  }
}
