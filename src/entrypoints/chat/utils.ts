import type { RiskLevel, StoredMessage } from '@/shared/types';
import type { UIMessage, ToolCallDisplay } from './types';

/** 安全转义文本（用于 textContent 设置时的二次确认） */
export function sanitizeText(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** 格式化时间戳为 HH:mm */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/** 格式化日期时间 */
export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 条件 class 合并 */
export function cn(
  ...classes: (string | false | undefined | null)[]
): string {
  return classes.filter(Boolean).join(' ');
}

/** 风险等级 → 颜色映射 */
export function riskColor(level: RiskLevel): string {
  switch (level) {
    case 'low':
      return 'text-green-600 border-green-300';
    case 'medium':
      return 'text-yellow-600 border-yellow-300';
    case 'high':
      return 'text-orange-600 border-orange-400';
    case 'critical':
      return 'text-red-600 border-red-400';
  }
}

/** 截断文本到指定长度 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

/** 生成唯一 ID */
export function uid(): string {
  return crypto.randomUUID();
}

/**
 * 将 StoredMessage 转换为 UIMessage
 *
 * 历史消息的 toolCalls 一律按已确认、低风险、成功状态处理。
 * result 是 string 摘要，无法还原为 ToolResult，故设为 undefined。
 */
export function storedMessageToUIMessage(msg: StoredMessage): UIMessage {
  const toolCalls: ToolCallDisplay[] | undefined = msg.toolCalls?.length
    ? msg.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        params: tc.params,
        result: undefined,
        status: 'success' as const,
        riskLevel: 'low' as RiskLevel,
        confirmed: true,
      }))
    : undefined;

  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    status: 'complete',
    toolCalls,
  };
}
