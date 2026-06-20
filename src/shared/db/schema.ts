import type {
  DbConversation,
  DbMessage,
  DbToolCallLog,
  DbSnapshot,
} from '@/shared/types';
import { DB_NAME, DB_VERSION } from '@/shared/types';
import { openDB, type IDBPDatabase } from 'idb';

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

/**
 * 打开数据库连接（用于测试直接操作）
 */
export async function openBrowserAgentDB(): Promise<BrowserAgentDatabase> {
  return openDB<BrowserAgentDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, _transaction) {
      if (oldVersion < 1) {
        const convStore = db.createObjectStore(StoreNames.CONVERSATIONS, { keyPath: 'id' });
        convStore.createIndex('byUpdatedAt', 'updatedAt');

        const msgStore = db.createObjectStore(StoreNames.MESSAGES, { keyPath: 'id' });
        msgStore.createIndex('byConversation', 'conversationId');
        msgStore.createIndex('byConversationAndTime', ['conversationId', 'timestamp']);

        const logStore = db.createObjectStore(StoreNames.TOOL_CALL_LOGS, { keyPath: 'id' });
        logStore.createIndex('byConversation', 'conversationId');

        const snapStore = db.createObjectStore(StoreNames.SNAPSHOTS, { keyPath: 'id' });
        snapStore.createIndex('byCapturedAt', 'capturedAt');
      }
    },
  });
}
