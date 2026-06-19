// ==================== JSON-RPC 2.0 核心 ====================

/** JSON-RPC 2.0 请求 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 响应 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

/** JSON-RPC 2.0 通知（无 id，不期待响应） */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 错误对象 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** JSON-RPC 消息联合类型 */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// ==================== 标准错误码 ====================

export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // 自定义
  TIMEOUT: -32000,
  DISCONNECTED: -32001,
  UNKNOWN: -32099,
} as const;

export type JsonRpcErrorCode = (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode];

// ==================== 方法处理器类型 ====================

/** JSON-RPC 方法处理器 */
export type RpcMethodHandler = (params?: Record<string, unknown>) => Promise<unknown>;

/** JSON-RPC 通知处理器 */
export type RpcNotificationHandler = (params?: Record<string, unknown>) => void;

// ==================== Client 接口 ====================

export interface IJsonRpcClient {
  /** 发送请求并等待响应，超时抛出 TIMEOUT 错误 */
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  /** 发送通知（不等待响应） */
  notify(method: string, params?: Record<string, unknown>): void;
  /** 注册方法处理器（接收对端请求） */
  onRequest(method: string, handler: RpcMethodHandler): void;
  /** 注册通知处理器 */
  onNotification(method: string, handler: RpcNotificationHandler): void;
  /** 移除方法处理器 */
  offRequest(method: string): void;
  /** 移除通知处理器 */
  offNotification(method: string): void;
  /** 断开连接 */
  disconnect(): void;
  /** 连接状态 */
  readonly connected: boolean;
}
