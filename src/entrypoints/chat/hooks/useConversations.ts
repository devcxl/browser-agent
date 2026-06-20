import { useState, useCallback, useEffect, useRef } from 'react';
import type { ConversationSummary } from '../types';
import { ConversationManager } from '@/conversation';
import { Database } from '@/shared/db/database';
import { ConfigStore } from '@/shared/storage';

const db = Database.getInstance();
const manager = new ConversationManager(db);
const store = ConfigStore.getInstance();

export function useConversations() {
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialRestoredRef = useRef(false);

  const setActiveIdAndPersist = useCallback((id: string | null) => {
    setActiveId(id);
    store.set('activeConversationId', id ?? undefined);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const convs = await manager.list();
      setList(
        convs
          .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async () => {
    const conv = await manager.create();
    setActiveIdAndPersist(conv.id);
    await refresh();
    return conv.id;
  }, [refresh, setActiveIdAndPersist]);

  const select = useCallback((id: string) => {
    setActiveIdAndPersist(id);
  }, [setActiveIdAndPersist]);

  const rename = useCallback(
    async (id: string, title: string) => {
      await manager.update(id, { title });
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await manager.delete(id);
      if (activeId === id) setActiveIdAndPersist(null);
      await refresh();
    },
    [refresh, activeId, setActiveIdAndPersist],
  );

  // 初始化：先恢复持久化的 activeId，否则选最近会话
  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (initialRestoredRef.current || loading) return;
    initialRestoredRef.current = true;

    (async () => {
      const savedId = await store.get<string | undefined>('activeConversationId');
      if (savedId) {
        const conv = await manager.get(savedId);
        if (conv) {
          setActiveId(savedId);
          return;
        }
      }
      // 降级：选最近更新的会话
      const convs = await manager.list();
      if (convs.length > 0) {
        const sorted = [...convs].sort((a, b) => b.updatedAt - a.updatedAt);
        setActiveId(sorted[0]!.id);
      }
    })();
  }, [loading]);

  return { list, activeId, loading, error, create, select, rename, remove, refresh };
}
