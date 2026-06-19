import { describe, it, expect } from 'vitest';
import type {
  ProviderConfig,
  ToolCallDelta,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChunk,
  ILlmClient,
} from '../llm';

describe('LLM types', () => {
  describe('ProviderConfig', () => {
    it('should accept a valid provider config', () => {
      const config: ProviderConfig = {
        id: 'openai',
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-xxx',
        model: 'gpt-4',
        isLocalTrusted: false,
      };
      expect(config.id).toBe('openai');
    });
  });

  describe('ToolCallDelta', () => {
    it('should define function call shape', () => {
      const delta: ToolCallDelta = {
        id: 'call_1',
        type: 'function',
        function: { name: 'tabs_query', arguments: '{}' },
      };
      expect(delta.function.name).toBe('tabs_query');
    });
  });

  describe('ChatMessage', () => {
    it('should accept system message', () => {
      const msg: ChatMessage = { role: 'system', content: 'You are a bot' };
      expect(msg.role).toBe('system');
    });

    it('should accept user message', () => {
      const msg: ChatMessage = { role: 'user', content: 'Hello' };
      expect(msg.content).toBe('Hello');
    });

    it('should accept assistant message with tool_calls', () => {
      const msg: ChatMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'test', arguments: '{}' },
        }],
      };
      expect(msg.tool_calls).toHaveLength(1);
    });

    it('should accept tool message with tool_call_id', () => {
      const msg: ChatMessage = {
        role: 'tool',
        content: 'result',
        tool_call_id: 'call_1',
      };
      expect(msg.tool_call_id).toBe('call_1');
    });
  });

  describe('ChatCompletionRequest', () => {
    it('should accept a completion request', () => {
      const req: ChatCompletionRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
        temperature: 0.7,
      };
      expect(req.model).toBe('gpt-4');
    });
  });

  describe('ChatCompletionResponse', () => {
    it('should accept a completion response', () => {
      const res: ChatCompletionResponse = {
        id: 'chatcmpl-123',
        choices: [{
          message: { role: 'assistant', content: 'Hello' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      expect(res.choices[0]!.message.content).toBe('Hello');
    });
  });

  describe('StreamChunk', () => {
    it('should accept a stream chunk', () => {
      const chunk: StreamChunk = {
        id: 'chatcmpl-123',
        choices: [{
          delta: { content: 'Hello' },
          finish_reason: null,
        }],
      };
      expect(chunk.choices[0]!.delta.content).toBe('Hello');
    });
  });

  describe('ILlmClient', () => {
    it('should define the client interface', () => {
      const client: ILlmClient = {
        chat: async () => ({
          id: '',
          choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
        }),
        chatStream: async () => {},
        checkHealth: async () => true,
      };
      expect(typeof client.chat).toBe('function');
      expect(typeof client.chatStream).toBe('function');
    });
  });
});
