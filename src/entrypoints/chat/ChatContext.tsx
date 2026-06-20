import React, { createContext, useContext, useState, useCallback } from 'react';
import type { UIMessage, ConfirmRequest } from './types';
import { useConversations } from './hooks/useConversations';
import { useAgent } from './hooks/useAgent';
import { useBrowserState } from './hooks/useBrowserState';

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
  const [confirmResolver, setConfirmResolver] = useState<((v: boolean) => void) | null>(null);

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
      setConfirmResolver(() => (allowed: boolean) => {
        setConfirmRequest(null);
        if (allowed) agent.resumeAfterConfirm();
      });
    },
  });

  const resolveConfirm = useCallback(
    (allowed: boolean) => {
      confirmResolver?.(allowed);
      setConfirmRequest(null);
    },
    [confirmResolver],
  );

  return (
    <ChatContext.Provider
      value={{
        conversations,
        agent,
        browserState,
        messages,
        addMessage,
        clearMessages,
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
