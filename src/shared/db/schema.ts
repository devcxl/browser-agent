import type {
  DbConversation,
  DbMessage,
  DbToolCallLog,
  DbSnapshot,
  SkillResource,
} from '@/shared/types';
import { DB_NAME, DB_VERSION } from '@/shared/types';
import { openDB, type IDBPDatabase } from 'idb';

export { DB_NAME, DB_VERSION };

export const StoreNames = {
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
  TOOL_CALL_LOGS: 'toolCallLogs',
  SNAPSHOTS: 'snapshots',
  SKILL_CONTENTS: 'skillContents',
} as const;

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
  [StoreNames.SKILL_CONTENTS]: {
    key: string;
    value: {
      skillId: string;
      prompt: string;
      resources: SkillResource[];
    };
  };
}

export type BrowserAgentDatabase = IDBPDatabase<BrowserAgentDB>;

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
      if (oldVersion < 3) {
        db.createObjectStore(StoreNames.SKILL_CONTENTS, { keyPath: 'skillId' });
      }
    },
  });
}
