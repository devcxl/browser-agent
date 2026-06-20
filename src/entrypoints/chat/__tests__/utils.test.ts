import { describe, it, expect } from 'vitest';
import type { StoredMessage } from '@/shared/types';
import { storedMessageToUIMessage } from '../utils';

describe('storedMessageToUIMessage', () => {
  it('converts user message', () => {
    const stored: StoredMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'hello',
      timestamp: 1000,
    };
    const ui = storedMessageToUIMessage(stored);
    expect(ui.id).toBe('msg-1');
    expect(ui.role).toBe('user');
    expect(ui.content).toBe('hello');
    expect(ui.timestamp).toBe(1000);
    expect(ui.status).toBe('complete');
    expect(ui.toolCalls).toBeUndefined();
  });

  it('converts assistant message with tool calls', () => {
    const stored: StoredMessage = {
      id: 'msg-2',
      role: 'assistant',
      content: 'let me check',
      timestamp: 2000,
      toolCalls: [
        { id: 'tc-1', name: 'tabs_query', params: { url: 'example.com' }, result: 'found 2 tabs' },
      ],
    };
    const ui = storedMessageToUIMessage(stored);
    expect(ui.role).toBe('assistant');
    expect(ui.status).toBe('complete');
    expect(ui.toolCalls).toHaveLength(1);
    expect(ui.toolCalls![0]!.id).toBe('tc-1');
    expect(ui.toolCalls![0]!.name).toBe('tabs_query');
    expect(ui.toolCalls![0]!.params).toEqual({ url: 'example.com' });
    // result 是 string，无法还原为 ToolResult，应为 undefined
    expect(ui.toolCalls![0]!.result).toBeUndefined();
    expect(ui.toolCalls![0]!.status).toBe('success');
    expect(ui.toolCalls![0]!.riskLevel).toBe('low');
    expect(ui.toolCalls![0]!.confirmed).toBe(true);
  });

  it('converts assistant message without tool calls', () => {
    const stored: StoredMessage = {
      id: 'msg-3',
      role: 'assistant',
      content: 'plain response',
      timestamp: 3000,
    };
    const ui = storedMessageToUIMessage(stored);
    expect(ui.role).toBe('assistant');
    expect(ui.toolCalls).toBeUndefined();
    expect(ui.status).toBe('complete');
  });

  it('converts tool role message', () => {
    const stored: StoredMessage = {
      id: 'msg-4',
      role: 'tool',
      content: '{"result": "done"}',
      toolCallId: 'tc-1',
      timestamp: 4000,
    };
    const ui = storedMessageToUIMessage(stored);
    expect(ui.role).toBe('tool');
    expect(ui.content).toBe('{"result": "done"}');
    expect(ui.status).toBe('complete');
    // UIMessage 没有 toolCallId 字段，但不应该报错
  });

  it('handles empty toolCalls array', () => {
    const stored: StoredMessage = {
      id: 'msg-5',
      role: 'assistant',
      content: '',
      timestamp: 5000,
      toolCalls: [],
    };
    const ui = storedMessageToUIMessage(stored);
    // 空数组应转为 undefined，避免渲染空 toolCalls
    expect(ui.toolCalls).toBeUndefined();
  });

  it('preserves reasoningContent as undefined', () => {
    const stored: StoredMessage = {
      id: 'msg-6',
      role: 'assistant',
      content: 'no reasoning',
      timestamp: 6000,
    };
    const ui = storedMessageToUIMessage(stored);
    expect(ui.reasoningContent).toBeUndefined();
  });
});
