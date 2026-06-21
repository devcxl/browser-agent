import { useState, useCallback, useRef } from 'react';
import type { AgentStatus, UIMessage, ToolCallDisplay, ConfirmRequest, TokenUsage } from '../types';
import type { ProviderConfig, StreamChunk } from '@/shared/types';
import { uid } from '../utils';

interface AgentCallbacks {
  onMessage?: (msg: UIMessage) => void;
  onConfirm?: (req: ConfirmRequest) => void;
  onTokenUsage?: (usage: TokenUsage) => void;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.5);
}

export function useAgent() {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ prompt: 0, completion: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const cbRef = useRef<AgentCallbacks>({});

  const setCallbacks = useCallback((cb: AgentCallbacks) => {
    cbRef.current = cb;
  }, []);

  const run = useCallback(
    async (
      conversationId: string,
      userMessage: string,
      providerConfig: ProviderConfig,
      maxToolRounds: number = 99,
    ) => {
      abortRef.current = new AbortController();
      setStatus('running');
      setError(null);
      setTokenUsage({ prompt: 0, completion: 0 });

      const userMsg: UIMessage = {
        id: uid(),
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
        status: 'complete',
      };
      cbRef.current.onMessage?.(userMsg);

      const assistantMsg: UIMessage = {
        id: uid(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        status: 'streaming',
        toolCalls: [],
      };
      cbRef.current.onMessage?.(assistantMsg);

      try {
        setStatus('streaming');

        // Simulate streaming by calling the provider
        const { LlmClient } = await import('@/provider');
        const client = new LlmClient(providerConfig);

        const { ContextBuilder } = await import('@/agent/context-builder');
        const { Database } = await import('@/shared/db/database');
        const { ConversationManager } = await import('@/conversation');
        const db = Database.getInstance();
        const convManager = new ConversationManager(db);
        const contextBuilder = new ContextBuilder(
          {
            maxToolRounds,
            systemPrompt: '',
            maxContextMessages: 40,
            summaryThreshold: { messageCount: 30, estimatedTokens: 12000, toolCallCount: 50 },
          },
          { getAllTools: () => [], getTool: () => undefined, toOpenAISchema: () => [] } as any,
          convManager,
        );
        const messages = await contextBuilder.build(conversationId, {
          currentWindow: { tabs: [] },
          allWindows: [],
          tabGroups: [],
        });
        messages.push({ role: 'user', content: userMessage });

        await client.chatStream(
          { model: providerConfig.model, messages },
          (chunk: StreamChunk) => {
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
              assistantMsg.content += delta.content;
              cbRef.current.onMessage?.({ ...assistantMsg });
            }
          },
          abortRef.current.signal,
        );

        // Estimate token usage from messages sent and response received
        const promptTokens = messages.reduce((sum: number, m: { content?: string | null }) => sum + estimateTokens(m.content ?? ''), 0);
        const completionTokens = estimateTokens(assistantMsg.content);
        const usage: TokenUsage = { prompt: promptTokens, completion: completionTokens };
        setTokenUsage(usage);
        cbRef.current.onTokenUsage?.(usage);

        assistantMsg.status = 'complete';
        cbRef.current.onMessage?.({ ...assistantMsg });
        setStatus('idle');
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          assistantMsg.content += '\n\n*操作已中止*';
          assistantMsg.status = 'complete';
          cbRef.current.onMessage?.({ ...assistantMsg });
          setStatus('idle');
          return;
        }
        assistantMsg.status = 'error';
        assistantMsg.content = `错误: ${(err as Error).message}`;
        cbRef.current.onMessage?.({ ...assistantMsg });
        setError((err as Error).message);
        setStatus('idle');
      }
    },
    [],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const requestConfirm = useCallback((req: ConfirmRequest) => {
    setStatus('waitingConfirmation');
    cbRef.current.onConfirm?.(req);
  }, []);

  const resumeAfterConfirm = useCallback(() => {
    setStatus('streaming');
  }, []);

  return { status, error, tokenUsage, run, abort, setCallbacks, requestConfirm, resumeAfterConfirm };
}
