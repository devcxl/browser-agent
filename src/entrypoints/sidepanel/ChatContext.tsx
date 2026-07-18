import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { AgentStatus, UIMessage, ConfirmRequest, TokenUsage } from './types';
import { useConversations } from './hooks/useConversations';
import { useAgent } from './hooks/useAgent';
import { useChatAgent } from './hooks/useChatAgent';
import { useBrowserState } from './hooks/useBrowserState';
import { ConversationManager } from '@/conversation';
import { Database } from '@/shared/db/database';
import { storedMessagesToUIMessages } from './utils';
import { FEATURE_FLAGS } from '@/shared/feature-flags';
import { ToolLoopAdapter } from '@/agent/tool-loop-adapter';
import { ToolRegistry } from '@/registry';
import { Guardrail } from '@/guardrail';

const db = Database.getInstance();
const manager = new ConversationManager(db);

interface ChatContextValue {
  conversations: ReturnType<typeof useConversations>;
  agent: ReturnType<typeof useAgent>;
  browserState: ReturnType<typeof useBrowserState>;
  messages: UIMessage[];
  addMessage: (msg: UIMessage) => void;
  clearMessages: () => void;
  messagesLoading: boolean;
  messagesError: string | null;
  tokenUsage: TokenUsage;
  confirmRequest: ConfirmRequest | null;
  resolveConfirm: (allowed: boolean) => void;
  conversationStatuses: Record<string, AgentStatus>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * SDK Chat Provider — 使用 useChat + DirectChatTransport。
 * 当 FEATURE_FLAGS.useSDKChat 为 true 时使用此 Provider。
 */
function ChatProviderSDK({ children }: { children: React.ReactNode }) {
  const conversations = useConversations();
  const browserState = useBrowserState();
  const [conversationStatuses] = useState<Record<string, AgentStatus>>({});

  // 创建适配器实例
  const registry = new ToolRegistry();
  const guardrail = new Guardrail(registry);
  const convManager = new ConversationManager(db);

  const adapter = new ToolLoopAdapter(
    registry,
    guardrail,
    convManager,
    { id: 'default', name: 'default', providerId: 'openai', endpoint: '', apiKey: '' },
    'gpt-4o',
  );

  const { messages: sdkMessages, sendMessage, status, error, stop } = useChatAgent(adapter);

  // 将 AI SDK UIMessage[] 适配到我们的 UIMessage 类型，保留 parts 数组
  const messages: UIMessage[] = useMemo(
    () =>
      sdkMessages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'tool',
        parts: m.parts,
        timestamp: Date.now(),
      })),
    [sdkMessages],
  );

  const sdkAgent: ReturnType<typeof useAgent> = {
    status: (status === 'streaming' || status === 'submitted') ? 'streaming' : 'idle' as AgentStatus,
    error: error?.message ?? null,
    run: async (
      _conversationId: string,
      userMessage: string,
    ) => {
      sendMessage({ text: userMessage });
    },
    abort: () => stop(),
    setCallbacks: () => {},
    resolveConfirm: () => {},
    runningConversationId: null,
  };

  return (
    <ChatContext.Provider
      value={{
        conversations,
        agent: sdkAgent,
        browserState,
        messages,
        addMessage: () => {},
        clearMessages: () => {},
        messagesLoading: false,
        messagesError: error?.message ?? null,
        tokenUsage: { prompt: 0, completion: 0 },
        confirmRequest: null,
        resolveConfirm: () => {},
        conversationStatuses,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  // Feature Flag：useSDKChat 启用时使用 SDK Chat Provider
  if (FEATURE_FLAGS.useSDKChat) {
    return <ChatProviderSDK>{children}</ChatProviderSDK>;
  }

  return <ChatProviderLegacy>{children}</ChatProviderLegacy>;
}

function ChatProviderLegacy({ children }: { children: React.ReactNode }) {
  const conversations = useConversations();
  const agent = useAgent();
  const browserState = useBrowserState();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ prompt: 0, completion: 0 });
  const [conversationStatuses, setConversationStatuses] = useState<Record<string, AgentStatus>>({});
  const prevActiveIdRef = useRef<string | null>(null);
  const prevTokenResetIdRef = useRef<string | null>(null);
  const messageVersionRef = useRef(0);

  // 跟踪每个会话的 agent 状态 — 使用 agent.runningConversationId 而非 activeId
  useEffect(() => {
    const id = agent.runningConversationId;
    if (id) {
      setConversationStatuses((prev) => ({ ...prev, [id]: agent.status }));
    }
  }, [agent.status, agent.runningConversationId]);

  // 跟踪每个会话的 agent 状态
  useEffect(() => {
    if (conversations.activeId) {
      setConversationStatuses((prev) => ({
        ...prev,
        [conversations.activeId!]: agent.status,
      }));
    }
  }, [agent.status, conversations.activeId]);

  const addMessage = useCallback((msg: UIMessage) => {
    messageVersionRef.current += 1;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msg.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = msg;
        return next;
      }
      return [...prev, msg];
    });
  }, []);

  const clearMessages = useCallback(() => {
    messageVersionRef.current += 1;
    setMessages([]);
  }, []);

  agent.setCallbacks({
    onMessage: addMessage,
    onConfirm: (req) => {
      setConfirmRequest(req);
    },
    onTokenUsage: setTokenUsage,
    onConversationTitle: () => {
      console.debug('[Title] UI 收到标题更新通知, 刷新会话列表');
      void conversations.refresh();
    },
  });

  // Reset tokenUsage on conversation switch
  useEffect(() => {
    if (conversations.activeId !== prevTokenResetIdRef.current) {
      prevTokenResetIdRef.current = conversations.activeId;
      setTokenUsage({ prompt: 0, completion: 0 });
    }
  }, [conversations.activeId]);

  const resolveConfirm = useCallback(
    (allowed: boolean) => {
      agent.resolveConfirm(allowed);
      setConfirmRequest(null);
    },
    [agent],
  );

  // 加载会话历史消息
  useEffect(() => {
    const activeId = conversations.activeId;
    if (activeId === prevActiveIdRef.current) return;
    prevActiveIdRef.current = activeId;

    if (!activeId) {
      messageVersionRef.current += 1;
      setMessages([]);
      setMessagesLoading(false);
      setMessagesError(null);
      return;
    }

    let cancelled = false;
    const messageVersionAtLoadStart = messageVersionRef.current;
    setMessagesLoading(true);
    setMessagesError(null);

    (async () => {
      try {
        const conv = await manager.get(activeId);
        if (cancelled) return;
        if (conv) {
          setMessages((currentMessages) => (
            messageVersionRef.current === messageVersionAtLoadStart
              ? storedMessagesToUIMessages(conv.messages)
              : currentMessages
          ));
        } else {
          setMessages((currentMessages) => (
            messageVersionRef.current === messageVersionAtLoadStart ? [] : currentMessages
          ));
        }
      } catch (e) {
        if (cancelled) return;
        if (messageVersionRef.current === messageVersionAtLoadStart) {
          setMessagesError((e as Error).message);
          setMessages([]);
        }
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversations.activeId]);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        agent,
        browserState,
        messages,
        addMessage,
        clearMessages,
        messagesLoading,
        messagesError,
        tokenUsage,
        confirmRequest,
        resolveConfirm,
        conversationStatuses,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
