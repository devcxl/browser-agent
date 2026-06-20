import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  RpcMethodHandler,
  RpcNotificationHandler,
  IJsonRpcClient,
} from '@/shared/types';
import { createRpcError, JsonRpcErrorCode } from './errors';

/** 默认请求超时 (ms) */
const DEFAULT_TIMEOUT = 30000;

/** 重连间隔 (ms) */
const RECONNECT_INTERVAL = 2000;

/** 最大重连次数，超过后放弃 */
const MAX_RECONNECT_ATTEMPTS = 10;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * JSON-RPC 2.0 客户端
 *
 * 使用 browser.runtime.connect() 建立双向通信通道。
 * 支持 request/notify/onRequest/onNotification/自动重连。
 */
export class JsonRpcClient implements IJsonRpcClient {
  private port: ReturnType<typeof browser.runtime.connect> | null = null;
  private requestId = 0;
  private pending = new Map<string | number, PendingRequest>();
  private requestHandlers = new Map<string, RpcMethodHandler>();
  private notificationHandlers = new Map<string, RpcNotificationHandler>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private name: string;

  constructor(options?: { name?: string }) {
    this.name = options?.name ?? 'default';
    this.connect();
  }

  get connected(): boolean {
    return this._connected;
  }

  // ── 公开方法 ────────────────────────────────────────

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.port) {
      throw new Error('Not connected');
    }

    const id = ++this.requestId;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC request timeout: ${method} (${DEFAULT_TIMEOUT}ms)`));
      }, DEFAULT_TIMEOUT);

      this.pending.set(id, { resolve, reject, timer });
      this.port!.postMessage(request);
    });
  }

  notify(method: string, params?: Record<string, unknown>): void {
    if (!this.port) return;

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.port.postMessage(notification);
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
    this.cleanup();
    this._connected = false;
  }

  // ── 内部方法 ────────────────────────────────────────

  private connect(): void {
    try {
      this.port = browser.runtime.connect({ name: this.name });
      this.port.onMessage.addListener(this.handleMessage);
      this.port.onDisconnect.addListener(this.handleDisconnect);
      this._connected = true;
      this.reconnectAttempts = 0;
    } catch (err) {
      console.error('[JsonRpcClient] Failed to connect:', err);
      this.scheduleReconnect();
    }
  }

  private handleMessage = (message: unknown): void => {
    if (!message || typeof message !== 'object') return;

    const msg = message as Record<string, unknown>;

    if (msg.jsonrpc !== '2.0') return;

    if ('method' in msg && 'id' in msg) {
      this.handleRequest(msg as unknown as JsonRpcRequest);
    } else if ('method' in msg && !('id' in msg)) {
      this.handleNotification(msg as unknown as JsonRpcNotification);
    } else if ('id' in msg) {
      this.handleResponse(msg as unknown as JsonRpcResponse);
    }
  };

  private handleDisconnect = (): void => {
    this._connected = false;

    const error = new Error('Port disconnected');

    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();

    if (this.port) {
      try {
        this.port.onMessage.removeListener(this.handleMessage);
      } catch {
        /* ignore */
      }
      try {
        this.port.onDisconnect.removeListener(this.handleDisconnect);
      } catch {
        /* ignore */
      }
      this.port = null;
    }

    this.scheduleReconnect();
  };

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[JsonRpcClient] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[JsonRpcClient] Reconnecting (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_INTERVAL);
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    const handler = this.requestHandlers.get(request.method);
    if (!handler) {
      this.sendResponse(
        request.id,
        undefined,
        createRpcError(JsonRpcErrorCode.METHOD_NOT_FOUND),
      );
      return;
    }

    try {
      const result = await handler(request.params);
      this.sendResponse(request.id, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      this.sendResponse(
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

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  private sendResponse(
    id: string | number,
    result?: unknown,
    error?: { code: number; message: string; data?: unknown },
  ): void {
    if (!this.port) return;
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      ...(error ? { error } : { result }),
    };
    this.port.postMessage(response);
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Client disconnected'));
    }
    this.pending.clear();
    if (this.port) {
      try {
        this.port.onMessage.removeListener(this.handleMessage);
      } catch {
        /* ignore */
      }
      try {
        this.port.onDisconnect.removeListener(this.handleDisconnect);
      } catch {
        /* ignore */
      }
      try {
        this.port.disconnect();
      } catch {
        /* ignore */
      }
      this.port = null;
    }
  }
}
