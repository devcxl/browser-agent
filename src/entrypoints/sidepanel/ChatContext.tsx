import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { AgentStatus, UIMessage, ConfirmRequest, TokenUsage } from './types';
import { useConversations } from './hooks/useConversations';
import { useAgent } from './hooks/useAgent';
import { useBrowserState } from './hooks/useBrowserState';
import { ConversationManager } from '@/conversation';
import { Database } from '@/shared/db/database';
import { storedMessagesToUIMessages } from './utils';

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

export function ChatProvider({ children }: { children: React.ReactNode }) {
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
