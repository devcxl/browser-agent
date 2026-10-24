import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../database';
import { openBrowserAgentDB, StoreNames, DB_NAME, DB_VERSION } from '../schema';
import type { DbConversation, DbMessage } from '@/shared/types';

function makeConv(overrides: Partial<DbConversation> = {}): DbConversation {
  const now = Date.now();
  return {
    id: `conv-${now}-${Math.random()}`,
    title: 'Test Conversation',
    titleGenerated: true,
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

  // #2 数据库初始化 - 3 张表存在
  it('should create database with current object stores', async () => {
    const db = await openBrowserAgentDB();
    expect(db.objectStoreNames).toContain(StoreNames.CONVERSATIONS);
    expect(db.objectStoreNames).toContain(StoreNames.MESSAGES);
    expect(db.objectStoreNames).toContain(StoreNames.SKILL_CONTENTS);
    expect(db.objectStoreNames).toHaveLength(3);
    db.close();
  });

  it('removes obsolete stores when upgrading a version 3 database and preserves conversations', async () => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      const conversations = db.createObjectStore('conversations', { keyPath: 'id' });
      conversations.createIndex('byUpdatedAt', 'updatedAt');
      const messages = db.createObjectStore('messages', { keyPath: 'id' });
      messages.createIndex('byConversation', 'conversationId');
      messages.createIndex('byConversationAndTime', ['conversationId', 'timestamp']);
      const logs = db.createObjectStore('toolCallLogs', { keyPath: 'id' });
      logs.createIndex('byConversation', 'conversationId');
      const snapshots = db.createObjectStore('snapshots', { keyPath: 'id' });
      snapshots.createIndex('byCapturedAt', 'capturedAt');
      db.createObjectStore('skillContents', { keyPath: 'skillId' });
    };
    const legacyDb = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const conversation = makeConv({ id: 'preserved-conversation' });
    await new Promise<void>((resolve, reject) => {
      const tx = legacyDb.transaction(['conversations', 'toolCallLogs', 'snapshots'], 'readwrite');
      tx.objectStore('conversations').put(conversation);
      tx.objectStore('toolCallLogs').put({ id: 'legacy-log', conversationId: conversation.id });
      tx.objectStore('snapshots').put({ id: 'legacy-snapshot', capturedAt: 1 });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    legacyDb.close();

    const db = await openBrowserAgentDB();
    expect(db.version).toBe(DB_VERSION);
    expect(db.objectStoreNames).toContain(StoreNames.CONVERSATIONS);
    expect(db.objectStoreNames).toContain(StoreNames.MESSAGES);
    expect(db.objectStoreNames).toContain(StoreNames.SKILL_CONTENTS);
    expect(db.objectStoreNames).not.toContain('toolCallLogs');
    expect(db.objectStoreNames).not.toContain('snapshots');
    await expect(db.get(StoreNames.CONVERSATIONS, conversation.id)).resolves.toEqual(conversation);
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

  it('should update a pending title exactly once', async () => {
    const db = Database.getInstance();
    await db.putConversation(makeConv({
      id: 'pending-title',
      title: '新对话 2026/7/18 08:00',
      titleGenerated: false,
    }));

    await expect(db.updateConversationTitleIfPending('pending-title', '自动标题')).resolves.toBe(true);
    await expect(db.updateConversationTitleIfPending('pending-title', '重复标题')).resolves.toBe(false);
    await expect(db.getConversation('pending-title')).resolves.toEqual(expect.objectContaining({
      title: '自动标题',
      titleGenerated: true,
    }));
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
  it('should cascade delete messages', async () => {
    const db = Database.getInstance();
    await db.putConversation(makeConv({ id: 'conv-del' }));
    await db.putMessage(makeMsg('conv-del', { id: 'm1' }));
    await db.putMessage(makeMsg('conv-del', { id: 'm2' }));
    await db.putMessage(makeMsg('conv-del', { id: 'm3' }));
    await db.deleteConversation('conv-del');

    expect(await db.getConversation('conv-del')).toBeUndefined();
    expect(await db.getMessagesByConversation('conv-del')).toHaveLength(0);
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

  // #9b getMessagesByConversation 按 timestamp 升序返回（修复乱序 bug）
  it('should return messages ordered by timestamp ascending', async () => {
    const db = Database.getInstance();
    // 故意让主键字典序与时间序相反，暴露 byConversation 索引乱序问题
    // 主键 z,y,x 对应时间 1,2,3（升序）
    await db.putMessage(
      makeMsg('conv-order', { id: 'z', role: 'user', content: 'first', timestamp: 1000 }),
    );
    await db.putMessage(
      makeMsg('conv-order', { id: 'y', role: 'assistant', content: 'second', timestamp: 2000 }),
    );
    await db.putMessage(
      makeMsg('conv-order', { id: 'x', role: 'tool', content: 'third', timestamp: 3000 }),
    );

    const msgs = await db.getMessagesByConversation('conv-order');
    expect(msgs).toHaveLength(3);
    // 必须按时间升序：first → second → third
    expect(msgs.map((m) => m.content)).toEqual(['first', 'second', 'third']);
  });

  // #9c getMessagesByConversation 不同会话不串数据 + 各自时间升序
  it('should isolate messages by conversation and keep time order', async () => {
    const db = Database.getInstance();
    await db.putMessage(makeMsg('conv-a', { id: 'a1', timestamp: 100 }));
    await db.putMessage(makeMsg('conv-b', { id: 'b1', timestamp: 50 }));
    await db.putMessage(makeMsg('conv-a', { id: 'a2', timestamp: 300 }));
    await db.putMessage(makeMsg('conv-b', { id: 'b2', timestamp: 200 }));

    const aMsgs = await db.getMessagesByConversation('conv-a');
    const bMsgs = await db.getMessagesByConversation('conv-b');
    expect(aMsgs.map((m) => m.id)).toEqual(['a1', 'a2']);
    expect(bMsgs.map((m) => m.id)).toEqual(['b1', 'b2']);
  });

  // #10 getRecentMessages
  it('should return recent N messages in chronological order', async () => {
    const db = Database.getInstance();
    for (let i = 0; i < 10; i++) {
      await db.putMessage(makeMsg('conv-recent', { id: `r${i}`, timestamp: 1000 + i }));
    }
    const recent = await db.getRecentMessages('conv-recent', 5);
    expect(recent).toHaveLength(5);
    // 最近 5 条仍必须按时间升序喂给 LLM：r5 → r6 → r7 → r8 → r9
    expect(recent.map((m) => m.id)).toEqual(['r5', 'r6', 'r7', 'r8', 'r9']);
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

  // #21 deleteDatabase 被其它连接阻塞时 onblocked 兜底 resolve
  it('should resolve when deleteDatabase is blocked by open connections', async () => {
    const req = indexedDB.open(DB_NAME, 3);
    const blockingDb = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // 该连接保持打开 → deleteDatabase 会触发 onblocked 而非一直挂起
    await expect(Database.getInstance().deleteDatabase()).resolves.toBeUndefined();
    // 关闭阻塞连接，避免影响后续测试的清理逻辑
    blockingDb.close();
  });

  // #23 appendMessages：同一会话内严格递增的逻辑时间戳 + 单事务原子性
  describe('appendMessages', () => {
    const T = 1_700_000_000_000;

    it('assigns strictly increasing timestamps for same-ms rows and across appends', async () => {
      const db = Database.getInstance();
      const first = await db.appendMessages([
        makeMsg('conv-append', { id: 'a1', content: 'one', timestamp: T }),
        makeMsg('conv-append', { id: 'a2', content: 'two', timestamp: T }),
        makeMsg('conv-append', { id: 'a3', content: 'three', timestamp: T }),
      ]);
      const second = await db.appendMessages([
        makeMsg('conv-append', { id: 'a4', content: 'four', timestamp: T }),
      ]);

      expect(first.map((m) => m.timestamp)).toEqual([T, T + 1, T + 2]);
      expect(second.map((m) => m.timestamp)).toEqual([T + 3]);

      const stored = await db.getMessagesByConversation('conv-append');
      expect(stored.map((m) => m.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
      expect(stored.map((m) => m.timestamp)).toEqual([T, T + 1, T + 2, T + 3]);
    });

    it('keeps requested timestamps that are already increasing', async () => {
      const db = Database.getInstance();
      await db.appendMessages([
        makeMsg('conv-append-gap', { id: 'g1', timestamp: T }),
        makeMsg('conv-append-gap', { id: 'g2', timestamp: T + 5_000 }),
      ]);

      const stored = await db.getMessagesByConversation('conv-append-gap');
      expect(stored.map((m) => m.timestamp)).toEqual([T, T + 5_000]);
    });

    it('isolates timestamp sequences per conversation', async () => {
      const db = Database.getInstance();
      await db.appendMessages([
        makeMsg('conv-append-a', { id: 'aa1', timestamp: T }),
        makeMsg('conv-append-a', { id: 'aa2', timestamp: T }),
      ]);
      await db.appendMessages([makeMsg('conv-append-b', { id: 'bb1', timestamp: T })]);
      await db.appendMessages([makeMsg('conv-append-a', { id: 'aa3', timestamp: T })]);

      const a = await db.getMessagesByConversation('conv-append-a');
      const b = await db.getMessagesByConversation('conv-append-b');
      expect(a.map((m) => m.timestamp)).toEqual([T, T + 1, T + 2]);
      expect(b.map((m) => m.timestamp)).toEqual([T]);
    });

    it('serializes concurrent appends from two connections', async () => {
      const dbA = new Database();
      const dbB = new Database();
      try {
        // 先确保数据库已建立，避免两个连接同时触发 open upgrade
        await dbA.getMessagesByConversation('conv-append-concurrent');

        // 两个独立连接并发追加同一毫秒时间戳：谁先提交不确定，
        // 但提交后必须仍是「两条记录 + 时间戳严格递增且连续」
        await Promise.all([
          dbA.appendMessages([makeMsg('conv-append-concurrent', { id: 'c1', timestamp: T })]),
          dbB.appendMessages([makeMsg('conv-append-concurrent', { id: 'c2', timestamp: T })]),
        ]);

        const stored = await dbA.getMessagesByConversation('conv-append-concurrent');
        expect(stored).toHaveLength(2);
        expect(new Set(stored.map((m) => m.id))).toEqual(new Set(['c1', 'c2']));
        expect(stored.map((m) => m.timestamp)).toEqual([T, T + 1]);
      } finally {
        dbA.close();
        dbB.close();
      }
    });

    it('rolls back the whole batch when a row cannot be written', async () => {
      const db = Database.getInstance();
      const cloneErrorRow = makeMsg('conv-append-rollback', { id: 'rb2', timestamp: T });
      // 函数不可结构化克隆 → 第二行 put 抛错，验证第一行不会残留
      (cloneErrorRow as unknown as { content: unknown }).content = () => 'not cloneable';

      await expect(
        db.appendMessages([
          makeMsg('conv-append-rollback', { id: 'rb1', timestamp: T }),
          cloneErrorRow,
        ]),
      ).rejects.toThrow();

      expect(await db.countMessagesByConversation('conv-append-rollback')).toBe(0);

      // 回滚后时间戳序列未被消耗
      const written = await db.appendMessages([
        makeMsg('conv-append-rollback', { id: 'rb3', timestamp: T }),
      ]);
      expect(written.map((m) => m.timestamp)).toEqual([T]);
    });

    it('rejects rows from more than one conversation without writing', async () => {
      const db = Database.getInstance();
      await expect(
        db.appendMessages([
          makeMsg('conv-append-mixed-1', { id: 'mx1', timestamp: T }),
          makeMsg('conv-append-mixed-2', { id: 'mx2', timestamp: T }),
        ]),
      ).rejects.toThrow();

      expect(await db.countMessagesByConversation('conv-append-mixed-1')).toBe(0);
      expect(await db.countMessagesByConversation('conv-append-mixed-2')).toBe(0);
    });

    it('treats an empty batch as a no-op', async () => {
      const db = Database.getInstance();
      await expect(db.appendMessages([])).resolves.toEqual([]);
    });

    it('makes future logical timestamps visible to getRecentMessages', async () => {
      const db = Database.getInstance();
      const now = Date.now();
      await db.appendMessages([makeMsg('conv-append-future', { id: 'f1', timestamp: now })]);
      await db.appendMessages([
        makeMsg('conv-append-future', { id: 'f2', timestamp: now + 60_000 }),
        makeMsg('conv-append-future', { id: 'f3', timestamp: now + 60_000 }),
      ]);

      // 逻辑时间戳可能落在 Date.now() 之后，getRecentMessages 也必须看得到
      const recent = await db.getRecentMessages('conv-append-future', 10);
      expect(recent.map((m) => m.id)).toEqual(['f1', 'f2', 'f3']);
    });
  });

  // #22 SkillContent CRUD
  it('should get/put/delete skill content', async () => {
    const db = Database.getInstance();
    const content = {
      skillId: 'skill-1',
      prompt: '你是一个测试助手',
      resources: [{ path: 'helper.md', content: 'helper content' }],
    };

    await expect(db.getSkillContent('skill-1')).resolves.toBeUndefined();

    await db.putSkillContent(content);
    await expect(db.getSkillContent('skill-1')).resolves.toEqual(content);

    await db.putSkillContent({
      skillId: 'skill-1',
      prompt: '覆盖后的 prompt',
      resources: [],
    });
    await expect(db.getSkillContent('skill-1')).resolves.toEqual(
      expect.objectContaining({ skillId: 'skill-1', prompt: '覆盖后的 prompt' }),
    );

    await db.deleteSkillContent('skill-1');
    await expect(db.getSkillContent('skill-1')).resolves.toBeUndefined();
  });
});
