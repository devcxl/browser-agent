# 开发文档: T4 - JSON-RPC 通信层完整实现

**Project:** Browser Agent
**Task ID:** T4
**Slug:** jsonrpc-impl
**Issue:** #4
**类型:** backend
**Batch:** 2
**依赖:** T1（项目骨架）, T2（共享类型）

## 1. 目标

实现基于 `browser.runtime.connect()` 的 JSON-RPC 2.0 双向通信层。`JsonRpcClient` 用于 Chat Page ↔ Background 通信，`JsonRpcRouter` 用于 Background 端路由请求到对应 handler。

## 2. 前置条件

- T1 完成：项目骨架、WXT 配置就绪
- T2 完成：`JsonRpcRequest`、`JsonRpcResponse`、`JsonRpcNotification`、`IJsonRpcClient`、`RpcMethodHandler` 等类型已定义

## 3. 实现步骤

### 3.1 错误码定义

**文件: `src/shared/jsonrpc/errors.ts`**

```ts
/**
 * JSON-RPC 2.0 标准错误码 + 自定义错误码
 * 参考: https://www.jsonrpc.org/specification#error_object
 */
export const JsonRpcErrorCode = {
  // 标准错误码
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // 自定义错误码
  TIMEOUT: -32000,
  DISCONNECTED: -32001,
  UNKNOWN: -32099,
} as const;

export type JsonRpcErrorCode = (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode];

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * 创建标准 JSON-RPC 错误对象
 */
export function createRpcError(code: JsonRpcErrorCode, message?: string, data?: unknown): JsonRpcError {
  const defaultMessages: Record<number, string> = {
    [-32700]: 'Parse error',
    [-32600]: 'Invalid Request',
    [-32601]: 'Method not found',
    [-32602]: 'Invalid params',
    [-32603]: 'Internal error',
    [-32000]: 'Request timeout',
    [-32001]: 'Disconnected',
    [-32099]: 'Unknown error',
  };
  return {
    code,
    message: message ?? defaultMessages[code] ?? 'Unknown error',
    ...(data !== undefined ? { data } : {}),
  };
}
```

### 3.2 JsonRpcClient 实现

**文件: `src/shared/jsonrpc/client.ts`**

```ts
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
 * 支持：
 * - request: 发送请求，等待响应，超时自动 reject
 * - notify: 发送通知，不等待响应
 * - onRequest: 注册方法处理器（接收对端请求）
 * - onNotification: 注册通知处理器
 * - 自动重连：端口断开后自动重连
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

    // 判断消息类型
    if (msg.jsonrpc !== '2.0') return;

    if ('method' in msg && 'id' in msg) {
      // 请求 → 调用 handler
      this.handleRequest(msg as unknown as JsonRpcRequest);
    } else if ('method' in msg && !('id' in msg)) {
      // 通知 → 调用 notification handler
      this.handleNotification(msg as unknown as JsonRpcNotification);
    } else if ('id' in msg) {
      // 响应 → resolve pending promise
      this.handleResponse(msg as unknown as JsonRpcResponse);
    }
  };

  private handleDisconnect = (): void => {
    this._connected = false;
    const error = new Error('Port disconnected');

    // 所有 pending 请求 reject
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();

    // 清理旧 port
    if (this.port) {
      try { this.port.onMessage.removeListener(this.handleMessage); } catch {}
      try { this.port.onDisconnect.removeListener(this.handleDisconnect); } catch {}
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
      this.sendResponse(request.id, undefined, createRpcError(JsonRpcErrorCode.METHOD_NOT_FOUND));
      return;
    }

    try {
      const result = await handler(request.params);
      this.sendResponse(request.id, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      this.sendResponse(request.id, undefined, createRpcError(JsonRpcErrorCode.INTERNAL_ERROR, message));
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
    if (!pending) return; // 可能是超时后到达的响应

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  private sendResponse(id: string | number, result?: unknown, error?: { code: number; message: string; data?: unknown }): void {
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
      try { this.port.onMessage.removeListener(this.handleMessage); } catch {}
      try { this.port.onDisconnect.removeListener(this.handleDisconnect); } catch {}
      try { this.port.disconnect(); } catch {}
      this.port = null;
    }
  }
}
```

### 3.3 JsonRpcRouter 实现

**文件: `src/shared/jsonrpc/router.ts`**

