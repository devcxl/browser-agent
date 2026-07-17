import type { RiskLevel, StoredMessage } from '@/shared/types';
import type { UIMessage, ToolCallDisplay } from './types';

/** 安全转义文本（用于 textContent 设置时的二次确认） */
export function sanitizeText(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** 格式化时间戳为 HH:mm */
export function formatTime(ts: number, locale: string = 'zh-CN'): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/** 格式化日期时间 */
export function formatDateTime(ts: number, locale: string = 'zh-CN'): string {
  const d = new Date(ts);
  return d.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 格式化数字（千位分隔） */
export function formatNum(n: number, locale: string = 'zh-CN'): string {
  return n.toLocaleString(locale);
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
    default:
      return 'text-gray-600 border-gray-300';
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
 * 将 DB 中的 StoredMessage[] 转换为 UI 层的 UIMessage[]
 *
 * 核心转换规则：
 * - user 消息 → 原样通过
 * - assistant(tool_calls) 消息 → 拆分：文本内容（如有）独立气泡，每个 tool_call 独立 tool 气泡
 * - assistant(纯文本) 消息 → 原样通过
 * - tool 消息 → 跳过（结果已配对到对应的 tool call 中）
 */
export function storedMessagesToUIMessages(messages: StoredMessage[]): UIMessage[] {
  const result: UIMessage[] = [];

  // 第一趟：建立 toolCallId → tool result JSON 的映射
  const toolResults = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === 'tool' && msg.toolCallId) {
      toolResults.set(msg.toolCallId, msg.content);
    }
  }

  for (const msg of messages) {
    if (msg.role === 'tool') continue;

    if (msg.role === 'user') {
      result.push({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        status: 'complete',
      });
      continue;
    }

    // assistant
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      // 如有文本内容，先输出纯文本气泡
      if (msg.content) {
        result.push({
          id: msg.id + '_text',
          role: 'assistant',
          content: msg.content,
          reasoningContent: msg.reasoningContent,
          timestamp: msg.timestamp,
          status: 'complete',
        });
      }

      for (const tc of msg.toolCalls) {
        const rawResult = toolResults.get(tc.id);
        let parsedResult: ToolCallDisplay['result'];
        if (rawResult) {
          try {
            parsedResult = JSON.parse(rawResult);
          } catch {
            parsedResult = { success: false, error: rawResult };
          }
        }

        result.push({
          id: tc.id,
          role: 'tool',
          content: tc.name,
          toolCallDisplay: {
            id: tc.id,
            name: tc.name,
            params: tc.params,
            result: parsedResult,
            status: parsedResult?.success ? 'success' : 'error',
            riskLevel: 'low' as RiskLevel,
            confirmed: true,
          },
          timestamp: msg.timestamp,
          status: 'complete',
        });
      }
    } else if (msg.content) {
      result.push({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        reasoningContent: msg.reasoningContent,
        timestamp: msg.timestamp,
        status: 'complete',
      });
    }
  }

  return result;
}
