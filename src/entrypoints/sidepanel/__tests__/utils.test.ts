import { describe, it, expect } from 'vitest';
import type { StoredMessage } from '@/shared/types';
import { storedMessagesToUIMessages, formatTime, formatDateTime, formatNum } from '../utils';

describe('formatTime', () => {
  it('formats with default locale (zh-CN)', () => {
    const ts = new Date(2024, 0, 15, 14, 30, 0).getTime();
    const result = formatTime(ts);
    expect(result).toMatch(/14:30|02:30/);
  });

  it('formats with custom locale (en-US)', () => {
    const ts = new Date(2024, 0, 15, 14, 30, 0).getTime();
    const result = formatTime(ts, 'en-US');
    expect(result).toMatch(/14:30|02:30/);
  });
});

describe('formatDateTime', () => {
  it('formats with default locale (zh-CN)', () => {
    const ts = new Date(2024, 0, 15, 14, 30, 0).getTime();
    const result = formatDateTime(ts);
    expect(result).toContain('15');
  });

  it('formats with custom locale (en-US)', () => {
    const ts = new Date(2024, 0, 15, 14, 30, 0).getTime();
    const result = formatDateTime(ts, 'en-US');
    expect(result).toContain('15');
  });
});

describe('formatNum', () => {
  it('formats number with default locale (zh-CN)', () => {
    expect(formatNum(1234567)).toBe('1,234,567');
  });

  it('formats number with custom locale', () => {
    expect(formatNum(1234567, 'de-DE')).toMatch(/1\.234\.567/);
  });

  it('formats zero', () => {
    expect(formatNum(0)).toBe('0');
  });

  it('formats small number without separator', () => {
    expect(formatNum(123)).toBe('123');
  });
});

describe('storedMessagesToUIMessages', () => {
  it('converts user message', () => {
    const stored: StoredMessage[] = [
      { id: 'msg-1', role: 'user', content: 'hello', timestamp: 1000 },
    ];
    const result = storedMessagesToUIMessages(stored);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('msg-1');
    expect(result[0]!.role).toBe('user');
    expect(result[0]!.content).toBe('hello');
    expect(result[0]!.status).toBe('complete');
  });

  it('splits assistant(tool_calls) with text into text + tool bubbles', () => {
    const stored: StoredMessage[] = [
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'let me check',
        timestamp: 2000,
        toolCalls: [
          { id: 'tc-1', name: 'tabs_query', params: { url: 'example.com' }, result: 'found 2 tabs' },
        ],
      },
      { id: 'tool-1', role: 'tool', content: '{"success":true,"data":[1,2]}', toolCallId: 'tc-1', timestamp: 2001 },
    ];
    const result = storedMessagesToUIMessages(stored);
    expect(result).toHaveLength(2);

    expect(result[0]!.id).toBe('msg-2_text');
    expect(result[0]!.role).toBe('assistant');
    expect(result[0]!.content).toBe('let me check');

    expect(result[1]!.id).toBe('tc-1');
    expect(result[1]!.role).toBe('tool');
    expect(result[1]!.toolCallDisplay).toBeDefined();
    expect(result[1]!.toolCallDisplay!.name).toBe('tabs_query');
    expect(result[1]!.toolCallDisplay!.result).toEqual({ success: true, data: [1, 2] });
    expect(result[1]!.toolCallDisplay!.status).toBe('success');
  });

  it('handles assistant(tool_calls) without text content', () => {
    const stored: StoredMessage[] = [
      {
        id: 'msg-3',
        role: 'assistant',
        content: '',
        timestamp: 3000,
        toolCalls: [
          { id: 'tc-2', name: 'close_tab', params: { id: 5 }, result: 'closed' },
        ],
      },
      { id: 'tool-2', role: 'tool', content: '{"success":false,"error":"not found"}', toolCallId: 'tc-2', timestamp: 3001 },
    ];
    const result = storedMessagesToUIMessages(stored);
    // 纯 tool_calls 无文本的 assistant 不生成文本气泡，只生成 tool 气泡
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe('tool');
    expect(result[0]!.toolCallDisplay!.result).toEqual({ success: false, error: 'not found' });
    expect(result[0]!.toolCallDisplay!.status).toBe('error');
  });

  it('converts plain assistant message', () => {
    const stored: StoredMessage[] = [
      { id: 'msg-4', role: 'assistant', content: 'plain response', timestamp: 4000 },
    ];
    const result = storedMessagesToUIMessages(stored);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe('assistant');
    expect(result[0]!.content).toBe('plain response');
  });

  it('skips tool messages (results paired into tool calls)', () => {
    const stored: StoredMessage[] = [
      { id: 'tool-3', role: 'tool', content: '{"result":"done"}', toolCallId: 'tc-3', timestamp: 5000 },
    ];
    const result = storedMessagesToUIMessages(stored);
    expect(result).toHaveLength(0);
  });

  it('handles tool result that is not valid JSON', () => {
    const stored: StoredMessage[] = [
      {
        id: 'msg-5',
        role: 'assistant',
        content: '',
        timestamp: 6000,
        toolCalls: [
          { id: 'tc-4', name: 'unknown', params: {}, result: 'raw text' },
        ],
      },
      { id: 'tool-4', role: 'tool', content: 'plain error message', toolCallId: 'tc-4', timestamp: 6001 },
    ];
    const result = storedMessagesToUIMessages(stored);
    expect(result).toHaveLength(1);
    expect(result[0]!.toolCallDisplay!.result).toEqual({ success: false, error: 'plain error message' });
    expect(result[0]!.toolCallDisplay!.status).toBe('error');
  });

  it('empty toolCalls array is ignored', () => {
    const stored: StoredMessage[] = [
      { id: 'msg-6', role: 'assistant', content: 'no tools', timestamp: 7000, toolCalls: [] },
    ];
    const result = storedMessagesToUIMessages(stored);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe('assistant');
    expect(result[0]!.toolCallDisplay).toBeUndefined();
  });

  it('full conversation with user, tool_calls, and final assistant', () => {
    const stored: StoredMessage[] = [
      { id: 'u1', role: 'user', content: '帮我打开标签页', timestamp: 1000 },
      {
        id: 'a1',
        role: 'assistant',
        content: '好的',
        timestamp: 2000,
        toolCalls: [{ id: 'tc1', name: 'tabs_query', params: {}, result: '...' }],
      },
      { id: 't1', role: 'tool', content: '{"success":true,"data":[1]}', toolCallId: 'tc1', timestamp: 2001 },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        timestamp: 3000,
        toolCalls: [{ id: 'tc2', name: 'close_tab', params: { id: 1 }, result: '...' }],
      },
      { id: 't2', role: 'tool', content: '{"success":true}', toolCallId: 'tc2', timestamp: 3001 },
      { id: 'a3', role: 'assistant', content: '已完成操作', timestamp: 4000 },
    ];
    const result = storedMessagesToUIMessages(stored);
    expect(result).toHaveLength(5);
    expect(result[0]!.role).toBe('user');
    expect(result[1]!.role).toBe('assistant');
    expect(result[1]!.content).toBe('好的');
    expect(result[2]!.role).toBe('tool');
    expect(result[2]!.toolCallDisplay!.name).toBe('tabs_query');
    expect(result[3]!.role).toBe('tool');
    expect(result[3]!.toolCallDisplay!.name).toBe('close_tab');
    expect(result[4]!.role).toBe('assistant');
    expect(result[4]!.content).toBe('已完成操作');
  });
});
