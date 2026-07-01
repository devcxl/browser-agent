import { useState, useCallback, useRef } from 'react';
import type { AgentStatus, UIMessage, ToolCallDisplay, ConfirmRequest, TokenUsage } from '../types';
import type { ProviderConfig } from '@/shared/types';
import type { AgentLoopHooks } from '@/agent/agent-loop';
import type { ToolCallRecord } from '@/shared/types/agent';
import type { IAgentRuntime, AgentConfig } from '@/shared/types/agent';
import type { IToolRegistry } from '@/registry/types';
import type { IGuardrail } from '@/shared/types/guardrail';
import type { IConversationManager } from '@/shared/types/conversation';
import type { IJsonRpcClient } from '@/shared/types';
import { uid } from '../utils';
import { ConfigStore } from '@/shared/storage';

import type { ISkillStore } from '@/shared/types/skill';

interface AgentCallbacks {
  onMessage?: (msg: UIMessage) => void;
  onConfirm?: (req: ConfirmRequest) => void;
  onTokenUsage?: (usage: TokenUsage) => void;
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
  skillStore: ISkillStore;
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
      { createSkillTool },
      { SkillStore },
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
      import('@/tools/skill-tool'),
      import('@/shared/storage'),
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
      createPageTools(
        async (params) => {
          const result = await rpc.request('content.execute', params as Record<string, unknown>);
          return { success: true, data: result };
        },
        rpc,
      ),
    );

    // Skill 伪 tool：注册到 ToolRegistry 使 LLM 可通过 function calling 调用
    registry.register(createSkillTool());

    const guardrail = new Guardrail(registry);
    const skillStore = SkillStore.getInstance();

    return { AgentLoop, ToolRegistry, Guardrail, ConversationManager, JsonRpcClient, LlmClient, registry, guardrail, convManager, rpc, skillStore };
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
  const [runningConversationId, setRunningConversationId] = useState<string | null>(null);
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
      reasoningEffort?: import('@/shared/types').ReasoningEffort,
    ) => {
      setRunningConversationId(conversationId);
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
      };
      cbRef.current.onMessage?.({ ...assistantMsg });

      try {
        setStatus('streaming');

        const { AgentLoop, registry, guardrail, convManager, LlmClient, skillStore } = await getDeps();

        const agentConfig: AgentConfig = {
          maxToolRounds: 15,
          systemPrompt: 'You are a browser assistant that can control tabs, windows, and more.',
          maxContextMessages: 40,
          reasoningEffort,
          summaryThreshold: { messageCount: 30, estimatedTokens: 12000, toolCallCount: 50 },
        };

        const hooks: AgentLoopHooks = {
          onStreamChunk: (chunk: string) => {
            // 如果上次助理消息已结束（被 tool call 拆分），新建一个
            if (assistantMsg.status === 'complete') {
              cbRef.current.onMessage?.({
                ...assistantMsg,
                status: 'complete',
                toolCallDisplay: undefined,
              });
              assistantMsg.id = uid();
              assistantMsg.content = '';
              assistantMsg.reasoningContent = undefined;
              assistantMsg.toolCallDisplay = undefined;
              assistantMsg.status = 'streaming';
              assistantMsg.timestamp = Date.now();
            }
            // 兼容两种流式模式：部分 provider 返回增量 delta，部分返回完整累积文本
            const existing = assistantMsg.content;
            if (chunk.length >= existing.length && chunk.startsWith(existing)) {
              assistantMsg.content = chunk;
            } else {
              assistantMsg.content = existing + chunk;
            }
            cbRef.current.onMessage?.({ ...assistantMsg });
          },
          onReasoningChunk: (chunk: string) => {
            const existing = assistantMsg.reasoningContent ?? '';
            if (chunk.length >= existing.length && chunk.startsWith(existing)) {
              assistantMsg.reasoningContent = chunk;
            } else {
              assistantMsg.reasoningContent = existing + chunk;
            }
            cbRef.current.onMessage?.({ ...assistantMsg });
          },
          onToolCall: (record: ToolCallRecord) => {
            // 当前 assistant 消息如有文本则先终结
            if (assistantMsg.content) {
              cbRef.current.onMessage?.({ ...assistantMsg, status: 'complete', toolCallDisplay: undefined });
            }
            // 输出 tool 消息气泡
            const tc = recordToDisplay(record);
            cbRef.current.onMessage?.({
              id: uid(),
              role: 'tool',
              content: record.toolName,
              toolCallDisplay: tc,
              timestamp: Date.now(),
              status: tc.status,
            });
            // 重置 assistant 消息准备接收下一轮文本
            assistantMsg.id = uid();
            assistantMsg.content = '';
            assistantMsg.reasoningContent = undefined;
            assistantMsg.toolCallDisplay = undefined;
            assistantMsg.status = 'streaming';
            assistantMsg.timestamp = Date.now();
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

        // 从 SkillStore 获取已启用的 skills，加载完整内容后传入 AgentLoop
        const enabledSkills = await skillStore.getEnabled();
        const readySkills = await skillStore.loadReady(enabledSkills);

        // 从 ConfigStore 读取 Expert Mode 设置
        const expertModeSettings = await ConfigStore.getInstance().get('expertModeSettings');

        const output = await loop.run({
          conversationId,
          userMessage,
          providerConfig,
          browserContext: {
            currentWindow: { tabs: [] },
            allWindows: [],
            tabGroups: [],
          },
          skills: readySkills,
          expertModeSettings,
        });

        // 兜底：hooks 未覆盖的场景（如 maxToolRounds 终止、无效工具等）
        if (!assistantMsg.content && output.finalMessage) {
          assistantMsg.content = output.finalMessage;
        }
        if (output.tokenUsage) {
          cbRef.current.onTokenUsage?.(output.tokenUsage);
        }
        assistantMsg.status = 'complete';
        cbRef.current.onMessage?.({ ...assistantMsg });
        setRunningConversationId(null);
        setStatus('idle');
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          assistantMsg.content += '\n\n*操作已中止*';
          assistantMsg.status = 'complete';
          cbRef.current.onMessage?.({ ...assistantMsg });
          setRunningConversationId(null);
          setStatus('idle');
          return;
        }
        assistantMsg.status = 'error';
        assistantMsg.content = `错误: ${(err as Error).message}`;
        cbRef.current.onMessage?.({ ...assistantMsg });
        setError((err as Error).message);
        setRunningConversationId(null);
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

  return { status, error, run, abort, setCallbacks, resolveConfirm, runningConversationId };
}
