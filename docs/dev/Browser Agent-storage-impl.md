# 开发文档: T5 - IndexedDB 封装 + ConfigStore

**Project:** Browser Agent
**Task ID:** T5
**Slug:** storage-impl
**Issue:** #5
**类型:** backend
**Batch:** 2
**依赖:** T1（项目骨架）, T2（共享类型）

## 1. 目标

使用 `idb` 库封装 IndexedDB，实现 `conversations`、`messages`、`toolCallLogs`、`snapshots` 四张表的 CRUD。实现 `ConfigStore` 封装 `chrome.storage.local` 的读写和变更监听。

## 2. 前置条件

- T1 完成：项目骨架、`idb` 依赖已安装
- T2 完成：`DbConversation`、`DbMessage`、`DbToolCallLog`、`DbSnapshot`、`StorageSchema`、`IConfigStore` 等类型已定义

## 3. 实现步骤

### 3.1 IndexedDB Schema 定义

**文件: `src/shared/db/schema.ts`**

```ts
import type {
  DbConversation,
  DbMessage,
  DbToolCallLog,
  DbSnapshot,
} from '@/shared/types';
import { DB_NAME, DB_VERSION } from '@/shared/types';
import { openDB, type IDBPDatabase } from 'idb';

// 重新导出常量
export { DB_NAME, DB_VERSION };

/**
 * 数据库表名常量
 */
export const StoreNames = {
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
  TOOL_CALL_LOGS: 'toolCallLogs',
  SNAPSHOTS: 'snapshots',
} as const;

/**
 * 数据库 Schema 类型映射
 */
export interface BrowserAgentDB {
  [StoreNames.CONVERSATIONS]: {
    key: string;
    value: DbConversation;
    indexes: {
      byUpdatedAt: number;
    };
  };
  [StoreNames.MESSAGES]: {
    key: string;
    value: DbMessage;
    indexes: {
      byConversation: string;
      byConversationAndTime: [string, number];
    };
  };
  [StoreNames.TOOL_CALL_LOGS]: {
    key: string;
    value: DbToolCallLog;
    indexes: {
      byConversation: string;
    };
  };
  [StoreNames.SNAPSHOTS]: {
    key: string;
    value: DbSnapshot;
    indexes: {
      byCapturedAt: number;
    };
  };
}

export type BrowserAgentDatabase = IDBPDatabase<BrowserAgentDB>;
```

### 3.2 数据库管理类

**文件: `src/shared/db/database.ts`**

```ts
import { openDB } from 'idb';
import type { BrowserAgentDatabase, BrowserAgentDB } from './schema';
import { DB_NAME, DB_VERSION, StoreNames } from './schema';

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
        resolve(); // 忽略 blocked，下次打开时重建
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
    // 级联删除消息和日志
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
    return db.getAllFromIndex(StoreNames.MESSAGES, 'byConversation', conversationId);
  }

  async getRecentMessages(
    conversationId: string,
    count: number,
  ): Promise<BrowserAgentDB['messages']['value'][]> {
    const db = await this.getDB();
    const index = db.transaction(StoreNames.MESSAGES).store.index('byConversationAndTime');
    // 按时间倒序获取
    const all = await index.getAll(IDBKeyRange.bound(
      [conversationId, 0],
      [conversationId, Date.now()],
    ));
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
    const index = db.transaction(StoreNames.SNAPSHOTS).store.index('byCapturedAt');
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
    return openDB<BrowserAgentDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, _transaction) {
        // conversations 表
        if (oldVersion < 1) {
          const convStore = db.createObjectStore(StoreNames.CONVERSATIONS, { keyPath: 'id' });
          convStore.createIndex('byUpdatedAt', 'updatedAt');

          // messages 表
          const msgStore = db.createObjectStore(StoreNames.MESSAGES, { keyPath: 'id' });
          msgStore.createIndex('byConversation', 'conversationId');
          msgStore.createIndex('byConversationAndTime', ['conversationId', 'timestamp']);

          // toolCallLogs 表
          const logStore = db.createObjectStore(StoreNames.TOOL_CALL_LOGS, { keyPath: 'id' });
          logStore.createIndex('byConversation', 'conversationId');

          // snapshots 表
          const snapStore = db.createObjectStore(StoreNames.SNAPSHOTS, { keyPath: 'id' });
          snapStore.createIndex('byCapturedAt', 'capturedAt');
        }
        // 后续版本迁移在此添加
      },
    });
  }
}
```

### 3.3 ConfigStore 实现

**文件: `src/shared/storage/config-store.ts`**

