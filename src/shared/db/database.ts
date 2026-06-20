import type { BrowserAgentDatabase, BrowserAgentDB } from './schema';
import { DB_NAME, DB_VERSION, StoreNames, openBrowserAgentDB } from './schema';

/**
 * IndexedDB 数据库管理
 *
 * 使用 idb 库封装，提供类型安全的 CRUD 操作。
 * 单例模式：整个扩展生命周期内只有一个数据库实例。
 */
export class Database {
  private static instance: Database | null = null;
  private dbPromise: Promise<BrowserAgentDatabase> | null = null;

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  static resetInstance(): void {
    if (Database.instance) {
      Database.instance.close();
      Database.instance = null;
    }
  }

  /** 获取数据库实例（懒初始化） */
  getDB(): Promise<BrowserAgentDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = this.initDB();
    }
    return this.dbPromise;
  }

  /** 关闭数据库连接 */
  close(): void {
    if (this.dbPromise) {
      this.dbPromise.then((db) => db.close()).catch(() => {});
      this.dbPromise = null;
    }
  }

  /** 删除整个数据库 */
  async deleteDatabase(): Promise<void> {
    this.close();
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        console.warn('[Database] Delete blocked by open connections');
        resolve();
      };
    });
  }

  // ── Conversations CRUD ──────────────────────────────

  async getAllConversations(): Promise<BrowserAgentDB['conversations']['value'][]> {
    const db = await this.getDB();
    return db.getAll(StoreNames.CONVERSATIONS);
  }

  async getConversation(id: string): Promise<BrowserAgentDB['conversations']['value'] | undefined> {
    const db = await this.getDB();
    return db.get(StoreNames.CONVERSATIONS, id);
  }

  async putConversation(conv: BrowserAgentDB['conversations']['value']): Promise<void> {
    const db = await this.getDB();
    await db.put(StoreNames.CONVERSATIONS, conv);
  }

  async deleteConversation(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete(StoreNames.CONVERSATIONS, id);
    await this.deleteMessagesByConversation(id);
    await this.deleteToolCallLogsByConversation(id);
  }

  async listConversationsByUpdatedAt(): Promise<BrowserAgentDB['conversations']['value'][]> {
    const db = await this.getDB();
    return db.getAllFromIndex(StoreNames.CONVERSATIONS, 'byUpdatedAt');
  }

  // ── Messages CRUD ───────────────────────────────────

  async putMessage(msg: BrowserAgentDB['messages']['value']): Promise<void> {
    const db = await this.getDB();
    await db.put(StoreNames.MESSAGES, msg);
  }

  async getMessage(id: string): Promise<BrowserAgentDB['messages']['value'] | undefined> {
    const db = await this.getDB();
    return db.get(StoreNames.MESSAGES, id);
  }

  async getMessagesByConversation(
    conversationId: string,
  ): Promise<BrowserAgentDB['messages']['value'][]> {
    const db = await this.getDB();
    // 用 byConversationAndTime 复合索引保证按 timestamp 升序返回。
    // 不能用 byConversation 单字段索引——它不包含 timestamp，
    // 同 conversationId 下顺序由主键决定（随机 UUID 字典序），导致刷新后乱序。
    return db.getAllFromIndex(
      StoreNames.MESSAGES,
      'byConversationAndTime',
      IDBKeyRange.bound([conversationId, 0], [conversationId, Number.MAX_SAFE_INTEGER]),
    );
  }

  async getRecentMessages(
    conversationId: string,
    count: number,
  ): Promise<BrowserAgentDB['messages']['value'][]> {
    const db = await this.getDB();
    const tx = db.transaction(StoreNames.MESSAGES);
    const index = tx.store.index('byConversationAndTime');
    const all = await index.getAll(
      IDBKeyRange.bound([conversationId, 0], [conversationId, Date.now()]),
    );
    return all.slice(-count).reverse();
  }

  async deleteMessage(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete(StoreNames.MESSAGES, id);
  }

  async deleteMessagesByConversation(conversationId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(StoreNames.MESSAGES, 'readwrite');
    const index = tx.store.index('byConversation');
    let cursor = await index.openCursor(conversationId);
    while (cursor) {
      cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async countMessagesByConversation(conversationId: string): Promise<number> {
    const db = await this.getDB();
    return db.countFromIndex(StoreNames.MESSAGES, 'byConversation', conversationId);
  }

  // ── ToolCallLogs CRUD ───────────────────────────────

  async putToolCallLog(log: BrowserAgentDB['toolCallLogs']['value']): Promise<void> {
    const db = await this.getDB();
    await db.put(StoreNames.TOOL_CALL_LOGS, log);
  }

  async getToolCallLogsByConversation(
    conversationId: string,
  ): Promise<BrowserAgentDB['toolCallLogs']['value'][]> {
    const db = await this.getDB();
    return db.getAllFromIndex(StoreNames.TOOL_CALL_LOGS, 'byConversation', conversationId);
  }

  async deleteToolCallLogsByConversation(conversationId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(StoreNames.TOOL_CALL_LOGS, 'readwrite');
    const index = tx.store.index('byConversation');
    let cursor = await index.openCursor(conversationId);
    while (cursor) {
      cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // ── Snapshots CRUD ──────────────────────────────────

  async putSnapshot(snapshot: BrowserAgentDB['snapshots']['value']): Promise<void> {
    const db = await this.getDB();
    await db.put(StoreNames.SNAPSHOTS, snapshot);
  }

  async getSnapshotsByTimeRange(
    startTime: number,
    endTime: number,
  ): Promise<BrowserAgentDB['snapshots']['value'][]> {
    const db = await this.getDB();
    const tx = db.transaction(StoreNames.SNAPSHOTS);
    const index = tx.store.index('byCapturedAt');
    return index.getAll(IDBKeyRange.bound(startTime, endTime));
  }

  async deleteOldSnapshots(beforeTime: number): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(StoreNames.SNAPSHOTS, 'readwrite');
    const index = tx.store.index('byCapturedAt');
    let cursor = await index.openCursor(IDBKeyRange.upperBound(beforeTime, true));
    while (cursor) {
      cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // ── 事务操作 ────────────────────────────────────────

  /**
   * 批量添加消息（单个事务，保证原子性）
   */
  async putMessagesBatch(messages: BrowserAgentDB['messages']['value'][]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(StoreNames.MESSAGES, 'readwrite');
    for (const msg of messages) {
      tx.store.put(msg);
    }
    await tx.done;
  }

  // ── 初始化 ──────────────────────────────────────────

  private async initDB(): Promise<BrowserAgentDatabase> {
    return openBrowserAgentDB();
  }
}
