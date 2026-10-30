import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
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

/** 一条消息及其归属会话 */
interface OwnedMessage {
  msg: UIMessage;
  /** 所属会话；null = 添加时没有活跃会话，待认领 */
  owner: string | null;
}

/** 消息与加载错误放在一起：载入结果的判定必须基于同一份最新状态 */
interface MessageState {
  entries: OwnedMessage[];
  error: string | null;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const conversations = useConversations();
  const agent = useAgent();
  const [messageState, setMessageState] = useState<MessageState>({ entries: [], error: null });
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ prompt: 0, completion: 0 });
  const prevActiveIdRef = useRef<string | null>(null);
  const prevTokenResetIdRef = useRef<string | null>(null);
  const conversationStatuses: Record<string, AgentStatus> = agent.runningConversationId
    ? { [agent.runningConversationId]: agent.status }
    : {};

  const addMessage = useCallback((msg: UIMessage, conversationId?: string) => {
    setMessageState((prev) => {
      const idx = prev.entries.findIndex((e) => e.msg.id === msg.id);
      if (idx >= 0) {
        // 已有条目：只更新消息内容，归属保持首次登记的结果
        // （流式更新会重复提交同一条消息，每次重写会让归属漂移）
        const next = [...prev.entries];
        next[idx] = { ...next[idx]!, msg };
        return { ...prev, entries: next };
      }
      // 归属只用 Agent 运行所在的会话；没有会话 id 时先记为未归属，
      // 由认领 effect 归入当前会话——不拿“当前查看的会话”去猜，
      // 否则切会话的那一帧会把消息判到别的会话名下
      return { ...prev, entries: [...prev.entries, { msg, owner: conversationId ?? null }] };
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

  /** 只展示当前会话的消息：别的会话的条目（含上一个会话的残留）不展示 */
  const messages = useMemo(
    () =>
      messageState.entries
        .filter((e) => e.owner === null || e.owner === conversations.activeId)
        .map((e) => e.msg),
    [messageState.entries, conversations.activeId],
  );

  // 认领未归属的消息：添加时没有会话 id 的消息归入当前会话，
  // 避免它在下一次切换时继续冒充本会话的消息、并顶掉新会话的历史
  useEffect(() => {
    const activeId = conversations.activeId;
    if (!activeId) return;
    if (!messageState.entries.some((e) => e.owner === null)) return;
    setMessageState((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => (e.owner === null ? { ...e, owner: activeId } : e)),
    }));
  }, [messageState.entries, conversations.activeId]);

  // 加载会话历史消息
  useEffect(() => {
    const activeId = conversations.activeId;
    if (activeId === prevActiveIdRef.current) return;
    prevActiveIdRef.current = activeId;

    if (!activeId) {
      setMessageState({ entries: [], error: null });
      setMessagesLoading(false);
      return;
    }

    let cancelled = false;
    setMessagesLoading(true);
    setMessageState((prev) => ({ ...prev, error: null }));

    /** 当前条目里，属于本会话的那些（未归属的也算） */
    const partitionByOwner = (current: OwnedMessage[]) =>
      current.filter((e) => e.owner === null || e.owner === activeId);

    (async () => {
      try {
        const conv = await manager.get(activeId);
        if (cancelled) return;
        const history = conv ? storedMessagesToUIMessages(conv.messages) : [];
        const historyIds = new Set(history.map((m) => m.id));
        setMessageState((prev) => {
          const kept = partitionByOwner(prev.entries);
          // 历史与内存消息合并：历史在前（更早），尚未落库的消息在后。
          // 同 id 只留历史版本——它已是落库后的最终形态。
          const fresh = kept
            .filter((e) => !historyIds.has(e.msg.id))
            .map((e) => ({ ...e, owner: activeId }));
          const others = prev.entries.filter((e) => e.owner !== activeId && e.owner !== null);
          return {
            ...prev,
            entries: [
              ...others,
              ...history.map((msg) => ({ msg, owner: activeId })),
              ...fresh,
            ],
          };
        });
      } catch (e) {
        if (cancelled) return;
        const errorMessage = (e as Error).message;
        setMessageState((prev) => {
          const kept = partitionByOwner(prev.entries);
          const others = prev.entries.filter((e) => e.owner !== activeId && e.owner !== null);
          if (kept.length > 0) {
            // 本会话已有新消息：保留它们，不让加载错误打断当前会话
            return {
              ...prev,
              entries: [...others, ...kept.map((e) => ({ ...e, owner: activeId }))],
            };
          }
          return { entries: others, error: errorMessage };
        });
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
        messagesError: messageState.error,
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