```ts
import type { StorageSchema, IConfigStore } from '@/shared/types';

/**
 * 默认配置值
 */
const DEFAULTS: StorageSchema = {
  providers: [],
  agentSettings: {
    maxToolRounds: 15,
    systemPrompt: '',
    maxContextMessages: 40,
    summaryThreshold: {
      messageCount: 30,
      estimatedTokens: 12000,
      toolCallCount: 50,
    },
  },
  expertModeSettings: {
    enabled: false,
    switches: {},
  },
  preferences: {
    theme: 'system',
    language: 'zh-CN',
    sidebarExpanded: true,
  },
};

/**
 * chrome.storage.local 配置存储
 *
 * 单例模式。封装 chrome.storage.local 的读写操作，
 * 支持类型安全的 get/set、部分更新 patch、变更监听 onChange。
 */
export class ConfigStore implements IConfigStore {
  private static instance: ConfigStore | null = null;

  static getInstance(): ConfigStore {
    if (!ConfigStore.instance) {
      ConfigStore.instance = new ConfigStore();
    }
    return ConfigStore.instance;
  }

  static resetInstance(): void {
    ConfigStore.instance = null;
  }

  private storage: chrome.storage.LocalStorageArea;

  constructor() {
    this.storage = chrome.storage.local;
  }

  // ── 读取 ────────────────────────────────────────────

  async get<T>(key: keyof StorageSchema): Promise<T> {
    const result = await this.storage.get(key);
    const value = result[key];
    if (value !== undefined) {
      return value as T;
    }
    return DEFAULTS[key] as unknown as T;
  }

  async getAll(): Promise<StorageSchema> {
    const result = await this.storage.get(null);
    // 合并默认值
    return {
      ...DEFAULTS,
      ...(result as Partial<StorageSchema>),
    };
  }

  // ── 写入 ────────────────────────────────────────────

  async set<T>(key: keyof StorageSchema, value: T): Promise<void> {
    await this.storage.set({ [key]: value });
  }

  async patch(patch: Partial<StorageSchema>): Promise<void> {
    await this.storage.set(patch as Record<string, unknown>);
  }

  // ── 监听 ────────────────────────────────────────────

  /**
   * 监听配置变更
   * @returns 取消监听的函数
   */
  onChange(callback: (changes: Partial<StorageSchema>) => void): () => void {
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      _areaName: string,
    ) => {
      const typedChanges: Partial<StorageSchema> = {};
      for (const [key, change] of Object.entries(changes)) {
        (typedChanges as Record<string, unknown>)[key] = change.newValue;
      }
      callback(typedChanges);
    };

    this.storage.onChanged.addListener(handler);
    return () => this.storage.onChanged.removeListener(handler);
  }

  // ── 工具方法 ────────────────────────────────────────

  /** 清除所有配置（重置为默认值） */
  async clear(): Promise<void> {
    await this.storage.clear();
  }

  /** 获取默认配置快照 */
  getDefaults(): StorageSchema {
    return structuredClone(DEFAULTS);
  }
}
```

### 3.4 统一导出

**文件: `src/shared/db/index.ts`**

```ts
export { Database } from './database';
export { StoreNames, DB_NAME, DB_VERSION } from './schema';
export type { BrowserAgentDB, BrowserAgentDatabase } from './schema';
```

**文件: `src/shared/storage/index.ts`**

```ts
export { ConfigStore } from './config-store';
```

## 4. 接口/契约

### 4.1 Database 类 API

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `getInstance()` | - | `Database` | 单例获取 |
| `resetInstance()` | - | `void` | 重置单例（测试用） |
| `getDB()` | - | `Promise<BrowserAgentDatabase>` | 懒初始化数据库连接 |
| `close()` | - | `void` | 关闭连接 |
| `deleteDatabase()` | - | `Promise<void>` | 删除整个数据库 |
| `getAllConversations()` | - | `Promise<DbConversation[]>` | 获取所有会话 |
| `getConversation(id)` | `string` | `Promise<DbConversation \| undefined>` | 按 ID 获取 |
| `putConversation(conv)` | `DbConversation` | `Promise<void>` | 创建或更新 |
| `deleteConversation(id)` | `string` | `Promise<void>` | 删除会话（含级联） |
| `listConversationsByUpdatedAt()` | - | `Promise<DbConversation[]>` | 按更新时间排序 |
| `putMessage(msg)` | `DbMessage` | `Promise<void>` | 添加消息 |
| `getMessage(id)` | `string` | `Promise<DbMessage \| undefined>` | 按 ID 获取 |
| `getMessagesByConversation(id)` | `string` | `Promise<DbMessage[]>` | 获取会话全部消息 |
| `getRecentMessages(id, count)` | `string, number` | `Promise<DbMessage[]>` | 获取最近 N 条消息 |
| `deleteMessage(id)` | `string` | `Promise<void>` | 删除单条消息 |
| `deleteMessagesByConversation(id)` | `string` | `Promise<void>` | 删除会话全部消息 |
| `countMessagesByConversation(id)` | `string` | `Promise<number>` | 统计消息数 |
| `putToolCallLog(log)` | `DbToolCallLog` | `Promise<void>` | 添加日志 |
| `getToolCallLogsByConversation(id)` | `string` | `Promise<DbToolCallLog[]>` | 获取会话日志 |
| `deleteToolCallLogsByConversation(id)` | `string` | `Promise<void>` | 删除会话日志 |
| `putSnapshot(snap)` | `DbSnapshot` | `Promise<void>` | 添加快照 |
| `getSnapshotsByTimeRange(from, to)` | `number, number` | `Promise<DbSnapshot[]>` | 按时间范围查询 |
| `deleteOldSnapshots(beforeTime)` | `number` | `Promise<void>` | 删除过期快照 |
| `putMessagesBatch(msgs)` | `DbMessage[]` | `Promise<void>` | 批量添加消息（事务） |

