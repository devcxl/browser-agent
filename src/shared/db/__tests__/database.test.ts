import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../database';
import { openBrowserAgentDB, StoreNames, DB_NAME } from '../schema';
import type { DbConversation, DbMessage, DbToolCallLog, DbSnapshot } from '@/shared/types';

function makeConv(overrides: Partial<DbConversation> = {}): DbConversation {
  const now = Date.now();
  return {
    id: `conv-${now}-${Math.random()}`,
    title: 'Test Conversation',
    createdAt: now,
    updatedAt: now,
    summary: null,
    summaryUpToIndex: 0,
    sensitiveDataGranted: false,
    ...overrides,
  };
}

function makeMsg(
  conversationId: string,
  overrides: Partial<DbMessage> = {},
): DbMessage {
  const now = Date.now();
  return {
    id: `msg-${now}-${Math.random()}`,
    conversationId,
    role: 'user',
    content: 'Hello',
    timestamp: now,
    ...overrides,
  };
}

function makeLog(
  conversationId: string,
  overrides: Partial<DbToolCallLog> = {},
): DbToolCallLog {
  const now = Date.now();
  return {
    id: `log-${now}-${Math.random()}`,
    conversationId,
    toolName: 'testTool',
    riskLevel: 'low',
    paramsSummary: '{}',
    resultSummary: 'success',
    success: true,
    confirmedByUser: true,
    timestamp: now,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<DbSnapshot> = {}): DbSnapshot {
  const now = Date.now();
  return {
    id: `snap-${now}-${Math.random()}`,
    type: 'tab',
    data: '{}',
    capturedAt: now,
    ...overrides,
  };
}

describe('Database', () => {
  beforeEach(async () => {
    Database.resetInstance();
    // 确保每次测试前数据库是干净的
    const req = indexedDB.deleteDatabase(DB_NAME);
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  });

  // #1 单例
  it('should return the same instance', () => {
    const a = Database.getInstance();
    const b = Database.getInstance();
    expect(a).toBe(b);
  });

  // #2 数据库初始化 - 4 张表存在
  it('should create database with 4 object stores', async () => {
    const db = await openBrowserAgentDB();
    expect(db.objectStoreNames).toContain(StoreNames.CONVERSATIONS);
    expect(db.objectStoreNames).toContain(StoreNames.MESSAGES);
    expect(db.objectStoreNames).toContain(StoreNames.TOOL_CALL_LOGS);
    expect(db.objectStoreNames).toContain(StoreNames.SNAPSHOTS);
    db.close();
  });

  // #3 putConversation
  it('should put a conversation', async () => {
    const db = Database.getInstance();
    const conv = makeConv({ id: 'conv-1', title: 'Test' });
    await db.putConversation(conv);
    const got = await db.getConversation('conv-1');
    expect(got?.title).toBe('Test');
  });

  // #4 getConversation
  it('should get a conversation by id', async () => {
    const db = Database.getInstance();
    const conv = makeConv({ id: 'conv-get' });
    await db.putConversation(conv);
    const got = await db.getConversation('conv-get');
    expect(got).toBeDefined();
    expect(got!.id).toBe('conv-get');
  });

  // #5 getAllConversations
  it('should get all conversations', async () => {
    const db = Database.getInstance();
    await db.putConversation(makeConv({ id: 'a' }));
    await db.putConversation(makeConv({ id: 'b' }));
    await db.putConversation(makeConv({ id: 'c' }));
    const all = await db.getAllConversations();
    expect(all).toHaveLength(3);
  });

  // #6 listConversationsByUpdatedAt
  it('should list conversations ordered by updatedAt', async () => {
    const db = Database.getInstance();
    await db.putConversation(makeConv({ id: 'old', updatedAt: 100 }));
    await db.putConversation(makeConv({ id: 'mid', updatedAt: 200 }));
    await db.putConversation(makeConv({ id: 'new', updatedAt: 300 }));
    const list = await db.listConversationsByUpdatedAt();
    expect(list.map((c) => c.id)).toEqual(['old', 'mid', 'new']);
  });

  // #7 deleteConversation 级联
  it('should cascade delete messages and tool call logs', async () => {
    const db = Database.getInstance();
    await db.putConversation(makeConv({ id: 'conv-del' }));
    await db.putMessage(makeMsg('conv-del', { id: 'm1' }));
    await db.putMessage(makeMsg('conv-del', { id: 'm2' }));
    await db.putMessage(makeMsg('conv-del', { id: 'm3' }));
    await db.putToolCallLog(makeLog('conv-del', { id: 'l1' }));
    await db.putToolCallLog(makeLog('conv-del', { id: 'l2' }));

    await db.deleteConversation('conv-del');

    expect(await db.getConversation('conv-del')).toBeUndefined();
    expect(await db.getMessagesByConversation('conv-del')).toHaveLength(0);
    expect(await db.getToolCallLogsByConversation('conv-del')).toHaveLength(0);
  });

  // #8 putMessage
  it('should put a message', async () => {
    const db = Database.getInstance();
    const msg = makeMsg('conv-x', { id: 'msg-1', content: 'Hi' });
    await db.putMessage(msg);
    const got = await db.getMessage('msg-1');
    expect(got?.content).toBe('Hi');
  });

  // #9 getMessagesByConversation
  it('should get messages by conversation', async () => {
    const db = Database.getInstance();
    for (let i = 0; i < 5; i++) {
      await db.putMessage(makeMsg('conv-msgs', { id: `m${i}` }));
    }
    const msgs = await db.getMessagesByConversation('conv-msgs');
    expect(msgs).toHaveLength(5);
  });

  // #10 getRecentMessages
  it('should return recent N messages in reverse order', async () => {
    const db = Database.getInstance();
    for (let i = 0; i < 10; i++) {
      await db.putMessage(makeMsg('conv-recent', { id: `r${i}`, timestamp: 1000 + i }));
    }
    const recent = await db.getRecentMessages('conv-recent', 5);
    expect(recent).toHaveLength(5);
    // 按时间倒序：r9, r8, r7, r6, r5
    expect(recent[0]!.id).toBe('r9');
    expect(recent[4]!.id).toBe('r5');
  });

  // #11 countMessagesByConversation
  it('should count messages by conversation', async () => {
    const db = Database.getInstance();
    for (let i = 0; i < 5; i++) {
      await db.putMessage(makeMsg('conv-count', { id: `c${i}` }));
    }
    const count = await db.countMessagesByConversation('conv-count');
    expect(count).toBe(5);
  });

  // #12 deleteMessage
  it('should delete a single message', async () => {
    const db = Database.getInstance();
    await db.putMessage(makeMsg('conv-del-msg', { id: 'del-msg' }));
    await db.deleteMessage('del-msg');
    expect(await db.getMessage('del-msg')).toBeUndefined();
  });

  // #13 putToolCallLog
  it('should put a tool call log', async () => {
    const db = Database.getInstance();
    await db.putToolCallLog(makeLog('conv-log', { id: 'log-1' }));
    const logs = await db.getToolCallLogsByConversation('conv-log');
    expect(logs).toHaveLength(1);
  });

  // #14 getToolCallLogsByConversation
  it('should get tool call logs by conversation', async () => {
    const db = Database.getInstance();
    await db.putToolCallLog(makeLog('conv-logs', { id: 'l1' }));
    await db.putToolCallLog(makeLog('conv-logs', { id: 'l2' }));
    await db.putToolCallLog(makeLog('conv-logs', { id: 'l3' }));
    const logs = await db.getToolCallLogsByConversation('conv-logs');
    expect(logs).toHaveLength(3);
  });

  // #15 putSnapshot
  it('should put a snapshot', async () => {
    const db = Database.getInstance();
    await db.putSnapshot(makeSnapshot({ id: 'snap-1' }));
    const snaps = await db.getSnapshotsByTimeRange(0, Date.now());
    expect(snaps).toHaveLength(1);
  });

  // #16 getSnapshotsByTimeRange
  it('should get snapshots by time range', async () => {
    const db = Database.getInstance();
    await db.putSnapshot(makeSnapshot({ id: 's1', capturedAt: 100 }));
    await db.putSnapshot(makeSnapshot({ id: 's2', capturedAt: 200 }));
    await db.putSnapshot(makeSnapshot({ id: 's3', capturedAt: 300 }));
    const range = await db.getSnapshotsByTimeRange(150, 250);
    expect(range).toHaveLength(1);
    expect(range[0]!.id).toBe('s2');
  });

  // #17 deleteOldSnapshots
  it('should delete old snapshots', async () => {
    const db = Database.getInstance();
    await db.putSnapshot(makeSnapshot({ id: 's1', capturedAt: 100 }));
    await db.putSnapshot(makeSnapshot({ id: 's2', capturedAt: 200 }));
    await db.putSnapshot(makeSnapshot({ id: 's3', capturedAt: 300 }));
    await db.deleteOldSnapshots(250);
    const remaining = await db.getSnapshotsByTimeRange(0, Date.now());
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe('s3');
  });

  // #18 putMessagesBatch
  it('should batch put messages atomically', async () => {
    const db = Database.getInstance();
    const msgs = [
      makeMsg('conv-batch', { id: 'b1' }),
      makeMsg('conv-batch', { id: 'b2' }),
      makeMsg('conv-batch', { id: 'b3' }),
    ];
    await db.putMessagesBatch(msgs);
    const got = await db.getMessagesByConversation('conv-batch');
    expect(got).toHaveLength(3);
  });

  // #19 deleteDatabase
  it('should delete the entire database', async () => {
    const db = Database.getInstance();
    await db.putConversation(makeConv({ id: 'to-delete' }));
    await db.deleteDatabase();
    // 删除后重新打开，应该没有数据
    const freshDb = Database.getInstance();
    const all = await freshDb.getAllConversations();
    expect(all).toHaveLength(0);
  });

  // #20 resetInstance
  it('should return a new instance after reset', async () => {
    const a = Database.getInstance();
    Database.resetInstance();
    const b = Database.getInstance();
    expect(a).not.toBe(b);
  });
});
