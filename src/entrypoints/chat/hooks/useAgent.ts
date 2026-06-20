import { useState, useCallback, useRef } from 'react';
import type { AgentStatus, UIMessage, ToolCallDisplay, ConfirmRequest } from '../types';
import type { ProviderConfig } from '@/shared/types';
import type { AgentLoopHooks } from '@/agent/agent-loop';
import type { ToolCallRecord } from '@/shared/types/agent';
import type { IAgentRuntime } from '@/shared/types/agent';
import { uid } from '../utils';

interface AgentCallbacks {
  onMessage?: (msg: UIMessage) => void;
  onConfirm?: (req: ConfirmRequest) => void;
}

export function useAgent() {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cbRef = useRef<AgentCallbacks>({});
  const loopRef = useRef<IAgentRuntime | null>(null);
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);

  const setCallbacks = useCallback((cb: AgentCallbacks) => {
    cbRef.current = cb;
  }, []);

  const run = useCallback(
    async (
      conversationId: string,
      userMessage: string,
      providerConfig: ProviderConfig,
    ) => {
      abortRef.current = new AbortController();
      setStatus('running');
      setError(null);

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
      cbRef.current.onMessage?.({ ...assistantMsg });

      try {
        setStatus('streaming');

        // Dynamic imports for dependencies
        const { AgentLoop } = await import('@/agent/agent-loop');
        const { ToolRegistry } = await import('@/registry');
        const { Guardrail } = await import('@/guardrail');
        const { ConversationManager } = await import('@/conversation');
        const { Database } = await import('@/shared/db/database');
        const { JsonRpcClient } = await import('@/shared/jsonrpc/client');
        const { LlmClient } = await import('@/provider');
        const { createTabsTools } = await import('@/tools/tabs');
        const { createWindowsTools } = await import('@/tools/windows');
        const { createTabGroupsTools } = await import('@/tools/tabgroups');
        const { registerPhase2Tools } = await import('@/tools/phase2-register');
        const { createPageTools } = await import('@/tools/page');

        const db = Database.getInstance();
        const convManager = new ConversationManager(db);
        const rpc = new JsonRpcClient({ name: 'chat-agent' });

        const registry = new ToolRegistry();
        registry.registerAll(createTabsTools(rpc));
        registry.registerAll(createWindowsTools(rpc));
        registry.registerAll(createTabGroupsTools(rpc));
        registerPhase2Tools(registry, rpc);
        registry.registerAll(
          createPageTools(async (params) => {
            const result = await rpc.request('content.execute', params as Record<string, unknown>);
            return result as { success: boolean; data?: unknown; error?: string };
          }),
        );

        const guardrail = new Guardrail(registry);
        const llmClientFactory = (config: ProviderConfig) => new LlmClient(config);

        const config = {
          maxToolRounds: 15,
          systemPrompt: 'You are a browser assistant that can control tabs, windows, and more.',
          maxContextMessages: 40,
          summaryThreshold: { messageCount: 30, estimatedTokens: 12000, toolCallCount: 50 },
        };

        const hooks: AgentLoopHooks = {
          onStreamChunk: (chunk: string) => {
            assistantMsg.content += chunk;
            cbRef.current.onMessage?.({ ...assistantMsg });
          },
          onToolCall: (record: ToolCallRecord) => {
            const display: ToolCallDisplay = {
              id: uid(),
              name: record.toolName,
              params: record.params,
              result: record.result,
              status: record.result.success ? 'success' : 'error',
              riskLevel: record.riskLevel,
              confirmed: record.confirmed,
            };
            if (!assistantMsg.toolCalls) {
              assistantMsg.toolCalls = [];
            }
            const existing = assistantMsg.toolCalls.findIndex(
              (tc) => tc.name === record.toolName,
            );
            if (existing >= 0) {
              assistantMsg.toolCalls[existing] = display;
            } else {
              assistantMsg.toolCalls.push(display);
            }
            cbRef.current.onMessage?.({ ...assistantMsg });
          },
          onConfirm: async (request) => {
            return new Promise<boolean>((resolve) => {
              setStatus('waitingConfirmation');
              confirmResolveRef.current = resolve;
              cbRef.current.onConfirm?.({
                toolName: request.toolName,
                params: request.params,
                affectedObjects: request.affectedObjects.map((obj) => ({
                  type: obj.type,
                  title: obj.title,
                  url: obj.url,
                  reason: obj.reason,
                })),
                warnings: request.warnings,
              });
            });
          },
        };

        const loop = new AgentLoop(
          config,
          registry,
          guardrail,
          convManager,
          llmClientFactory,
          hooks,
        );

        loopRef.current = loop;

        await loop.run({
          conversationId,
          userMessage,
          providerConfig,
          browserContext: {
            currentWindow: { tabs: [] },
            allWindows: [],
            tabGroups: [],
          },
        });

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
    loopRef.current?.abort();
    abortRef.current?.abort();
  }, []);

  const requestConfirm = useCallback((req: ConfirmRequest) => {
    setStatus('waitingConfirmation');
    cbRef.current.onConfirm?.(req);
  }, []);

  const resumeAfterConfirm = useCallback(() => {
    setStatus('streaming');
  }, []);

  const resolveConfirm = useCallback((allowed: boolean) => {
    confirmResolveRef.current?.(allowed);
    confirmResolveRef.current = null;
  }, []);

  return { status, error, run, abort, setCallbacks, requestConfirm, resumeAfterConfirm, resolveConfirm };
}