### 4.2 ConfigStore 类 API

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `getInstance()` | - | `ConfigStore` | 单例获取 |
| `resetInstance()` | - | `void` | 重置单例（测试用） |
| `get<T>(key)` | `keyof StorageSchema` | `Promise<T>` | 按 key 读取，不存在返回默认值 |
| `getAll()` | - | `Promise<StorageSchema>` | 读取全部，合并默认值 |
| `set<T>(key, value)` | `keyof StorageSchema, T` | `Promise<void>` | 写入单个 key |
| `patch(patch)` | `Partial<StorageSchema>` | `Promise<void>` | 部分更新多个 key |
| `onChange(callback)` | `(changes) => void` | `() => void` | 监听变更，返回取消监听函数 |
| `clear()` | - | `Promise<void>` | 清除所有配置 |
| `getDefaults()` | - | `StorageSchema` | 获取默认配置快照 |

### 4.3 IndexedDB 表结构

```
Database: browser-agent-db (v1)
├── conversations (keyPath: id)
│   └── index: byUpdatedAt (updatedAt)
├── messages (keyPath: id)
│   ├── index: byConversation (conversationId)
│   └── index: byConversationAndTime ([conversationId, timestamp])
├── toolCallLogs (keyPath: id)
│   └── index: byConversation (conversationId)
└── snapshots (keyPath: id)
    └── index: byCapturedAt (capturedAt)
```

### 4.4 chrome.storage.local 存储 Schema

```
chrome.storage.local:
├── providers: ProviderConfig[]
├── agentSettings: AgentSettings
├── expertModeSettings: ExpertModeSettings
└── preferences: UserPreferences
```

## 5. 测试指引

### 5.1 Database 单元测试

**文件: `src/shared/db/__tests__/database.test.ts`**

使用 `fake-indexeddb` 库在 Node 环境模拟 IndexedDB。

```bash
npm install --save-dev fake-indexeddb
```

Vitest 配置中添加：

```ts
// vitest.config.ts 或 setup file
import 'fake-indexeddb/auto';
```

测试场景：

| # | 场景 | 操作 | 预期 |
|---|------|------|------|
| 1 | 单例 | `Database.getInstance()` 两次 | 返回同一实例 |
| 2 | 数据库初始化 | `getDB()` | 数据库创建成功，4 张表存在 |
| 3 | putConversation | 写入一条会话 | 无报错 |
| 4 | getConversation | 读取刚写入的会话 | 返回正确数据 |
| 5 | getAllConversations | 写入 3 条后读取全部 | 返回 3 条 |
| 6 | listConversationsByUpdatedAt | 写入不同时间的 3 条 | 按 updatedAt 排序返回 |
| 7 | deleteConversation 级联 | 会话有 3 条消息 2 条日志，删除会话 | 会话、消息、日志全部删除 |
| 8 | putMessage | 写入消息 | 无报错 |
| 9 | getMessagesByConversation | 写入同会话 5 条消息 | 返回 5 条 |
| 10 | getRecentMessages | 写入 10 条，取最近 5 条 | 返回最近 5 条，按时间倒序 |
| 11 | countMessagesByConversation | 写入 5 条消息 | 返回 5 |
| 12 | deleteMessage | 删除单条消息 | 该消息不存在 |
| 13 | putToolCallLog | 写入日志 | 无报错 |
| 14 | getToolCallLogsByConversation | 写入 3 条日志 | 返回 3 条 |
| 15 | putSnapshot | 写入快照 | 无报错 |
| 16 | getSnapshotsByTimeRange | 写入 3 个不同时间快照 | 按时间范围正确过滤 |
| 17 | deleteOldSnapshots | 写入 3 个快照，删除 2 个旧的 | 只保留 1 个新的 |
| 18 | putMessagesBatch | 批量写入 3 条消息 | 事务原子性：全成功或全失败 |
| 19 | deleteDatabase | 删除数据库 | 数据库不存在 |
| 20 | resetInstance | reset 后 getInstance | 返回新实例 |

