import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { AgentStatus, UIMessage, ConfirmRequest, TokenUsage } from './types';
import { useConversations } from './hooks/useConversations';
import { useAgent } from './hooks/useAgent';
import { ConversationManager } from '@/conversation';
import { Database } from '@/shared/db/database';
import { storedMessagesToUIMessages } from './utils';

const db = Database.getInstance();
const manager = new ConversationManager(db);

interface ChatContextValue {
  conversations: ReturnType<typeof useConversations>;
  agent: ReturnType<typeof useAgent>;
  messages: UIMessage[];
  addMessage: (msg: UIMessage, conversationId?: string) => void;
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
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ prompt: 0, completion: 0 });
  const prevActiveIdRef = useRef<string | null>(null);
  const prevTokenResetIdRef = useRef<string | null>(null);
  /**
   * 消息归属：message id → 会话 id。
   *
   * 载入历史时需要区分「属于本会话的乐观消息」（还没落库，历史里没有）与
   * 「上一个会话的残留」。靠「载入期间是否有新消息」判断不够：React 19 下
   * 乐观消息可能先于载入 effect 到达（会话刚创建就发消息的场景），那时
   * 版本号并未变化，历史会直接盖掉乐观消息。
   */
  const messageOwnersRef = useRef(new Map<string, string>());
  /** 最新值 ref：addMessage 回调不闭包过期的 activeId */
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = conversations.activeId;
  /** 最近一次渲染的消息快照：异步回调里读取当前消息用 */
  const messagesRef = useRef<UIMessage[]>([]);
  messagesRef.current = messages;
  const conversationStatuses: Record<string, AgentStatus> = agent.runningConversationId
    ? { [agent.runningConversationId]: agent.status }
    : {};

  const addMessage = useCallback((msg: UIMessage, conversationId?: string) => {
    const owner = conversationId ?? activeIdRef.current;
    // 归属一旦登记就不再改写：流式更新会重复提交同一条消息，
    // 若每次重写，owner 会随“当前查看的会话”漂移
    if (owner && !messageOwnersRef.current.has(msg.id)) {
      messageOwnersRef.current.set(msg.id, owner);
    }
    // 只展示当前会话的消息：Agent 在别的会话产出的消息不应串台
    if (owner && owner !== activeIdRef.current) return;
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

  agent.setCallbacks({
    onMessage: (msg, conversationId) => {
      // 归属用 Agent 运行所在的会话，而不是用户当前查看的会话
      addMessage(msg, conversationId);
    },
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
      setMessages([]);
      setMessagesLoading(false);
      setMessagesError(null);
      return;
    }

    let cancelled = false;
    setMessagesLoading(true);
    setMessagesError(null);

    /**
     * 把当前展示的消息分成「属于本会话的」与「其他会话的残留」。
     * 未登记归属的消息（添加时没有活跃会话）归入正在载入的会话，
     * 并当场认领归属，避免它在下一次切换时继续冒充本会话的消息。
     */
    const partitionByOwner = (current: UIMessage[]) => {
      const kept: UIMessage[] = [];
      for (const msg of current) {
        const owner = messageOwnersRef.current.get(msg.id);
        if (owner === undefined) {
          messageOwnersRef.current.set(msg.id, activeId);
          kept.push(msg);
        } else if (owner === activeId) {
          kept.push(msg);
        }
      }
      return kept;
    };

    (async () => {
      try {
        const conv = await manager.get(activeId);
        if (cancelled) return;
        const history = conv ? storedMessagesToUIMessages(conv.messages) : [];
        // 历史消息归属于本会话，后续切走时才能正确丢弃
        for (const msg of history) messageOwnersRef.current.set(msg.id, activeId);
        setMessages((currentMessages) => {
          const kept = partitionByOwner(currentMessages);
          // 已有本会话的消息（乐观消息还没落库）→ 保留，不被历史覆盖
          if (kept.length > 0) return kept;
          return history;
        });
      } catch (e) {
        if (cancelled) return;
        const kept = partitionByOwner(messagesRef.current);
        if (kept.length > 0) {
          // 本会话已有新消息：保留它们，不让加载错误打断当前会话
          setMessages(kept);
        } else {
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
        messages,
        addMessage,
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
