import { describe, it, expect } from 'vitest';
import { reconstructToolProtocol } from '../tool-protocol';
import type { StoredMessage } from '../types/conversation';

function user(id: string, content = id): StoredMessage {
  return { id, role: 'user', content };
}

function assistant(id: string, callIds: string[]): StoredMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    toolCalls: callIds.map((callId) => ({
      id: callId,
      name: 'tabs_query',
      params: { callId },
    })),
  };
}

function toolResult(
  id: string,
  toolCallId: string,
  content: string,
  parentMessageId?: string,
): StoredMessage {
  return {
    id,
    role: 'tool',
    content,
    toolCallId,
    ...(parentMessageId ? { parentMessageId } : {}),
  };
}

describe('reconstructToolProtocol 可见窗口（#233）', () => {
  it('无选项时行为与旧实现一致：结果按调用顺序跟随，缺失结果合成占位，孤立结果排除', () => {
    const messages: StoredMessage[] = [
      assistant('a1', ['call_1', 'call_2']),
      toolResult('r1', 'call_1', '真实结果一', 'a1'),
      toolResult('orphan', 'call_orphan', '孤立结果'),
    ];

    const { messages: rebuilt, syntheticUnknown } = reconstructToolProtocol(messages);

    expect(rebuilt).toHaveLength(3);
    expect(rebuilt[0]).toMatchObject({
      id: 'a1',
      role: 'assistant',
      toolCalls: [
        { id: 'call_1', name: 'tabs_query' },
        { id: 'call_2', name: 'tabs_query' },
      ],
    });
    expect(rebuilt[1]).toMatchObject({
      id: 'r1',
      role: 'tool',
      content: '真实结果一',
      toolCallId: 'call_1',
    });
    expect(rebuilt[2]).toMatchObject({
      id: 'unknown-result-call_2',
      role: 'tool',
      toolCallId: 'call_2',
    });
    expect(rebuilt[2]!.content.length).toBeGreaterThan(0);
    expect([...syntheticUnknown]).toEqual(['unknown-result-call_2']);
  });

  it('B1：结果行物理位置在用户 cutoff 之前、父 assistant 在 cutoff 之后时，真实结果仍随父行返回', () => {
    const messages: StoredMessage[] = [
      toolResult('r-early', 'call_a', '真实结果', 'a-late'),
      user('u-cut'),
      assistant('a-late', ['call_a']),
    ];

    const { messages: rebuilt, syntheticUnknown } = reconstructToolProtocol(messages, {
      visibleFrom: 1,
      visibleUntil: messages.length,
    });

    expect(rebuilt.map((message) => message.id)).toEqual(['u-cut', 'a-late', 'r-early']);
    expect(rebuilt[2]).toMatchObject({
      role: 'tool',
      content: '真实结果',
      toolCallId: 'call_a',
    });
    expect(syntheticUnknown.size).toBe(0);
  });

  it('B2：旧行重复 ID 的歧义按完整输入判定，窗口内的 assistant 只能拿到状态未知', () => {
    const messages: StoredMessage[] = [
      assistant('a-old', ['dup']),
      toolResult('r-legacy', 'dup', '真实结果'),
      assistant('a-new', ['dup']),
      user('u-new'),
    ];

    const { messages: rebuilt, syntheticUnknown } = reconstructToolProtocol(messages, {
      visibleFrom: 2,
      visibleUntil: messages.length,
    });

    const assistantMessage = rebuilt.find((message) => message.id === 'a-new');
    const resultMessage = rebuilt.find((message) => message.role === 'tool');

    expect(assistantMessage?.toolCalls?.[0]?.id).toBe('dup_replay_2');
    expect(resultMessage).toMatchObject({
      role: 'tool',
      id: 'unknown-result-dup_replay_2',
      toolCallId: 'dup_replay_2',
    });
    expect(resultMessage?.content).not.toBe('真实结果');
    expect(rebuilt.map((message) => message.id)).not.toContain('r-legacy');
    expect([...syntheticUnknown]).toEqual(['unknown-result-dup_replay_2']);
  });

  it('反向边界：父行在 cutoff 之前、结果行在之后时，摘要侧含结果、保留侧不含', () => {
    const messages: StoredMessage[] = [
      assistant('a-summary', ['call_s']),
      toolResult('r-after', 'call_s', '结果', 'a-summary'),
      user('u-new'),
    ];

    const summarySide = reconstructToolProtocol(messages, { visibleFrom: 0, visibleUntil: 2 });
    expect(summarySide.messages.map((message) => message.id)).toEqual(['a-summary', 'r-after']);
    expect(summarySide.messages[1]).toMatchObject({ content: '结果', toolCallId: 'call_s' });
    expect(summarySide.syntheticUnknown.size).toBe(0);

    const retainedSide = reconstructToolProtocol(messages, {
      visibleFrom: 2,
      visibleUntil: messages.length,
    });
    expect(retainedSide.messages.map((message) => message.id)).toEqual(['u-new']);
    expect(retainedSide.syntheticUnknown.size).toBe(0);
  });

  it('父行不可见时，即使结果行落在可见窗口内也不返回', () => {
    const messages: StoredMessage[] = [
      assistant('a-excluded', ['call_x']),
      toolResult('r-visible', 'call_x', '结果', 'a-excluded'),
      user('u'),
    ];

    const { messages: rebuilt, syntheticUnknown } = reconstructToolProtocol(messages, {
      visibleFrom: 1,
      visibleUntil: messages.length,
    });

    expect(rebuilt.map((message) => message.id)).toEqual(['u']);
    expect(syntheticUnknown.size).toBe(0);
  });

  it('重复读取结果确定：重命名 ID 与窗口无关，多次调用完全一致', () => {
    const messages: StoredMessage[] = [
      assistant('a-old', ['dup']),
      toolResult('r-legacy', 'dup', '真实结果'),
      assistant('a-new', ['dup']),
      user('u-new'),
    ];

    const first = reconstructToolProtocol(messages, { visibleFrom: 2, visibleUntil: 4 });
    const second = reconstructToolProtocol(messages, { visibleFrom: 2, visibleUntil: 4 });
    expect(second.messages).toEqual(first.messages);
    expect([...second.syntheticUnknown]).toEqual([...first.syntheticUnknown]);

    // 重命名在整个输入上分配，窗口只决定输出子集
    const full = reconstructToolProtocol(messages);
    expect(full.messages.find((message) => message.id === 'a-new')?.toolCalls?.[0]?.id)
      .toBe('dup_replay_2');
    expect(first.messages.find((message) => message.id === 'a-new')?.toolCalls?.[0]?.id)
      .toBe('dup_replay_2');
  });

  it('多个结果按调用顺序跟随，相邻混合消息不被打乱', () => {
    const messages: StoredMessage[] = [
      user('u0'),
      assistant('a1', ['c1', 'c2']),
      toolResult('r2', 'c2', '结果二', 'a1'),
      toolResult('r1', 'c1', '结果一', 'a1'),
      user('u4'),
      assistant('a5', ['c5']),
      toolResult('r5', 'c5', '结果五', 'a5'),
    ];

    const leading = reconstructToolProtocol(messages, { visibleFrom: 0, visibleUntil: 5 });
    expect(leading.messages.map((message) => message.id)).toEqual(['u0', 'a1', 'r1', 'r2', 'u4']);
    expect(leading.syntheticUnknown.size).toBe(0);

    const trailing = reconstructToolProtocol(messages, {
      visibleFrom: 4,
      visibleUntil: messages.length,
    });
    expect(trailing.messages.map((message) => message.id)).toEqual(['u4', 'a5', 'r5']);
    expect(trailing.syntheticUnknown.size).toBe(0);
  });

  it('窗口边界被安全收敛：越界/负值/倒置区间都不会抛错或泄漏消息', () => {
    const messages: StoredMessage[] = [
      user('u0'),
      assistant('a1', ['c1']),
      toolResult('r1', 'c1', '结果', 'a1'),
    ];

    expect(reconstructToolProtocol(messages, { visibleFrom: 10 }).messages).toEqual([]);
    expect(reconstructToolProtocol(messages, { visibleFrom: -5 }).messages.map((m) => m.id))
      .toEqual(['u0', 'a1', 'r1']);
    expect(reconstructToolProtocol(messages, { visibleFrom: 2, visibleUntil: 1 }).messages)
      .toEqual([]);
    expect(reconstructToolProtocol(messages, { visibleUntil: 99 }).messages.map((m) => m.id))
      .toEqual(['u0', 'a1', 'r1']);
  });
});
