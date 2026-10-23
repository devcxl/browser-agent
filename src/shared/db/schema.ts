import type {
  DbConversation,
  DbMessage,
  SkillResource,
} from '@/shared/types';
import { DB_NAME, DB_VERSION } from '@/shared/types';
import { openDB, type IDBPDatabase } from 'idb';

export { DB_NAME, DB_VERSION };

export const StoreNames = {
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
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
      }
      if (oldVersion < 3) {
        db.createObjectStore(StoreNames.SKILL_CONTENTS, { keyPath: 'skillId' });
      }
      if (oldVersion < 4) {
        if (db.objectStoreNames.contains('toolCallLogs')) {
          db.deleteObjectStore('toolCallLogs');
        }
        if (db.objectStoreNames.contains('snapshots')) {
          db.deleteObjectStore('snapshots');
        }
      }
    },
  });
}
