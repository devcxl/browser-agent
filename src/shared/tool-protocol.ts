import type { StoredMessage } from './types/conversation';

/**
 * 工具调用历史 → 模型协议的纯函数重建（#230）。
 *
 * 存储顺序不可信：IndexedDB 的 [conversationId, timestamp] 索引在同一毫秒内
 * 按主键升序返回，而主键对新行是随机 UUID。重建只依赖行之间的显式关联：
 * - 新行优先用 parentMessageId + toolCallId 配对（不看时间戳）；
 * - 旧行没有 parentMessageId，仅在归属可确定时按 toolCallId 配对；
 * - 同一 toolCallId 出现多次且只剩未关联的旧结果时，归属不明，宁可标记
 *   「状态未知」也不把结果挂到可能有副作用的错误调用上；
 * - 同一 parent 内重复 toolCallId 无额外索引可区分，同样按未知处理；
 * - 找不到任何调用的孤立结果继续排除。
 *
 * 重复 toolCallId 在模型侧按出现顺序确定性重命名（首个保留原 ID，后续追加
 * 后缀），只影响本次请求的副本，不改写持久化的 toolCallId 或参数。
 *
 * 结果里同时返回 syntheticUnknown（合成占位的消息 ID 集合），供 UI（#231）
 * 区分真实结果与仅模型可见的占位；占位绝不写回数据库。
 */

/**
 * 结果真实缺失时给模型看的唯一状态说明。
 *
 * 不臆测成功/失败（可能已产生副作用），也不暗示可以直接重试；
 * 只用于本次请求的消息上下文，绝不写回会话历史。
 */
export const UNKNOWN_TOOL_RESULT_CONTENT =
  '执行状态未知：这次工具调用的结果没有保存，无法确认是否已执行。'
  + '它可能已经执行并对浏览器产生了副作用；请先核实当前页面或标签页状态，不要自动重试。';

export interface ReconstructedToolProtocol {
  /** 按 assistant tool-call → tool-result 顺序重排后的消息，可直接转模型消息 */
  messages: StoredMessage[];
  /** 本次请求内存态合成的「状态未知」消息 ID；不得写入数据库或当真实结果显示 */
  syntheticUnknown: ReadonlySet<string>;
}

type ToolCall = NonNullable<StoredMessage['toolCalls']>[number];
type ToolResultMessage = StoredMessage & { role: 'tool'; toolCallId: string };

interface CallOccurrence {
  message: StoredMessage;
  call: ToolCall;
  modelCallId: string;
}

const LINK_KEY_SEPARATOR = '\u0000';

function linkKey(parentMessageId: string, toolCallId: string): string {
  return `${parentMessageId}${LINK_KEY_SEPARATOR}${toolCallId}`;
}

function addToBucket<T>(map: Map<string, T[]>, key: string, value: T): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

