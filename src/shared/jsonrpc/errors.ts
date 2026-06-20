/**
 * JSON-RPC 2.0 错误对象
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** JSON-RPC 2.0 标准错误码 + 自定义错误码 */
export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TIMEOUT: -32000,
  DISCONNECTED: -32001,
  UNKNOWN: -32099,
} as const;

export type JsonRpcErrorCode = (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode];

const defaultMessages: Record<number, string> = {
  [JsonRpcErrorCode.PARSE_ERROR]: 'Parse error',
  [JsonRpcErrorCode.INVALID_REQUEST]: 'Invalid Request',
  [JsonRpcErrorCode.METHOD_NOT_FOUND]: 'Method not found',
  [JsonRpcErrorCode.INVALID_PARAMS]: 'Invalid params',
  [JsonRpcErrorCode.INTERNAL_ERROR]: 'Internal error',
  [JsonRpcErrorCode.TIMEOUT]: 'Request timeout',
  [JsonRpcErrorCode.DISCONNECTED]: 'Disconnected',
  [JsonRpcErrorCode.UNKNOWN]: 'Unknown error',
};

/**
 * 创建标准 JSON-RPC 错误对象
 */
export function createRpcError(
  code: JsonRpcErrorCode,
  message?: string,
  data?: unknown,
): JsonRpcError {
  return {
    code,
    message: message ?? defaultMessages[code] ?? 'Unknown error',
    ...(data !== undefined ? { data } : {}),
  };
}
