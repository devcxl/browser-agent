import { describe, expect, it } from 'vitest';
import type { StoredMessage } from '@/shared/types/conversation';
import {
  buildSummaryPrompt,
  calculateContextBudget,
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
});
