import type { RiskLevel, StoredMessage } from '@/shared/types';
import { reconstructToolProtocol } from '@/shared/tool-protocol';
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
 * 单次工具调用的稳定 UI ID。
 *
 * 以 assistant 消息 ID + 调用下标为基准：provider toolCallId 在同一会话里
 * 可以重复出现，用它在 React key 或 DOM id 上会导致重复气泡被合并。
 */
export function toolOccurrenceId(messageId: string, callIndex: number): string {
  return `${messageId}_tool_${callIndex}`;
}

/**
 * 将 DB 中的 StoredMessage[] 转换为 UI 层的 UIMessage[]
 *
 * 核心转换规则：
 * - user 消息 → 原样通过
 * - assistant(tool_calls) 消息 → 拆分：文本内容（如有）独立气泡，每个 tool_call 独立 tool 气泡
 * - assistant(纯文本) 消息 → 原样通过
 * - tool 消息 → 跳过（结果已配对到对应的 tool call 中）
 *
 * 配对走 #230 的 reconstructToolProtocol：那里已按「所属 assistant 行 + toolCallId」
 * 重排过消息，重复 toolCallId 的每次出现都各自带一行结果（真实结果或合成占位）。
 * 这里按出现顺序逐条消费，不再用 toolCallId 去 Map 里覆盖式匹配。
 *
 * 状态未知的占位结果只保留 result === undefined，并把 status 显式标为 unknown：
 * 不臆测成功/失败（合成占位的内容不是真实工具输出，不能解析成 error 结论）。
 */
export function storedMessagesToUIMessages(messages: StoredMessage[]): UIMessage[] {
  const { messages: ordered, syntheticUnknown } = reconstructToolProtocol(messages);
  const result: UIMessage[] = [];

  let index = 0;
  while (index < ordered.length) {
    const msg = ordered[index]!;
    index += 1;

    // 工具结果只跟随其调用渲染；重建后不应再有孤立结果
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

    const toolCalls = msg.toolCalls ?? [];

    // assistant(纯文本)
    if (toolCalls.length === 0) {
      if (msg.content) {
        result.push({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          reasoningContent: msg.reasoningContent,
          timestamp: msg.timestamp,
          status: 'complete',
        });
      }
      continue;
    }

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

    // 重建结果把每个调用的结果行紧跟在 assistant 行之后，按出现顺序消费
    const resultRows: StoredMessage[] = [];
    while (ordered[index + resultRows.length]?.role === 'tool') {
      resultRows.push(ordered[index + resultRows.length]!);
    }
    index += resultRows.length;

    toolCalls.forEach((toolCall, callIndex) => {
      const row = resultRows[callIndex];
      const id = toolOccurrenceId(msg.id, callIndex);
      const isSyntheticUnknown = !row || syntheticUnknown.has(row.id);

      let parsedResult: ToolCallDisplay['result'];
      // 合成占位不是真实结果，解析它等于把「状态未知」伪装成失败结论
      if (row && !syntheticUnknown.has(row.id)) {
        try {
          parsedResult = JSON.parse(row.content);
        } catch {
          parsedResult = { success: false, error: row.content };
        }
      }

      result.push({
        id,
        role: 'tool',
        content: toolCall.name,
        toolCallDisplay: {
          id,
          name: toolCall.name,
          params: toolCall.params,
          result: parsedResult,
          status: isSyntheticUnknown
            ? 'unknown'
            : parsedResult?.success
              ? 'success'
              : 'error',
          riskLevel: 'low' as RiskLevel,
          confirmed: true,
        },
        timestamp: msg.timestamp,
        status: 'complete',
      });
    });
  }

  return result;
}
