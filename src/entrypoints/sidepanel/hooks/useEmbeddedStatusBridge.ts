import { useEffect } from 'react';
import type { WidgetStatusReason } from '@/shared/types';
import type { AgentStatus } from '../types';

/** 与 panel.ts 接收端约定的协议标识 */
const WIDGET_MESSAGE_SOURCE = 'ba-floating-widget';

export interface WidgetStatusMessage {
  source: typeof WIDGET_MESSAGE_SOURCE;
  type: 'status';
  state: AgentStatus;
  /** 仅 idle 转换携带；缺省时接收端按 complete 处理（向后兼容） */
  reason?: WidgetStatusReason;
}

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