```ts
import type { RpcMethodHandler, IJsonRpcClient } from '@/shared/types';
import { createRpcError, JsonRpcErrorCode } from './errors';

/**
 * JSON-RPC 路由器
 *
 * 用于 Background 端：接收来自 Chat Page 的请求并路由到对应 handler。
 * 与 JsonRpcClient 的区别：
 * - Router 注册 handler 用于响应外部请求
 * - Router 不维护 pending 请求表（由内部 JsonRpcClient 处理）
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
```

### 3.4 统一导出

**文件: `src/shared/jsonrpc/index.ts`**

```ts
export { JsonRpcClient } from './client';
export { JsonRpcRouter } from './router';
export {
  JsonRpcErrorCode,
  createRpcError,
} from './errors';
export type { JsonRpcError } from './errors';
```

## 4. 接口/契约

### 4.1 IJsonRpcClient 接口回顾

| 方法 | 签名 | 说明 |
|------|------|------|
| `request` | `(method, params?) => Promise<unknown>` | 发送请求，等待响应。超时 30s 后 reject |
| `notify` | `(method, params?) => void` | 发送通知，不等待响应 |
| `onRequest` | `(method, handler) => void` | 注册方法处理器 |
| `onNotification` | `(method, handler) => void` | 注册通知处理器 |
| `offRequest` | `(method) => void` | 移除方法处理器 |
| `offNotification` | `(method) => void` | 移除通知处理器 |
| `disconnect` | `() => void` | 断开连接，清理资源 |
| `connected` | `boolean` (getter) | 当前连接状态 |

### 4.2 消息格式

```
Chat Page → Background (request):
{ jsonrpc: "2.0", id: 1, method: "tabs.query", params: { queryInfo: { active: true } } }

Background → Chat Page (response):
{ jsonrpc: "2.0", id: 1, result: [{ id: 1, title: "..." }] }

Background → Chat Page (notification):
{ jsonrpc: "2.0", method: "browser.stateChanged", params: { state: { ... } } }

Background → Chat Page (error response):
{ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }
```

### 4.3 错误码

| 错误码 | 名称 | 触发条件 |
|--------|------|----------|
| -32700 | Parse error | 收到无法解析的 JSON |
| -32600 | Invalid Request | 请求格式不符合规范 |
| -32601 | Method not found | 方法未注册 handler |
| -32602 | Invalid params | 参数格式错误 |
| -32603 | Internal error | handler 执行异常 |
| -32000 | Timeout | 请求超时（默认 30s） |
| -32001 | Disconnected | 端口断开 |

### 4.4 连接生命周期

```
构造函数 → connect() → 成功 → connected = true
                        失败 → scheduleReconnect() → 2s 后重试（最多 10 次）

运行时 → onDisconnect → connected = false
                     → 所有 pending reject
                     → scheduleReconnect()

disconnect() → cleanup() → connected = false → 不再重连
```

## 5. 测试指引

### 5.1 JsonRpcClient 单元测试

**文件: `src/shared/jsonrpc/__tests__/client.test.ts`**

Mock 策略：mock `browser.runtime.connect()` 返回一个带有 `onMessage.addListener`、`onDisconnect.addListener`、`postMessage`、`disconnect` 的对象。

测试场景：

| # | 场景 | 操作 | 预期 |
|---|------|------|------|
| 1 | request 正常 | `client.request("ping")`，mock 返回 `{jsonrpc:"2.0",id:1,result:"pong"}` | resolve "pong" |
| 2 | request 超时 | `client.request("slow")`，不发送响应 | 30s 后 reject timeout error |
| 3 | request 错误 | `client.request("bad")`，mock 返回 `{jsonrpc:"2.0",id:1,error:{code:-32601}}` | reject error |
| 4 | notify 发送 | `client.notify("event", {data:1})` | port.postMessage 被调用 |
| 5 | onRequest 处理 | 注册 handler，mock 收到请求 | handler 被调用，返回值通过 postMessage 返回 |
| 6 | onRequest 未注册 | mock 收到未注册方法的请求 | 返回 METHOD_NOT_FOUND 错误 |
| 7 | onRequest handler 抛异常 | handler 抛出 Error | 返回 INTERNAL_ERROR |
| 8 | onNotification 处理 | 注册 handler，mock 收到通知 | handler 被调用 |
| 9 | onNotification 未注册 | mock 收到未注册的通知 | 无操作（不抛异常） |
| 10 | 断线重连 | mock port.onDisconnect 触发 | connected=false → 2s 后重连 |
| 11 | 断线 pending | port 断开时有 3 个 pending 请求 | 全部 reject |
| 12 | 最大重连 | 重连尝试 10 次均失败 | 第 11 次不再重连 |
| 13 | disconnect | 调用 disconnect() | 停止重连，清理资源 |
| 14 | connected getter | 连接成功/断开 | 正确反映状态 |

