import type { StoredMessage } from '@/shared/types/conversation';
import { estimateTokens } from '@/shared/token-estimate';

const SUMMARY_TRIGGER_RATIO = 0.75;
const SUMMARY_TARGET_RATIO = 0.1;

export function calculateContextBudget(
  contextWindowTokens: number,
  maxOutputTokens: number,
  safetyMargin: number,
) {
  const usableTokens = Math.max(1, contextWindowTokens - Math.max(maxOutputTokens, safetyMargin));
  return {
    usableTokens,
    triggerTokens: Math.floor(usableTokens * SUMMARY_TRIGGER_RATIO),
    targetTokens: Math.floor(usableTokens * SUMMARY_TARGET_RATIO),
  };
}

export function estimateStoredMessagesTokens(messages: StoredMessage[]): number {
  return estimateTokens(JSON.stringify(messages));
}

export function selectSummaryCutoff(
  messages: StoredMessage[],
  startIndex: number,
  targetTokens: number,
  recentTurnsToKeep: number,
): number | null {
  const userIndexes = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message, index }) => message.role === 'user' && index >= startIndex)
    .map(({ index }) => index);

  if (userIndexes.length <= recentTurnsToKeep) return null;

  const latestCutoff = userIndexes[userIndexes.length - recentTurnsToKeep]!;
  for (const cutoff of userIndexes) {
    if (cutoff <= startIndex) continue;
    if (cutoff > latestCutoff) break;
    if (estimateStoredMessagesTokens(messages.slice(cutoff)) <= targetTokens) {
      return cutoff;
    }
  }

  return latestCutoff > startIndex ? latestCutoff : null;
}

function formatMessage(message: StoredMessage): string {
  const toolCalls = message.toolCalls?.map((call) => (
    `${call.name}(${JSON.stringify(call.params)})`
  )).join(', ');
  const metadata = [
    toolCalls ? `tool_calls=${toolCalls}` : '',
    message.toolCallId ? `tool_call_id=${message.toolCallId}` : '',
  ].filter(Boolean).join(' ');
  return `[${message.role}${metadata ? ` ${metadata}` : ''}]: ${message.content}`;
}

export function buildSummaryPrompt(messages: StoredMessage[], existingSummary?: string): string {
  return `压缩以下浏览器助手会话，并输出可直接作为后续上下文使用的中文摘要。

必须保留：
- 用户目标、约束、偏好和明确决策
- 已执行工具的名称、关键参数、成功或失败结果
- 标签页、窗口、分组相关的 URL、标题、顺序、标识符和状态变化
- 未完成事项及后续操作所需事实

不要编造，不要省略可能影响后续恢复或反向操作的信息。

## 已有摘要
${existingSummary || '(无)'}

## 待压缩会话
${messages.map(formatMessage).join('\n')}`;
}