### 5.2 ConfigStore 单元测试

**文件: `src/shared/storage/__tests__/config-store.test.ts`**

Mock `chrome.storage.local` 的 `get`、`set`、`onChanged` 方法。

测试场景：

| # | 场景 | 操作 | 预期 |
|---|------|------|------|
| 1 | 单例 | `ConfigStore.getInstance()` 两次 | 返回同一实例 |
| 2 | get 存在值 | mock `chrome.storage.local.get('providers')` 返回 `[{id:'p1'}]` | 返回 mock 值 |
| 3 | get 不存在（默认值） | mock 返回 `{}` | 返回 `DEFAULTS.providers`（空数组） |
| 4 | getAll 合并默认值 | mock 返回 `{providers: [{id:'p1'}]}` | 返回 `{ ...DEFAULTS, providers: [...] }` |
| 5 | set | `store.set('providers', [{id:'p2'}])` | `chrome.storage.local.set` 被调用 |
| 6 | patch | `store.patch({ preferences: { theme: 'dark' } })` | `chrome.storage.local.set` 被调用 |
| 7 | onChange 监听 | 调用 onChange 注册回调，触发 `onChanged` | 回调被调用 |
| 8 | onChange 取消 | 调用返回的取消函数 | 回调不再被调用 |
| 9 | clear | `store.clear()` | `chrome.storage.local.clear` 被调用 |
| 10 | getDefaults | `store.getDefaults()` | 返回 `DEFAULTS` 的深拷贝 |
| 11 | 类型安全 | `store.get<ProviderConfig[]>('providers')` | TypeScript 编译通过 |

### 5.3 运行测试

```bash
npm run test -- src/shared/db/ src/shared/storage/
# 或
npx vitest run src/shared/db/ src/shared/storage/
```

## 6. 验收标准

- [ ] IndexedDB 数据库 `browser-agent-db` 版本 1 创建成功，4 张表 + 索引正确
- [ ] `conversations` 表 CRUD 通过测试（创建/查询/列表/更新/删除，删除时级联消息和日志）
- [ ] `messages` 表按 `conversationId` 查询，按 `timestamp` 排序
- [ ] `getRecentMessages(conversationId, count)` 返回最近 count 条消息
- [ ] `toolCallLogs` 表按 `conversationId` 查询
- [ ] `snapshots` 表按 `capturedAt` 范围查询
- [ ] `ConfigStore.get<ProviderConfig[]>('providers')` 正确读写
- [ ] `ConfigStore.getAll()` 返回合并默认值的完整配置
- [ ] `ConfigStore` 支持 `onChanged` 监听，取消监听正常
- [ ] `Database` 和 `ConfigStore` 均为单例
- [ ] 单元测试覆盖所有 CRUD 操作

## 7. 注意事项

- **fake-indexeddb**：测试 IndexedDB 需要 `fake-indexeddb` 库。Vitest 的 `jsdom` 环境不提供 IndexedDB。在 `vitest.config.ts` 的 `setupFiles` 中添加 `import 'fake-indexeddb/auto'`。
- **chrome.storage.local mock**：测试 ConfigStore 需要 mock `chrome.storage.local`。可以使用 `vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(), set: vi.fn(), onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } } })`。
- **idb 库**：`idb` 是轻量级 IndexedDB 封装（~3KB），类型安全，Promise-based。`openDB` 返回 `IDBPDatabase<Schema>` 类型，自动推导表结构。
- **级联删除**：`deleteConversation(id)` 同时删除 messages 和 toolCallLogs 中的关联数据。IndexedDB 不支持原生级联，需要手动实现。
- **事务原子性**：`putMessagesBatch()` 使用单个事务，保证批量操作原子性。
- **数据库版本升级**：`upgrade` 回调中通过 `oldVersion` 判断是否需要创建表。后续版本升级时在此添加新的 `if (oldVersion < N)` 块。
- **chrome.storage.local 容量**：Chrome 限制约 10MB，"unlimitedStorage" 权限可扩展到设备可用空间。当前 Schema 以配置为主，10MB 足够。
- **ConfigStore 默认值合并**：`getAll()` 返回 `{ ...DEFAULTS, ...stored }`，确保新版本新增的配置项有默认值。
- **单例 resetInstance**：`resetInstance()` 仅用于测试。生产代码中不会调用。测试中在每个用例前调用以确保隔离。
