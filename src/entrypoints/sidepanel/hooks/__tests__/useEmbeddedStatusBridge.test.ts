import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createStatusMessage, useEmbeddedStatusBridge } from '../useEmbeddedStatusBridge';
import type { AgentStatus } from '../../types';

describe('createStatusMessage', () => {
  it('构造完整的 status 协议消息', () => {
    expect(createStatusMessage('running')).toEqual({
      source: 'ba-floating-widget',
      type: 'status',
      state: 'running',
    });
  });

  it('idle 时可附加结束原因', () => {
    expect(createStatusMessage('idle', 'error')).toEqual({
      source: 'ba-floating-widget',
      type: 'status',
      state: 'idle',
      reason: 'error',
    });
  });
});

describe('useEmbeddedStatusBridge', () => {
  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // jsdom 中 window.parent === window；直接观察发往外层的调用
    postSpy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  it('嵌入模式挂载时立即发送初始状态', () => {
    renderHook(() => useEmbeddedStatusBridge(true, 'idle'));

    expect(postSpy).toHaveBeenCalledOnce();
    expect(postSpy).toHaveBeenCalledWith(
      { source: 'ba-floating-widget', type: 'status', state: 'idle' },
      '*',
    );
  });

  it('嵌入模式下状态变化时再次发送', () => {
    const { rerender } = renderHook(
      ({ status }: { status: AgentStatus }) => useEmbeddedStatusBridge(true, status),
      { initialProps: { status: 'idle' as AgentStatus } },
    );

    rerender({ status: 'running' });
    rerender({ status: 'waitingConfirmation' });

    expect(postSpy).toHaveBeenCalledTimes(3);
    expect(postSpy).toHaveBeenNthCalledWith(
      2,
      { source: 'ba-floating-widget', type: 'status', state: 'running' },
      '*',
    );
    expect(postSpy).toHaveBeenNthCalledWith(
      3,
      { source: 'ba-floating-widget', type: 'status', state: 'waitingConfirmation' },
      '*',
    );
  });

  it('idle 转换时把 ending reason 发给外层', () => {
    renderHook(() => useEmbeddedStatusBridge(true, 'idle', 'abort'));

    expect(postSpy).toHaveBeenCalledWith(
      { source: 'ba-floating-widget', type: 'status', state: 'idle', reason: 'abort' },
      '*',
    );
  });

  it('非 idle 状态不携带 reason（协议只约束 idle 转换）', () => {
    renderHook(() => useEmbeddedStatusBridge(true, 'running', 'complete'));

    expect(postSpy).toHaveBeenCalledWith(
      { source: 'ba-floating-widget', type: 'status', state: 'running' },
      '*',
    );
  });

  it('非嵌入模式不发送任何消息', () => {
    const { rerender } = renderHook(
      ({ status }: { status: AgentStatus }) => useEmbeddedStatusBridge(false, status),
      { initialProps: { status: 'idle' as AgentStatus } },
    );

    rerender({ status: 'streaming' });

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('状态未变化时不重复发送', () => {
    const { rerender } = renderHook(
      ({ status }: { status: AgentStatus }) => useEmbeddedStatusBridge(true, status),
      { initialProps: { status: 'streaming' as AgentStatus } },
    );

    rerender({ status: 'streaming' });

    expect(postSpy).toHaveBeenCalledOnce();
  });
});
