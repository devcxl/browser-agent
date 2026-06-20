import { describe, it, expect } from 'vitest';
import type {
  StoredMessage,
  Conversation,
  IConversationManager,
} from '../conversation';

describe('Conversation types', () => {
  describe('StoredMessage', () => {
    it('should accept a stored message', () => {
      const msg: StoredMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      };
      expect(msg.role).toBe('user');
    });

    it('should accept assistant message with toolCalls', () => {
      const msg: StoredMessage = {
        id: 'msg-2',
        role: 'assistant',
        content: '',
        toolCalls: [{
          name: 'tabs_query',
          params: {},
          result: '2 tabs found',
        }],
        timestamp: Date.now(),
      };
      expect(msg.toolCalls).toHaveLength(1);
    });
  });

  describe('Conversation', () => {
    it('should accept a conversation', () => {
      const conv: Conversation = {
        id: 'conv-1',
        title: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        sensitiveDataGranted: false,
      };
      expect(conv.title).toBe('Test');
    });
  });

  describe('IConversationManager', () => {
    it('should define the manager interface', () => {
      const manager: IConversationManager = {
        create: async () => ({
          id: '', title: '', createdAt: 0, updatedAt: 0, messages: [], sensitiveDataGranted: false,
        }),
        get: async () => undefined,
        list: async () => [],
        update: async () => {},
        delete: async () => {},
        addMessage: async () => {},
        getRecentMessages: async () => [],
        generateSummary: async () => '',
        needsSummary: async () => false,
      };
      expect(typeof manager.create).toBe('function');
      expect(typeof manager.generateSummary).toBe('function');
    });
  });
});
