import type { BrowserAgentDatabase, BrowserAgentDB } from './schema';
import { DB_NAME, StoreNames, openBrowserAgentDB } from './schema';

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
        // eslint-disable-next-line no-console
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

  async updateConversationTitleIfPending(id: string, title: string): Promise<boolean> {
    const db = await this.getDB();
    const tx = db.transaction(StoreNames.CONVERSATIONS, 'readwrite');
    const existing = await tx.store.get(id);
    if (!existing || existing.titleGenerated) {
      await tx.done;
      return false;
    }

    await tx.store.put({
      ...existing,
      title,
      titleGenerated: true,
      updatedAt: Date.now(),
    });
    await tx.done;
    return true;
  }

  async deleteConversation(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete(StoreNames.CONVERSATIONS, id);
    await this.deleteMessagesByConversation(id);
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

  /**
   * 追加一批消息（同一会话），单事务原子写入并分配递增逻辑时间戳。
   *
   * 传入的 timestamp 只作为下限：实际写入 max(请求值, 该会话上一条 + 1)。
   * 这样即使同一毫秒内写入多行（或调用方传入相同/回退的时间戳），
   * byConversationAndTime 索引顺序仍等于追加顺序。
   *
   * 返回实际写入的行（含分配后的 timestamp），便于调用方复用。
   * putMessage 保持原样不做规整，以兼容既有调用方。
   */
  async appendMessages(
    messages: BrowserAgentDB['messages']['value'][],
  ): Promise<BrowserAgentDB['messages']['value'][]> {
    const first = messages[0];
    if (!first) return [];

    const conversationId = first.conversationId;
    // 写入前校验：事务内抛出的 JS 异常不会自动回滚，先挡住可预见的非法行。
    for (const msg of messages) {
      if (msg.conversationId !== conversationId) {
        throw new Error('appendMessages 只接受同一会话的消息');
      }
      if (!msg.id) {
        throw new Error('appendMessages 需要非空消息 id');
      }
      if (!Number.isFinite(msg.timestamp)) {
        throw new Error('appendMessages 需要有限数值 timestamp');
      }
    }

    const db = await this.getDB();
    const tx = db.transaction(StoreNames.MESSAGES, 'readwrite');
    try {
      const index = tx.store.index('byConversationAndTime');
      // 该会话时间戳最大的那一行（cursor 倒序第一条）
      const lastCursor = await index.openCursor(
        IDBKeyRange.bound([conversationId, 0], [conversationId, Number.MAX_SAFE_INTEGER]),
        'prev',
      );
      let lastTimestamp = lastCursor ? lastCursor.value.timestamp : null;

      const written: BrowserAgentDB['messages']['value'][] = [];
      for (const msg of messages) {
        const timestamp =
          lastTimestamp === null ? msg.timestamp : Math.max(msg.timestamp, lastTimestamp + 1);
        const row = { ...msg, timestamp };
        await tx.store.put(row);
        lastTimestamp = timestamp;
        written.push(row);
      }

      await tx.done;
      return written;
    } catch (error) {
      // 显式 abort：否则已排队的前半批写入仍会提交
      try {
        tx.abort();
      } catch {
        // 事务可能已自行结束（request 失败会自动 abort）
      }
      // 消费 tx.done 的 AbortError，避免未处理的 rejection
      await tx.done.catch(() => {});
      throw error;
    }
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
    // 上界不能用 Date.now()：appendMessages 分配的是逻辑时间戳，
    // 同一毫秒内追加时可能递增到当前时钟之后。
    const all = await index.getAll(
      IDBKeyRange.bound([conversationId, 0], [conversationId, Number.MAX_SAFE_INTEGER]),
    );
    // Chat Completions 历史消息必须按旧到新排列，最后一条才是最新用户输入。
    return all.slice(-count);
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

  // ── Skill Content CRUD ─────────────────────────────

  async getSkillContent(skillId: string): Promise<BrowserAgentDB['skillContents']['value'] | undefined> {
    const db = await this.getDB();
    return db.get(StoreNames.SKILL_CONTENTS, skillId);
  }

  async putSkillContent(content: BrowserAgentDB['skillContents']['value']): Promise<void> {
    const db = await this.getDB();
    await db.put(StoreNames.SKILL_CONTENTS, content);
  }

  async deleteSkillContent(skillId: string): Promise<void> {
    const db = await this.getDB();
    await db.delete(StoreNames.SKILL_CONTENTS, skillId);
  }

  // ── 初始化 ──────────────────────────────────────────

  private async initDB(): Promise<BrowserAgentDatabase> {
    return openBrowserAgentDB();
  }
}