### 5.2 JsonRpcRouter 单元测试

**文件: `src/shared/jsonrpc/__tests__/router.test.ts`**

测试场景：

| # | 场景 | 操作 | 预期 |
|---|------|------|------|
| 1 | register | `router.register("ping", handler)` | handler 通过 client.onRequest 注册 |
| 2 | registerAll | `router.registerAll({ a: h1, b: h2 })` | 两个 handler 均注册 |
| 3 | 重复注册 | 同方法 register 两次 | 抛出 Error |
| 4 | unregister | `router.unregister("ping")` | handler 通过 client.offRequest 移除 |
| 5 | has | `router.has("ping")` | 正确反映注册状态 |
| 6 | registeredMethods | 注册 3 个方法 | 返回 3 个方法名 |

### 5.3 运行测试

```bash
npm run test -- src/shared/jsonrpc/
# 或
npx vitest run src/shared/jsonrpc/
```

## 6. 验收标准

- [ ] Chat Page 通过 `JsonRpcClient.request("ping")` 发送请求，Background 返回 `"pong"`
- [ ] Background 通过 `JsonRpcClient.notify("browser.stateChanged", ...)` 推送事件到 Chat Page
- [ ] Chat Page 通过 `onNotification("browser.stateChanged", handler)` 正确接收事件
- [ ] 请求超时（默认 30s）正确抛出错误（错误码 -32000）
- [ ] 端口断开后自动重连（2s 间隔，最多 10 次）
- [ ] JSON-RPC 错误码符合规范（-32700 解析错误，-32601 方法不存在，-32603 内部错误）
- [ ] `offRequest`/`offNotification` 正确移除处理器
- [ ] `disconnect()` 后不再重连，所有 pending 请求 reject
- [ ] `connected` getter 正确反映连接状态
- [ ] 单元测试覆盖 request/notify/onRequest/onNotification/超时/错误码/重连/断线

## 7. 注意事项

- **browser.runtime.connect()**：在 WXT 中，`browser` 由 webextension-polyfill 提供。`browser.runtime.connect()` 返回的 Port 对象支持 `onMessage.addListener`、`onDisconnect.addListener`、`postMessage`、`disconnect`。注意这是异步事件，不是 Promise。
- **消息序列化**：`postMessage` 发送的消息会被结构化克隆（structured clone）。函数、Symbol、DOM 节点等不可克隆的值会丢失。所有数据必须是 JSON 兼容的。
- **并发请求**：`requestId` 使用递增数字，从 1 开始。同一个 client 实例支持并发多个 request。
- **重连策略**：自动重连在 `JsonRpcClient` 构造函数中启动。如果需要手动控制重连，可以在构造后立即调用 `disconnect()` 再手动 `connect()`。
- **Service Worker 休眠**：Chrome MV3 的 Service Worker 可能被浏览器休眠。通过 `browser.runtime.connect()` 建立的 port 在 SW 被唤醒时会触发 `onDisconnect`，client 端需要重新连接。自动重连机制已处理此场景。
- **Firefox 兼容**：Firefox 的 `browser.runtime.connect()` API 与 Chrome 基本一致，WXT 的 polyfill 处理了差异。`JsonRpcClient` 无需特殊处理。
- **测试中的全局 mock**：`browser.runtime.connect` 需要 mock 为返回 `{ onMessage, onDisconnect, postMessage, disconnect }` 对象。`onMessage.addListener` 和 `onDisconnect.addListener` 需要记录回调以便在测试中手动触发。
- **Router 只用于 Background**：`JsonRpcRouter` 是对 `JsonRpcClient.onRequest` 的封装，专门用于 Background 端的请求路由。Chat Page 直接使用 `JsonRpcClient`。
