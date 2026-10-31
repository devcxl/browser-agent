import { describe, it, expect } from 'vitest';
import type {
  StorageSchema,
  AgentSettings,
  ExpertModeSettings,
  UserPreferences,
  DbConversation,
  DbMessage,
  IConfigStore,
} from '../storage';
import { DB_NAME, DB_VERSION } from '../storage';

describe('Storage types', () => {
  describe('StorageSchema', () => {
    it('should define the full storage schema', () => {
      const schema: StorageSchema = {
        providers: [],
        agentSettings: {
          maxToolRounds: 99,
          contextWindowTokens: 128000,
          systemPrompt: '',
        },
        expertModeSettings: { enabled: false, switches: {} },
        preferences: { theme: 'system', sidebarExpanded: true, reasoningAutoExpand: false },
        skills: [],
        skillSubscriptions: [],
        jevSettings: { enabled: false, apiKey: '' },
        floatingButtonSettings: { enabled: true, position: null, blacklist: [] },
      };
      expect(schema.agentSettings.maxToolRounds).toBe(99);
    });
  });

  describe('AgentSettings', () => {
    it('should accept agent settings', () => {
      const s: AgentSettings = {
        maxToolRounds: 10,
        contextWindowTokens: 128000,
        systemPrompt: '',
      };
      expect(s.maxToolRounds).toBe(10);
    });
  });

  describe('ExpertModeSettings', () => {
    it('should accept expert mode settings', () => {
      const s: ExpertModeSettings = { enabled: true, switches: { proxy: true } };
      expect(s.enabled).toBe(true);
    });
  });

  describe('UserPreferences', () => {
    it('should accept user preferences', () => {
      const p: UserPreferences = { theme: 'dark', sidebarExpanded: false, reasoningAutoExpand: false };
      expect(p.theme).toBe('dark');
    });
  });

  describe('DB_NAME and DB_VERSION', () => {
    it('should have correct values', () => {
      expect(DB_NAME).toBe('browser-agent-db');
      expect(DB_VERSION).toBe(4);
    });
  });

  describe('DbConversation', () => {
    it('should accept db conversation', () => {
      const c: DbConversation = {
        id: 'c-1',
        title: 'Test',
        titleGenerated: true,
        createdAt: 0,
        updatedAt: 0,
        summary: null,
        summaryUpToIndex: 0,
        sensitiveDataGranted: false,
      };
      expect(c.id).toBe('c-1');
    });
  });

  describe('DbMessage', () => {
    it('should accept db message', () => {
      const m: DbMessage = {
        id: 'm-1',
        conversationId: 'c-1',
        role: 'user',
        content: 'Hello',
        timestamp: 0,
      };
      expect(m.conversationId).toBe('c-1');
    });
  });

  describe('IConfigStore', () => {
    it('should define the config store interface', () => {
      const store: IConfigStore = {
        get: async <T>() => ({} as T),
        set: async () => {},
        getAll: async () => ({
          providers: [],
          agentSettings: {
            maxToolRounds: 99,
            contextWindowTokens: 128000,
            systemPrompt: '',
          },
          expertModeSettings: { enabled: false, switches: {} },
          preferences: { theme: 'system', sidebarExpanded: true, reasoningAutoExpand: false },
          skills: [],
          skillSubscriptions: [],
          jevSettings: { enabled: false, apiKey: '' },
          floatingButtonSettings: { enabled: true, position: null, blacklist: [] },
        }),
        patch: async () => {},
        onChange: () => () => {},
      };
      expect(typeof store.get).toBe('function');
    });
  });
});
