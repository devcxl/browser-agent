import { describe, it, expect } from 'vitest';
import type {
  StorageSchema,
  AgentSettings,
  ExpertModeSettings,
  UserPreferences,
  DbConversation,
  DbMessage,
  DbToolCallLog,
  DbSnapshot,
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
          systemPrompt: '',
          maxContextMessages: 40,
          summaryThreshold: { messageCount: 30, estimatedTokens: 12000, toolCallCount: 50 },
        },
        expertModeSettings: { enabled: false, switches: {} },
        preferences: { theme: 'system', language: 'zh-CN', sidebarExpanded: true },
      };
      expect(schema.agentSettings.maxToolRounds).toBe(99);
    });
  });

  describe('AgentSettings', () => {
    it('should accept agent settings', () => {
      const s: AgentSettings = {
        maxToolRounds: 10,
        systemPrompt: 'You are a browser agent',
        maxContextMessages: 20,
        summaryThreshold: { messageCount: 25, estimatedTokens: 10000, toolCallCount: 40 },
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
      const p: UserPreferences = { theme: 'dark', language: 'en', sidebarExpanded: false };
      expect(p.theme).toBe('dark');
    });
  });

  describe('DB_NAME and DB_VERSION', () => {
    it('should have correct values', () => {
      expect(DB_NAME).toBe('browser-agent-db');
      expect(DB_VERSION).toBe(1);
    });
  });

  describe('DbConversation', () => {
    it('should accept db conversation', () => {
      const c: DbConversation = {
        id: 'c-1',
        title: 'Test',
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

  describe('DbToolCallLog', () => {
    it('should accept db tool call log', () => {
      const log: DbToolCallLog = {
        id: 'l-1',
        conversationId: 'c-1',
        toolName: 'tabs_query',
        riskLevel: 'low',
        paramsSummary: '{}',
        resultSummary: 'success',
        success: true,
        confirmedByUser: true,
        timestamp: 0,
      };
      expect(log.toolName).toBe('tabs_query');
    });
  });

  describe('DbSnapshot', () => {
    it('should accept db snapshot', () => {
      const snap: DbSnapshot = {
        id: 's-1',
        type: 'tab',
        data: '{}',
        capturedAt: 0,
      };
      expect(snap.type).toBe('tab');
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
            systemPrompt: '',
            maxContextMessages: 40,
            summaryThreshold: { messageCount: 30, estimatedTokens: 12000, toolCallCount: 50 },
          },
          expertModeSettings: { enabled: false, switches: {} },
          preferences: { theme: 'system', language: 'zh-CN', sidebarExpanded: true },
        }),
        patch: async () => {},
        onChange: () => () => {},
      };
      expect(typeof store.get).toBe('function');
    });
  });
});
