/**
 * 悬浮球 iframe 与外层之间的消息协议常量与类型。
 *
 * 收发两侧（sidepanel / content script）共用同一份定义，避免协议标识与
 * 消息形状在多个文件里各写一遍、改动时漏改。
 */

import type { WidgetStatusReason } from '@/shared/types';

/** 消息来源标识：接收端据此过滤非本扩展的消息 */
export const WIDGET_MESSAGE_SOURCE = 'ba-floating-widget';

/** iframe → 外层：请求关闭面板 */
export interface CloseRequestMessage {
  source: typeof WIDGET_MESSAGE_SOURCE;
  type: 'close-request';
}

/** iframe → 外层：同步 agent 状态，驱动悬浮球表情 */
export interface StatusMessage {
  source: typeof WIDGET_MESSAGE_SOURCE;
  type: 'status';
  state: string;
  /** 仅 idle 转换携带；缺省时接收端按正常完成处理（向后兼容旧发送端） */
  reason?: WidgetStatusReason;
}

export type WidgetMessage = CloseRequestMessage | StatusMessage;
