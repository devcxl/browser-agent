import { describe, it, expect } from 'vitest';
import { createRpcError, JsonRpcErrorCode } from '../errors';

describe('createRpcError', () => {
  it('should create error with code and default message', () => {
    const err = createRpcError(JsonRpcErrorCode.METHOD_NOT_FOUND);
    expect(err.code).toBe(-32601);
    expect(err.message).toBe('Method not found');
    expect(err.data).toBeUndefined();
  });

  it('should create error with custom message', () => {
    const err = createRpcError(JsonRpcErrorCode.INTERNAL_ERROR, 'Custom message');
    expect(err.code).toBe(-32603);
    expect(err.message).toBe('Custom message');
  });

  it('should create error with data', () => {
    const err = createRpcError(JsonRpcErrorCode.PARSE_ERROR, undefined, { detail: 'bad json' });
    expect(err.code).toBe(-32700);
    expect(err.message).toBe('Parse error');
    expect(err.data).toEqual({ detail: 'bad json' });
  });

  it('should handle unknown error code', () => {
    const err = createRpcError(-99999 as never);
    expect(err.message).toBe('Unknown error');
  });

  it('should provide default messages for all known codes', () => {
    for (const code of Object.values(JsonRpcErrorCode)) {
      const err = createRpcError(code);
      expect(err.code).toBe(code);
      expect(err.message).toBeTruthy();
    }
  });

  it('should not include data when undefined', () => {
    const err = createRpcError(JsonRpcErrorCode.TIMEOUT, 'timeout');
    expect(err).not.toHaveProperty('data');
  });
});
