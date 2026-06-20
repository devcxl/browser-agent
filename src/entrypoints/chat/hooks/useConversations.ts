import { useState, useCallback, useEffect, useRef } from 'react';
import type { ConversationSummary } from '../types';
import { ConversationManager } from '@/conversation';
import { Database } from '@/shared/db/database';

const db = Database.getInstance();
const manager = new ConversationManager(db);

export function useConversations() {
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setActiveId(conv.id);
    await refresh();
    return conv.id;
  }, [refresh]);

  const select = useCallback((id: string) => {
    setActiveId(id);
  }, []);

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
      if (activeId === id) setActiveId(null);
      await refresh();
    },
    [refresh, activeId],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { list, activeId, loading, error, create, select, rename, remove, refresh };
}
