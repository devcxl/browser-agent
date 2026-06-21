import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { UIMessage, ConfirmRequest, TokenUsage } from './types';
import { useConversations } from './hooks/useConversations';
import { useAgent } from './hooks/useAgent';
import { useBrowserState } from './hooks/useBrowserState';
import { ConversationManager } from '@/conversation';
import { Database } from '@/shared/db/database';
import { storedMessagesToUIMessages } from './utils';

const db = Database.getInstance();
const manager = new ConversationManager(db);

interface ChatContextValue {
  // Conversations
  conversations: ReturnType<typeof useConversations>;
  // Agent
  agent: ReturnType<typeof useAgent>;
  // Browser
  browserState: ReturnType<typeof useBrowserState>;
  // Messages for active conversation
  messages: UIMessage[];
  addMessage: (msg: UIMessage) => void;
  clearMessages: () => void;
  // Loading / Error
  messagesLoading: boolean;
  messagesError: string | null;
  // Token usage
  tokenUsage: TokenUsage;
  // Confirm dialog
  confirmRequest: ConfirmRequest | null;
  resolveConfirm: (allowed: boolean) => void;
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
  const prevActiveIdRef = useRef<string | null>(null);
  const prevTokenResetIdRef = useRef<string | null>(null);

  const addMessage = useCallback((msg: UIMessage) => {
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

  const clearMessages = useCallback(() => setMessages([]), []);

  agent.setCallbacks({
    onMessage: addMessage,
    onConfirm: (req) => {
      setConfirmRequest(req);
    },
    onTokenUsage: setTokenUsage,
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
      setMessages([]);
      setMessagesLoading(false);
      setMessagesError(null);
      return;
    }

    let cancelled = false;
    setMessagesLoading(true);
    setMessagesError(null);

    (async () => {
      try {
        const conv = await manager.get(activeId);
        if (cancelled) return;
        if (conv) {
          setMessages(storedMessagesToUIMessages(conv.messages));
        } else {
          setMessages([]);
        }
      } catch (e) {
        if (cancelled) return;
        setMessagesError((e as Error).message);
        setMessages([]);
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