export function reconstructToolProtocol(
  messages: readonly StoredMessage[],
): ReconstructedToolProtocol {
  // 先登记所有持久化 ID，保证模型侧重命名不会与真实 ID 撞车（确定性）
  const usedModelIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const call of message.toolCalls ?? []) usedModelIds.add(call.id);
  }

  const nextOrdinal = new Map<string, number>();
  const occurrencesByMessage = new Map<StoredMessage, CallOccurrence[]>();
  const occurrencesByCallId = new Map<string, CallOccurrence[]>();
  const occurrencesByLinkKey = new Map<string, CallOccurrence[]>();
  const allOccurrences: CallOccurrence[] = [];

  const nextModelCallId = (callId: string): string => {
    const ordinal = (nextOrdinal.get(callId) ?? 0) + 1;
    nextOrdinal.set(callId, ordinal);
    if (ordinal === 1) return callId;

    // provider 对 tool call ID 的字符限制不完全一致：只用下划线/字母数字，
    // 避开 # 等标点；候选与任何原始 ID 冲突时继续追加数字后缀。
    let candidate = `${callId}_replay_${ordinal}`;
    let suffix = 2;
    while (usedModelIds.has(candidate)) {
      candidate = `${callId}_replay_${ordinal}_${suffix}`;
      suffix += 1;
    }
    usedModelIds.add(candidate);
    return candidate;
  };

  // 调用按存储顺序（与主键顺序一致）登记，重命名因此可重复复现
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.toolCalls?.length) continue;
    const occurrences: CallOccurrence[] = [];
    for (const call of message.toolCalls) {
      const occurrence: CallOccurrence = {
        message,
        call,
        modelCallId: nextModelCallId(call.id),
      };
      occurrences.push(occurrence);
      allOccurrences.push(occurrence);
      addToBucket(occurrencesByCallId, call.id, occurrence);
      addToBucket(occurrencesByLinkKey, linkKey(message.id, call.id), occurrence);
    }
    occurrencesByMessage.set(message, occurrences);
  }

  const linkedResults = new Map<string, ToolResultMessage[]>();
  const legacyResults = new Map<string, ToolResultMessage[]>();
  for (const message of messages) {
    if (message.role !== 'tool' || !message.toolCallId) continue;
    const result = message as ToolResultMessage;
    if (message.parentMessageId) {
      addToBucket(linkedResults, linkKey(message.parentMessageId, message.toolCallId), result);
    } else {
      addToBucket(legacyResults, message.toolCallId, result);
    }
  }

  const pairedResultByOccurrence = new Map<CallOccurrence, ToolResultMessage>();
  const consumedResultIds = new Set<string>();

  for (const occurrence of allOccurrences) {
    const key = linkKey(occurrence.message.id, occurrence.call.id);
    const linked = linkedResults.get(key) ?? [];

    if (linked.length > 0) {
      // 同一 assistant 行内重复 call id 时没有额外索引可区分结果归属
      const sameParentOccurrences = occurrencesByLinkKey.get(key)?.length ?? 0;
      if (sameParentOccurrences === 1 && linked.length === 1) {
        const result = linked[0]!;
        if (!consumedResultIds.has(result.id)) {
          pairedResultByOccurrence.set(occurrence, result);
          consumedResultIds.add(result.id);
        }
      }
      continue;
    }

    const legacy = legacyResults.get(occurrence.call.id) ?? [];
    if (legacy.length === 0) continue;

    // 旧数据只能按 toolCallId 关联；同一 ID 出现多次时唯一存活的行无法确定归属
    const totalOccurrences = occurrencesByCallId.get(occurrence.call.id)?.length ?? 0;
    if (totalOccurrences === 1 && legacy.length === 1) {
      const result = legacy[0]!;
      if (!consumedResultIds.has(result.id)) {
        pairedResultByOccurrence.set(occurrence, result);
        consumedResultIds.add(result.id);
      }
    }
  }

  const rebuilt: StoredMessage[] = [];
  const syntheticUnknown = new Set<string>();

  for (const message of messages) {
    // 工具结果统一跟随其调用输出，避免结果行出现在调用之前
    if (message.role === 'tool') continue;

    const occurrences = occurrencesByMessage.get(message);
    rebuilt.push(occurrences?.length
      ? {
        ...message,
        toolCalls: message.toolCalls!.map((call, index) => ({
          ...call,
          id: occurrences[index]!.modelCallId,
        })),
      }
      : message);

    if (!occurrences?.length) continue;

    for (const occurrence of occurrences) {
      const result = pairedResultByOccurrence.get(occurrence);
      if (result) {
        rebuilt.push({ ...result, toolCallId: occurrence.modelCallId });
        continue;
      }

      const syntheticId = `unknown-result-${occurrence.modelCallId}`;
      syntheticUnknown.add(syntheticId);
      rebuilt.push({
        id: syntheticId,
        role: 'tool',
        content: UNKNOWN_TOOL_RESULT_CONTENT,
        toolCallId: occurrence.modelCallId,
      });
    }
  }

  return { messages: rebuilt, syntheticUnknown };
}
