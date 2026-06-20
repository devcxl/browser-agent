import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  RpcMethodHandler,
  RpcNotificationHandler,
  IJsonRpcClient,
} from '@/shared/types';
import { createRpcError, JsonRpcErrorCode } from '@/shared/jsonrpc/errors';

/**
 * Background 端 RPC 服务器
 *
 * 监听 browser.runtime.onConnect，为每个接入的 Port 提供 JSON-RPC 2.0 服务。
 * 实现 IJsonRpcClient 接口，兼容 JsonRpcRouter。
 */
export class BackgroundRpcServer implements IJsonRpcClient {
  private requestHandlers = new Map<string, RpcMethodHandler>();
  private notificationHandlers = new Map<string, RpcNotificationHandler>();
  private ports = new Set<ReturnType<typeof browser.runtime.connect>>();
  private _connected = true;

  constructor() {
    browser.runtime.onConnect.addListener(this.handleConnect);
  }

  get connected(): boolean {
    return this._connected;
  }

  // ── IJsonRpcClient 实现 ────────────────────────────

  async request(_method: string, _params?: Record<string, unknown>): Promise<unknown> {
    throw new Error('BackgroundRpcServer does not support outgoing requests');
  }

  notify(method: string, params?: Record<string, unknown>): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    for (const port of this.ports) {
      try {
        port.postMessage(notification);
      } catch {
        this.ports.delete(port);
      }
    }
  }

  onRequest(method: string, handler: RpcMethodHandler): void {
    this.requestHandlers.set(method, handler);
  }

  onNotification(method: string, handler: RpcNotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }

  offRequest(method: string): void {
    this.requestHandlers.delete(method);
  }

  offNotification(method: string): void {
    this.notificationHandlers.delete(method);
  }

  disconnect(): void {
    this._connected = false;
    browser.runtime.onConnect.removeListener(this.handleConnect);
    for (const port of this.ports) {
      try {
        port.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.ports.clear();
    this.requestHandlers.clear();
    this.notificationHandlers.clear();
  }

  // ── 内部 ───────────────────────────────────────────

  private handleConnect = (port: ReturnType<typeof browser.runtime.connect>): void => {
    this.ports.add(port);
    port.onMessage.addListener((message: unknown) => {
      this.handleMessage(port, message);
    });
    port.onDisconnect.addListener(() => {
      this.ports.delete(port);
    });
  };

  private handleMessage(
    port: ReturnType<typeof browser.runtime.connect>,
    message: unknown,
  ): void {
    if (!message || typeof message !== 'object') return;

    const msg = message as Record<string, unknown>;
    if (msg.jsonrpc !== '2.0') return;

    if ('method' in msg && 'id' in msg) {
      this.handleRequest(port, msg as unknown as JsonRpcRequest);
    } else if ('method' in msg && !('id' in msg)) {
      this.handleNotification(msg as unknown as JsonRpcNotification);
    }
  }

  private async handleRequest(
    port: ReturnType<typeof browser.runtime.connect>,
    request: JsonRpcRequest,
  ): Promise<void> {
    const handler = this.requestHandlers.get(request.method);
    if (!handler) {
      this.sendResponse(
        port,
        request.id,
        undefined,
        createRpcError(JsonRpcErrorCode.METHOD_NOT_FOUND),
      );
      return;
    }

    try {
      const result = await handler(request.params);
      this.sendResponse(port, request.id, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      this.sendResponse(
        port,
        request.id,
        undefined,
        createRpcError(JsonRpcErrorCode.INTERNAL_ERROR, message),
      );
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    const handler = this.notificationHandlers.get(notification.method);
    if (handler) {
      handler(notification.params);
    }
  }

  private sendResponse(
    port: ReturnType<typeof browser.runtime.connect>,
    id: string | number,
    result?: unknown,
    error?: { code: number; message: string; data?: unknown },
  ): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      ...(error ? { error } : { result }),
    };
    try {
      port.postMessage(response);
    } catch {
      /* ignore */
    }
  }
}
