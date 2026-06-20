import { useState, useCallback, useRef } from 'react';
import type { AgentStatus, UIMessage, ToolCallDisplay, ConfirmRequest } from '../types';
import type { ProviderConfig } from '@/shared/types';
import type { AgentLoopHooks } from '@/agent/agent-loop';
import type { ToolCallRecord } from '@/shared/types/agent';
import type { IAgentRuntime, AgentConfig } from '@/shared/types/agent';
import type { IToolRegistry } from '@/registry/types';
import type { IGuardrail } from '@/shared/types/guardrail';
import type { IConversationManager } from '@/shared/types/conversation';
import type { IJsonRpcClient } from '@/shared/types';
import { uid } from '../utils';

interface AgentCallbacks {
  onMessage?: (msg: UIMessage) => void;
  onConfirm?: (req: ConfirmRequest) => void;
}

interface AgentDeps {
  AgentLoop: typeof import('@/agent/agent-loop').AgentLoop;
  ToolRegistry: typeof import('@/registry').ToolRegistry;
  Guardrail: typeof import('@/guardrail').Guardrail;
  ConversationManager: typeof import('@/conversation').ConversationManager;
  JsonRpcClient: typeof import('@/shared/jsonrpc/client').JsonRpcClient;
  LlmClient: typeof import('@/provider').LlmClient;
  registry: IToolRegistry;
  guardrail: IGuardrail;
  convManager: IConversationManager;
  rpc: IJsonRpcClient;
}

let _deps: Promise<AgentDeps> | null = null;

async function getDeps(): Promise<AgentDeps> {
  if (_deps) return _deps;
  _deps = (async () => {
    const [
      { AgentLoop },
      { ToolRegistry },
      { Guardrail },
      { ConversationManager },
      { JsonRpcClient },
      { LlmClient },
      { Database },
      { createTabsTools },
      { createWindowsTools },
      { createTabGroupsTools },
      { registerPhase2Tools },
      { createPageTools },
    ] = await Promise.all([
      import('@/agent/agent-loop'),
      import('@/registry'),
      import('@/guardrail'),
      import('@/conversation'),
      import('@/shared/jsonrpc/client'),
      import('@/provider'),
      import('@/shared/db/database'),
      import('@/tools/tabs'),
      import('@/tools/windows'),
      import('@/tools/tabgroups'),
      import('@/tools/phase2-register'),
      import('@/tools/page'),
    ]);

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

    return { AgentLoop, ToolRegistry, Guardrail, ConversationManager, JsonRpcClient, LlmClient, registry, guardrail, convManager, rpc };
  })();
  return _deps;
}

function recordToDisplay(record: ToolCallRecord): ToolCallDisplay {
  return {
    id: uid(),
    name: record.toolName,
    params: record.params,
    result: record.result,
    status: record.result.success ? 'success' : 'error',
    riskLevel: record.riskLevel,
    confirmed: record.confirmed,
  };
}

export function useAgent() {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
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

        const { AgentLoop, registry, guardrail, convManager, LlmClient } = await getDeps();

        const agentConfig: AgentConfig = {
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
            if (!assistantMsg.toolCalls) assistantMsg.toolCalls = [];
            assistantMsg.toolCalls.push(recordToDisplay(record));
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

        const llmClientFactory = (config: ProviderConfig) => new LlmClient(config);

        const loop = new AgentLoop(
          agentConfig,
          registry,
          guardrail,
          convManager,
          llmClientFactory,
          hooks,
        );

        loopRef.current = loop;

        const output = await loop.run({
          conversationId,
          userMessage,
          providerConfig,
          browserContext: {
            currentWindow: { tabs: [] },
            allWindows: [],
            tabGroups: [],
          },
        });

        // 兜底：hooks 未覆盖的场景（如 maxToolRounds 终止、无效工具等）
        if (!assistantMsg.content && output.finalMessage) {
          assistantMsg.content = output.finalMessage;
        }
        if (output.toolCalls.length > 0) {
          if (!assistantMsg.toolCalls) assistantMsg.toolCalls = [];
          // hooks 已通过 onToolCall 推送了所有工具调用，此处仅做二次兜底
          for (const tc of output.toolCalls) {
            assistantMsg.toolCalls.push(recordToDisplay(tc));
          }
        }
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
  }, []);

  const resolveConfirm = useCallback((allowed: boolean) => {
    confirmResolveRef.current?.(allowed);
    confirmResolveRef.current = null;
  }, []);

  return { status, error, run, abort, setCallbacks, resolveConfirm };
}
