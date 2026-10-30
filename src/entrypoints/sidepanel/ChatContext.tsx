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
  /** 添加一条消息；`conversationId` 必填——归属不能靠“当前查看的会话”反推 */
  addMessage: (msg: UIMessage, conversationId: string) => void;
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
  owner: string;
}

/**
 * 消息是否可能「尚未落库」，因此需要在历史之外额外保留。
 *
 * - 用户消息：落库后 id 不变（UI 生成、Agent 复用），载入历史时按 id 就能去掉；
 * - 助手/工具气泡：落库后 id 会变（Agent 侧另生成），只能靠状态判断还在输出。
 *   工具气泡的 status 来自 ToolCallDisplay，取值比 UIMessage.status 更宽（含 'running'）。
 */
function isNotYetPersisted(msg: UIMessage): boolean {
  if (msg.role === 'user') return true;
  const status: string | undefined = msg.status;
  return status === 'streaming' || status === 'running';
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
  const activeId = conversations.activeId;
  const runningConversationId = agent.runningConversationId;
  const conversationStatuses: Record<string, AgentStatus> = agent.runningConversationId
    ? { [agent.runningConversationId]: agent.status }
    : {};

  const addMessage = useCallback((msg: UIMessage, conversationId: string) => {
    setMessageState((prev) => {
      const idx = prev.entries.findIndex((e) => e.msg.id === msg.id);
      // 新消息：归属就取 Agent 运行所在的会话
      if (idx < 0) return { ...prev, entries: [...prev.entries, { msg, owner: conversationId }] };
      // 同一条消息的流式更新：只换内容，不重算归属（否则归属会随查看会话漂移）
      return {
        ...prev,
        entries: prev.entries.map((e, i) => (i === idx ? { ...e, msg } : e)),
      };
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

  /** 只展示当前会话的消息：切走时别的会话的条目不会挂在新会话下 */
  const messages = useMemo(
    () => messageState.entries.filter((e) => e.owner === activeId).map((e) => e.msg),
    [messageState.entries, activeId],
  );

  // 内存里只保留「当前会话 + 运行中会话」的消息，其余以数据库为准。
  // 侧边栏是长期存活页面：留着副本会让流式更新的每次拷贝随累计历史增长；
  // 而且助手/工具气泡落库后 id 会变，旧副本与历史无法按 id 去重，
  // 只能靠离开时丢弃来避免「切走再切回就出现两份回复」。
  useEffect(() => {
    setMessageState((prev) => {
      const kept = prev.entries.filter(
        (e) => e.owner === activeId || e.owner === runningConversationId,
      );
      return kept.length === prev.entries.length ? prev : { ...prev, entries: kept };
    });
  }, [activeId, runningConversationId]);

  // 加载会话历史消息
  useEffect(() => {
    const active = conversations.activeId;
    if (active === prevActiveIdRef.current) return;
    prevActiveIdRef.current = active;

    if (!active) {
      setMessageState({ entries: [], error: null });
      setMessagesLoading(false);
      return;
    }

    // 运行中的会话由内存持有（上面的清理会保留它）：重载历史会把正在输出的气泡复制一份
    if (active === runningConversationId) {
      setMessagesLoading(false);
      return;
    }

    setMessagesLoading(true);
    setMessageState((prev) => ({ ...prev, error: null }));
    const running = runningConversationId;
    let cancelled = false;

    (async () => {
      try {
        const conv = await manager.get(active);
        if (cancelled) return;
        const history = conv ? storedMessagesToUIMessages(conv.messages) : [];
        const historyIds = new Set(history.map((m) => m.id));
        setMessageState((prev) => {
          // 载入期间到达、且不可能已在历史里的消息接在后面：
          // 否则新建会话的第一条消息会被空历史顶掉。
          // - 用户消息：落库后 id 不变（UI 生成、Agent 复用），在历史里就能按 id 去掉
          // - 还在输出的助手/工具气泡：落库后 id 会变，只能靠状态判定“尚未落库”
          const live = prev.entries.filter(
            (e) => e.owner === active && !historyIds.has(e.msg.id) && isNotYetPersisted(e.msg),
          );
          const runningEntries = prev.entries.filter((e) => e.owner === running);
          return {
            entries: [
              ...runningEntries,
              ...history.map((msg) => ({ msg, owner: active })),
              ...live,
            ],
            error: null,
          };
        });
      } catch (e) {
        if (cancelled) return;
        const errorMessage = (e as Error).message;
        setMessageState((prev) => {
          // 当前会话已有新消息：保留它们，不让加载错误打断正在进行的对话
          if (prev.entries.some((e) => e.owner === active)) return prev;
          return { entries: prev.entries, error: errorMessage };
        });
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversations.activeId, runningConversationId]);

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
