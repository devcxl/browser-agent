import { describe, it, expect } from 'vitest';
import { renderConversationMarkdown } from '../data-transfer';
import type { Conversation, StoredMessage } from '../types/conversation';

function conv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    title: '测试会话',
    titleGenerated: true,
    createdAt: 0,
    updatedAt: 0,
    messages: [],
    summary: undefined,
    summaryUpToIndex: 0,
    sensitiveDataGranted: false,
    ...overrides,
  };
}

function msg(overrides: Partial<StoredMessage>): StoredMessage {
  return { id: 'm', role: 'user', content: '', timestamp: 0, ...overrides };
}

describe('renderConversationMarkdown', () => {
  it('仅渲染用户与助手文本，不输出工具调用/结果', () => {
    const messages: StoredMessage[] = [
      msg({ id: '1', role: 'user', content: '帮我整理标签页' }),
      msg({
        id: '2',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'tc1', name: 'tab_search', params: { keyword: 'github' } }],
      }),
      msg({ id: '3', role: 'tool', toolCallId: 'tc1', content: '{"success":true}' }),
      msg({ id: '4', role: 'assistant', content: '已整理完成' }),
    ];

    const md = renderConversationMarkdown(conv(), messages);

    expect(md).toContain('帮我整理标签页');
    expect(md).toContain('已整理完成');
    expect(md).not.toContain('tab_search');
    expect(md).not.toContain('工具调用');
    expect(md).not.toContain('工具结果');
    expect(md).not.toContain('```json');
  });

  it('空内容助手行（纯工具步骤）不产生空段落', () => {
    const messages: StoredMessage[] = [
      msg({ id: '1', role: 'user', content: '问题' }),
      msg({ id: '2', role: 'assistant', content: '', toolCalls: [{ id: 't', name: 'x', params: {} }] }),
      msg({ id: '3', role: 'tool', toolCallId: 't', content: '{}' }),
      msg({ id: '4', role: 'assistant', content: '答案' }),
    ];

    const md = renderConversationMarkdown(conv(), messages);

    // 用户与最终答案各一段，中间工具步骤不产生空助手段
    expect(md.match(/\*\*🤖 助手\*\*/g)).toHaveLength(1);
  });

  it('无任何文本时给出说明而不是空壳', () => {
    const messages: StoredMessage[] = [
      msg({ id: '1', role: 'assistant', content: '', toolCalls: [{ id: 't', name: 'x', params: {} }] }),
      msg({ id: '2', role: 'tool', toolCallId: 't', content: '{}' }),
    ];

    const md = renderConversationMarkdown(conv(), messages);
    expect(md).toContain('无可展示的文本内容');
  });

  it('包含会话摘要（如有）', () => {
    const md = renderConversationMarkdown(conv({ summary: '早前讨论了标签页整理' }), [
      msg({ id: '1', role: 'user', content: '继续' }),
    ]);
    expect(md).toContain('## 摘要');
    expect(md).toContain('早前讨论了标签页整理');
  });
});
