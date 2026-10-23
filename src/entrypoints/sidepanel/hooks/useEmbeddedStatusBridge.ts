import { useEffect } from 'react';
import type { WidgetStatusReason } from '@/shared/types';
import { WIDGET_MESSAGE_SOURCE, type StatusMessage } from '@/shared/widget-protocol';
import type { AgentStatus } from '../types';

export type WidgetStatusMessage = StatusMessage;

/** 构造 status 消息：独立纯函数，便于单测且保证消息形状只有一处定义 */
export function createStatusMessage(
  state: AgentStatus,
  reason?: WidgetStatusReason,
): WidgetStatusMessage {
  return reason
    ? { source: WIDGET_MESSAGE_SOURCE, type: 'status', state, reason }
    : { source: WIDGET_MESSAGE_SOURCE, type: 'status', state };
}

/**
 * 嵌入模式下把 agent 状态同步给外层悬浮球。
 *
 * 初始状态也要发送：外层可能晚于 iframe 挂载开始监听，只发变化会让
 * 外层长时间停留在错误的默认状态。非嵌入模式没有外层监听者，不广播。
 *
 * reason 只在 idle 时发送，供外层区分正常完成（celebrate）与出错/中止（直接复位）。
 */
export function useEmbeddedStatusBridge(
  isEmbedded: boolean,
  status: AgentStatus,
  idleReason?: WidgetStatusReason,
): void {
  useEffect(() => {
    if (!isEmbedded) return;
    const reason = status === 'idle' ? idleReason : undefined;
    window.parent.postMessage(createStatusMessage(status, reason), '*');
  }, [isEmbedded, status, idleReason]);
}
