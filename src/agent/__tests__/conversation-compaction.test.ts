import { describe, expect, it } from 'vitest';
import type { StoredMessage } from '@/shared/types/conversation';
import {
  buildSummaryPrompt,
  calculateContextBudget,
  estimateStoredMessagesTokens,
  selectSummaryCutoff,
} from '../conversation-compaction';

function turn(index: number): StoredMessage[] {
  return [
    { id: `user-${index}`, role: 'user', content: `request-${index}` },
    { id: `assistant-${index}`, role: 'assistant', content: `response-${index}` },
  ];
}

describe('conversation compaction', () => {
  it('在可用输入预算 75% 触发，并以 10% 为压缩目标', () => {
    expect(calculateContextBudget(1_000_000, 32_000, 4_096)).toEqual({
      usableTokens: 968_000,
      triggerTokens: 726_000,
      targetTokens: 96_800,
    });
  });

  it('摘要截止点始终位于 user 边界并保留最近完整轮次', () => {
    const messages = Array.from({ length: 6 }, (_, index) => turn(index)).flat();

    const cutoff = selectSummaryCutoff(messages, 0, 1, 2);

    expect(cutoff).toBe(8);
    expect(messages[cutoff!]?.role).toBe('user');
    expect(messages.slice(cutoff).filter((message) => message.role === 'user')).toHaveLength(2);
  });

  it('摘要输入保留工具名称、参数与执行结果', () => {
    const messages: StoredMessage[] = [
      { id: 'user-1', role: 'user', content: '关闭重复标签页' },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'tabs_remove', params: { tabIds: [1, 2] } }],
      },
      {
        id: 'tool-1',
        role: 'tool',
        toolCallId: 'call-1',
        content: JSON.stringify({ success: true, removed: ['https://a.test', 'https://b.test'] }),
      },
    ];

    const prompt = buildSummaryPrompt(messages, '已有摘要');

    expect(prompt).toContain('tabs_remove');
    expect(prompt).toContain('"tabIds":[1,2]');
    expect(prompt).toContain('https://a.test');
    expect(prompt).toContain('已有摘要');
  });

  it('循环内较早 cutoff 即满足预算时直接返回该截止点', () => {
    // 前 4 轮内容巨大、后 2 轮短小：
    // 从最早 cutoff 开始剩余历史都超预算，直到推进到 user-4 时剩余内容才落入预算。
    const big = 'x'.repeat(2_000); // ≈ 1000+ tokens
    const messages: StoredMessage[] = [
      ...[0, 1, 2, 3].flatMap((index) => [
        { id: `big-user-${index}`, role: 'user' as const, content: big },
        { id: `big-assistant-${index}`, role: 'assistant' as const, content: big },
      ]),
      ...[4, 5].flatMap((index) => [
        { id: `small-user-${index}`, role: 'user' as const, content: `u${index}` },
        { id: `small-assistant-${index}`, role: 'assistant' as const, content: `a${index}` },
      ]),
    ];

    const cutoff = selectSummaryCutoff(messages, 0, 1_000, 2);

    // user 索引依次为 [0,2,4,6,8,10]，保留最近 2 轮 → latestCutoff = 8 (user-4)。
    // cutoff=8 时剩余仅为 2 个短轮次，token 落入预算，命中循环内的 return。
    expect(cutoff).toBe(8);
    expect(messages.slice(cutoff).filter((message) => message.role === 'user')).toHaveLength(2);
  });

  it('无足够 user 轮次可裁时返回 null', () => {
    // user 轮次数恰好等于 recentTurnsToKeep → 不该有任何裁剪
    const messages = Array.from({ length: 2 }, (_, index) => turn(index)).flat();

    expect(selectSummaryCutoff(messages, 0, 1, 2)).toBeNull();

    // user 轮次数少于 recentTurnsToKeep → 同样 null
    const fewer = [turn(0)].flat();
    expect(selectSummaryCutoff(fewer, 0, 1, 3)).toBeNull();
  });

  it('startIndex 会排除起始位置之前的 user 轮次', () => {
    // 3 轮对话，从 index 2（user-1）之后才开始可裁 → startIndex 之前的 user 不算
    const messages = Array.from({ length: 3 }, (_, index) => turn(index)).flat();
    // user 索引 [0,2,4]，recentTurnsToKeep=1，但 startIndex=4 后只剩 user-2 一个
    expect(selectSummaryCutoff(messages, 4, 1, 1)).toBeNull();

    // startIndex=3（assistant-1 之后），其后 user 索引 [4]，保留 1 → 不裁剪
    expect(selectSummaryCutoff(messages, 3, 1, 1)).toBeNull();
  });

  it('没有任何 cutoff 落入预算时返回 latestCutoff', () => {
    // 全部消息 token 都超预算 → 循环内无 return → 回退到 latestCutoff
    const big = 'x'.repeat(5_000);
    const messages = Array.from({ length: 4 }, (_, index) => turn(index))
      .flat()
      .map((m, i) => ({
        ...m,
        content: i % 2 === 0 ? big : m.content,
      }));
    // user 索引 [0,2,4,6]，保留 2 → latestCutoff = 4
    const cutoff = selectSummaryCutoff(messages, 0, 10, 2);

    expect(cutoff).toBe(4);
  });

  it('命中非末尾的 user 截止点（预算约束来自中间轮次）', () => {
    // 第 1、2 轮巨大，第 3、4 轮极小：保留 1 轮时，应裁到 user-2（index 4）
    const big = 'x'.repeat(5_000);
    const messages: StoredMessage[] = [
      ...turn(0).map((m) => ({ ...m, content: big })),
      ...turn(1).map((m) => ({ ...m, content: big })),
      ...turn(2),
      ...turn(3),
    ];
    // user 索引 [0,2,4,6]，recentTurnsToKeep=1 → latestCutoff = 6
    // slice(6) = 最后 1 轮 → token 少 → 命中。
    // 关键是正确实现应返回最早满足的 6；若 L41 误用全量估算则会错过 6 而返回 latestCutoff（同样 6）
    const cutoff = selectSummaryCutoff(messages, 0, 1, 1);

    expect(cutoff).toBe(6);
    expect(messages.slice(cutoff).filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('预算充足时从最早 user 截止点即可返回', () => {
    // target 极大 → 第一个 user cutoff（index 2）就满足
    const messages = Array.from({ length: 4 }, (_, index) => turn(index)).flat();

    expect(selectSummaryCutoff(messages, 0, 10_000, 2)).toBe(2);
  });

  it('estimateStoredMessagesTokens 随内容增长', () => {
    expect(estimateStoredMessagesTokens([])).toBe(1); // JSON.stringify([]) = '[]' → ceil(2*0.5)
    const one = turn(0);
    const emptyToken = estimateStoredMessagesTokens([]);
    expect(estimateStoredMessagesTokens(one)).toBeGreaterThan(emptyToken);
  });

  it('formatMessage 以逗号连接多个工具调用并保留 tool_call_id 元数据', () => {
    const messages: StoredMessage[] = [
      {
        id: 'a-1',
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'c1', name: 'tabs_remove', params: { tabIds: [1] } },
          { id: 'c2', name: 'windows_close', params: { id: 2 } },
        ],
        toolCallId: 'c1',
      },
    ];

    const prompt = buildSummaryPrompt(messages);
    // 两个 toolCalls 用 ', ' 连接；tool_calls 与 tool_call_id 元数据之间用空格分隔
    expect(prompt).toContain(
      'tool_calls=tabs_remove({"tabIds":[1]}), windows_close({"id":2}) tool_call_id=c1',
    );
    expect(prompt).toContain('[assistant tool_calls=');
  });

  it('无元数据消息不带多余空格（metadata 为空时不渲染）', () => {
    const messages: StoredMessage[] = [
      { id: 'u1', role: 'user', content: '你好' },
      { id: 't1', role: 'tool', toolCallId: 'c1', content: '{"ok":true}' },
    ];
    const prompt = buildSummaryPrompt(messages, undefined);

    // 每条消息独占一行（join('\n')），user 行与 tool 行之间必须有换行分隔
    expect(prompt).toContain('\n[user]: 你好\n[tool tool_call_id=c1]: {"ok":true}');
    expect(prompt).toContain('(无)');
  });

  it('startIndex 恰为 user 索引时该轮计入可裁范围', () => {
    const messages = Array.from({ length: 3 }, (_, index) => turn(index)).flat();
    // user 索引 [0,2,4]，startIndex=2（恰好是 user-1 位置）：
    // index>=2 过滤后 user [2,4]，recentTurnsToKeep=1 → latestCutoff=4
    expect(selectSummaryCutoff(messages, 2, 1, 1)).toBe(4);
  });

  it('latestCutoff 不高于 startIndex 时返回 null', () => {
    const messages = Array.from({ length: 3 }, (_, index) => turn(index)).flat();
    // user [0,2,4]，recentTurnsToKeep=1 → latestCutoff=4
    // startIndex=4 时 user [4] 只有一个 → <= keep → null；
    // 用 keep=1 + startIndex=2 情形 latestCutoff=4 > 2 非目标，改为 startIndex 超过全部 user：
    expect(selectSummaryCutoff(messages, 10, 1, 1)).toBeNull();
    // startIndex=5：过滤后无 user → 空数组 → null
    expect(selectSummaryCutoff(messages, 5, 1, 1)).toBeNull();
  });

  it('到达 latestCutoff 后不再向后的 user 轮次裁剪（break 保护保留轮）', () => {
    // 4 轮：t0/t1 中等、t2 巨大、t3 极小。user [0,2,4,6]，keep=2 → latestCutoff=4(t2)。
    // target 使 slice(t2+t3) 超预算、slice(t3) 恰好满足：正确实现到 cutoff=6 时应 break，
    // 若 break 被移除则会错误地裁到 t3（只保留 1 轮）。
    const big = 'x'.repeat(2_000);
    const messages: StoredMessage[] = [
      ...[0, 1].flatMap((index) => turn(index)),
      ...turn(2).map((m) => ({ ...m, content: big })),
      ...turn(3),
    ];

    const cutoff = selectSummaryCutoff(messages, 0, 100, 2);

    expect(cutoff).toBe(4);
    expect(messages.slice(cutoff).filter((m) => m.role === 'user')).toHaveLength(2);
  });

  it('中间 user 轮次满足预算时返回该轮而非 latestCutoff', () => {
    // 5 轮内容大小分布：轮0 巨大、轮1-2 中等、轮3-4 极小
    const huge = 'x'.repeat(10_000);
    const medium = 'm'.repeat(100);
    const tiny = 't';
    const messages: StoredMessage[] = [
      ...turn(0).map((m) => ({ ...m, content: huge })),
      ...turn(1).map((m) => ({ ...m, content: medium })),
      ...turn(2).map((m) => ({ ...m, content: medium })),
      ...[3, 4].flatMap((index) => turn(index).map((m) => ({ ...m, content: tiny }))),
    ];
    // user [0,2,4,6,8]，recentTurnsToKeep=1 → latestCutoff=8
    // slice(6)(仅 2 小轮) 满足预算 → 应返回 6（而非回退 latestCutoff=8）
    const cutoff = selectSummaryCutoff(messages, 0, 200, 1);

    expect(cutoff).toBe(6);
    expect(messages.slice(cutoff).filter((m) => m.role === 'user')).toHaveLength(2);
  });
});
