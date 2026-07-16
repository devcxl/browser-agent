import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationManager } from '../conversation-manager';
import type { Database } from '@/shared/db/database';
import type { DbConversation, DbMessage, DbToolCallLog } from '@/shared/types';
import type { StoredMessage } from '@/shared/types/conversation';
import type { ILlmClient, ChatCompletionResponse } from '@/shared/types/llm';

// ── Mock helpers ──

function mockConv(overrides: Partial<DbConversation> = {}): DbConversation {
  const now = Date.now();
  return {
    id: `conv-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Conversation',
    createdAt: now,
    updatedAt: now,
    summary: null,
    summaryUpToIndex: 0,
    sensitiveDataGranted: false,
    ...overrides,
  };
}

function mockMsg(
  conversationId: string,
  overrides: Partial<DbMessage> = {},
): DbMessage {
  const now = Date.now();
  return {
    id: `msg-${now}-${Math.random().toString(36).slice(2, 8)}`,
    conversationId,
    role: 'user',
    content: 'Hello',
    timestamp: now,
    ...overrides,
  };
}

function mockLog(
  conversationId: string,
  overrides: Partial<DbToolCallLog> = {},
): DbToolCallLog {
  const now = Date.now();
  return {
    id: `log-${now}-${Math.random().toString(36).slice(2, 8)}`,
    conversationId,
    toolName: 'testTool',
    riskLevel: 'low',
    paramsSummary: '{}',
    resultSummary: 'ok',
    success: true,
    confirmedByUser: true,
    timestamp: now,
    ...overrides,
  };
}

function createMockDb(): Database {
  return {
    getConversation: vi.fn(),
    getAllConversations: vi.fn(),
    putConversation: vi.fn(),
    deleteConversation: vi.fn(),
    listConversationsByUpdatedAt: vi.fn(),
    putMessage: vi.fn(),
    getMessage: vi.fn(),
    getMessagesByConversation: vi.fn(),
    getRecentMessages: vi.fn(),
    deleteMessage: vi.fn(),
    deleteMessagesByConversation: vi.fn(),
    countMessagesByConversation: vi.fn(),
    putToolCallLog: vi.fn(),
    getToolCallLogsByConversation: vi.fn(),
    deleteToolCallLogsByConversation: vi.fn(),
    putSnapshot: vi.fn(),
    getSnapshotsByTimeRange: vi.fn(),
    deleteOldSnapshots: vi.fn(),
    putMessagesBatch: vi.fn(),
    getDB: vi.fn(),
    close: vi.fn(),
    deleteDatabase: vi.fn(),
  } as unknown as Database;
}

function createMockLlm(): ILlmClient {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    checkHealth: vi.fn(),
  };
}

// ── Tests ──

describe('ConversationManager', () => {
  let db: Database;
  let mgr: ConversationManager;

  beforeEach(() => {
    db = createMockDb();
    mgr = new ConversationManager(db);
  });

  // #1
  it('create() 无标题时生成默认标题', async () => {
    const conv = await mgr.create();
    expect(conv.title).toContain('新对话');
    expect(conv.id).toBeTruthy();
    expect(conv.messages).toEqual([]);
    expect(conv.sensitiveDataGranted).toBe(false);
    expect(db.putConversation).toHaveBeenCalledOnce();
  });

  // #2
  it('create() 带自定义标题', async () => {
    const conv = await mgr.create('我的会话');
    expect(conv.title).toBe('我的会话');
    expect(db.putConversation).toHaveBeenCalledOnce();
  });

  // #3
  it('get() 返回存在的会话及消息', async () => {
    const conv = mockConv({ id: 'c1' });
    const msgs = [
      mockMsg('c1', { role: 'user', content: '你好' }),
      mockMsg('c1', { role: 'assistant', content: '你好！' }),
    ];
    vi.mocked(db.getConversation).mockResolvedValue(conv);
    vi.mocked(db.getMessagesByConversation).mockResolvedValue(msgs);

    const result = await mgr.get('c1');
    expect(result).toBeDefined();
    expect(result!.id).toBe('c1');
    expect(result!.messages).toHaveLength(2);
    expect(result!.messages[0]!.role).toBe('user');
  });

  // #4
  it('get() 不存在的 id 返回 undefined', async () => {
    vi.mocked(db.getConversation).mockResolvedValue(undefined);
    const result = await mgr.get('nonexistent');
    expect(result).toBeUndefined();
  });

  // #5
  it('list() 返回多个会话', async () => {
    const c1 = mockConv({ id: 'c1', title: 'A' });
    const c2 = mockConv({ id: 'c2', title: 'B' });
    vi.mocked(db.listConversationsByUpdatedAt).mockResolvedValue([c1, c2]);

    const result = await mgr.list();
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('c1');
    expect(result[1]!.id).toBe('c2');
    expect(result[0]!.messages).toEqual([]); // list 不加载消息
  });

  // #6
  it('update() 修改标题', async () => {
    const conv = mockConv({ id: 'c1', title: '旧标题' });
    vi.mocked(db.getConversation).mockResolvedValue(conv);

    await mgr.update('c1', { title: '新标题' });
    expect(db.putConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', title: '新标题' }),
    );
  });

  // #7
  it('update() 不存在的 id 抛错', async () => {
    vi.mocked(db.getConversation).mockResolvedValue(undefined);
    await expect(mgr.update('nope', { title: 'x' })).rejects.toThrow('不存在');
  });

  // #8
  it('delete() 级联删除', async () => {
    await mgr.delete('c1');
    expect(db.deleteConversation).toHaveBeenCalledWith('c1');
  });

  // #9
  it('addMessage() 添加消息并更新 updatedAt', async () => {
    const conv = mockConv({ id: 'c1', updatedAt: 1000 });
    vi.mocked(db.getConversation).mockResolvedValue(conv);

    const msg: StoredMessage = {
      id: 'm1',
      role: 'user',
      content: 'test',
      timestamp: 2000,
    };
    await mgr.addMessage('c1', msg);

    expect(db.putMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', conversationId: 'c1' }),
    );
    expect(db.putConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', updatedAt: expect.any(Number) }),
    );
  });

  // #10
  it('addMessage() 含 toolCalls', async () => {
    const conv = mockConv({ id: 'c1' });
    vi.mocked(db.getConversation).mockResolvedValue(conv);

    const msg: StoredMessage = {
      id: 'm2',
      role: 'assistant',
      content: '',
      timestamp: 3000,
      toolCalls: [
        {
          id: 'call_1',
          name: 'getWeather',
          params: { city: 'Beijing' },
          result: 'Sunny',
        },
      ],
    };
    await mgr.addMessage('c1', msg);

    expect(db.putMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCalls: '[{"id":"call_1","name":"getWeather","params":{"city":"Beijing"},"result":"Sunny"}]',
        toolCallId: undefined,
      }),
    );
  });

  // #10b (Slice B)
  it('addMessage() 支持 role:tool 消息持久化（含 toolCallId）', async () => {
    const conv = mockConv({ id: 'c1' });
    vi.mocked(db.getConversation).mockResolvedValue(conv);

    const msg: StoredMessage = {
      id: 'm-tool',
      role: 'tool',
      content: '{"temperature":25}',
      toolCallId: 'call_real_1',
      timestamp: 4000,
    };
    await mgr.addMessage('c1', msg);

    expect(db.putMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'm-tool',
        role: 'tool',
        content: '{"temperature":25}',
        toolCallId: 'call_real_1',
        toolCalls: undefined,
      }),
    );
  });

  // #10c (Slice F)
  it('dbMsgToStored 兼容旧数据（无 toolCalls/toolCallId 字段）', async () => {
    const conv = mockConv({ id: 'c1' });
    vi.mocked(db.getConversation).mockResolvedValue(conv);
    // 模拟旧格式消息
    vi.mocked(db.getMessagesByConversation).mockResolvedValue([
      {
        id: 'old-msg',
        conversationId: 'c1',
        role: 'assistant',
        content: '旧消息',
        toolCalls: undefined,
        toolCallId: undefined,
        timestamp: 100,
      },
    ]);

    const result = await mgr.get('c1');
    expect(result).toBeDefined();
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0]!.role).toBe('assistant');
    expect(result!.messages[0]!.content).toBe('旧消息');
    // 旧消息的 toolCalls 应该是 undefined（不抛异常）
    expect(result!.messages[0]!.toolCalls).toBeUndefined();
    expect(result!.messages[0]!.toolCallId).toBeUndefined();
  });

  // #11
  it('getRecentMessages() 取 N 条', async () => {
    const msgs = [mockMsg('c1', { content: 'a' }), mockMsg('c1', { content: 'b' })];
    vi.mocked(db.getRecentMessages).mockResolvedValue(msgs);

    const result = await mgr.getRecentMessages('c1', 2);
    expect(result).toHaveLength(2);
    expect(result[0]!.content).toBe('a');
  });

  // #12
  it('getRecentMessages() count 超总数', async () => {
    const msgs = [mockMsg('c1', { content: 'only' })];
    vi.mocked(db.getRecentMessages).mockResolvedValue(msgs);

    const result = await mgr.getRecentMessages('c1', 100);
    expect(result).toHaveLength(1);
  });

  // #13
  it('needsSummary() 消息数超阈值', async () => {
    vi.mocked(db.countMessagesByConversation).mockResolvedValue(31);
    vi.mocked(db.getMessagesByConversation).mockResolvedValue([]);
    vi.mocked(db.getToolCallLogsByConversation).mockResolvedValue([]);

    const result = await mgr.needsSummary('c1');
    expect(result).toBe(true);
  });

  // #14
  it('needsSummary() token 超阈值', async () => {
    vi.mocked(db.countMessagesByConversation).mockResolvedValue(5);
    vi.mocked(db.getMessagesByConversation).mockResolvedValue([
      mockMsg('c1', { content: 'x'.repeat(24001) }), // ~12000 tokens
    ]);
    vi.mocked(db.getToolCallLogsByConversation).mockResolvedValue([]);

    const result = await mgr.needsSummary('c1');
    expect(result).toBe(true);
  });

  // #15
  // #16
  it('needsSummary() 未超阈值', async () => {
    vi.mocked(db.countMessagesByConversation).mockResolvedValue(5);
    vi.mocked(db.getMessagesByConversation).mockResolvedValue([
      mockMsg('c1', { content: 'short' }),
    ]);

    const result = await mgr.needsSummary('c1');
    expect(result).toBe(false);
  });

  // #17
  it('generateSummary() mock LLM 返回摘要', async () => {
    const conv = mockConv({ id: 'c1', summary: null, summaryUpToIndex: 0 });
    const msgs = [
      mockMsg('c1', { role: 'user', content: '帮我查天气' }),
      mockMsg('c1', { role: 'assistant', content: '北京晴天' }),
    ];
    vi.mocked(db.getConversation).mockResolvedValue(conv);
    vi.mocked(db.getMessagesByConversation).mockResolvedValue(msgs);

    const llm = createMockLlm();
    const llmResponse: ChatCompletionResponse = {
      id: 'r1',
      choices: [
        {
          message: { role: 'assistant', content: '用户查询北京天气，得到晴天结果' },
          finish_reason: 'stop',
        },
      ],
    };
    vi.mocked(llm.chat).mockResolvedValue(llmResponse);

    const summary = await mgr.generateSummary('c1', llm);

    expect(summary).toBe('用户查询北京天气，得到晴天结果');
    expect(db.putConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'c1',
        summary: '用户查询北京天气，得到晴天结果',
        summaryUpToIndex: 2,
      }),
    );
  });

  // #18
  it('generateSummary() 增量摘要', async () => {
    const conv = mockConv({
      id: 'c1',
      summary: '已有摘要',
      summaryUpToIndex: 2,
    });
    // conversation.messages 包含旧消息和新消息
    const msgs = [
      mockMsg('c1', { role: 'user', content: '旧消息' }),
      mockMsg('c1', { role: 'assistant', content: '旧回复' }),
      mockMsg('c1', { role: 'user', content: '新问题' }),
      mockMsg('c1', { role: 'assistant', content: '新回复' }),
    ];
    vi.mocked(db.getConversation).mockResolvedValue(conv);
    vi.mocked(db.getMessagesByConversation).mockResolvedValue(msgs);

    const llm = createMockLlm();
    const llmResponse: ChatCompletionResponse = {
      id: 'r2',
      choices: [
        {
          message: { role: 'assistant', content: '合并摘要' },
          finish_reason: 'stop',
        },
      ],
    };
    vi.mocked(llm.chat).mockResolvedValue(llmResponse);

    const summary = await mgr.generateSummary('c1', llm);

    expect(summary).toBe('合并摘要');
    // 验证 llm 只收到 summaryUpToIndex 之后的消息
    const promptArg = vi.mocked(llm.chat).mock.calls[0]![0]!.messages[0]!
      .content as string;
    expect(promptArg).toContain('新问题');
    expect(promptArg).toContain('新回复');
    expect(promptArg).not.toContain('旧消息');
    expect(db.putConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'c1',
        summary: '合并摘要',
        summaryUpToIndex: 4,
      }),
    );
  });
});
