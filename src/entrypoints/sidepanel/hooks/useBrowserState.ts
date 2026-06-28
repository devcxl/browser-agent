import { useState, useEffect, useCallback, useRef } from 'react';
import type { BrowserState } from '@/shared/types';

const POLL_INTERVAL = 3000;

export function useBrowserState() {
  const [state, setState] = useState<BrowserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const tabs = await browser.tabs.query({});
      const windows = await browser.windows.getAll({ populate: false });
      const tabGroups = typeof browser.tabGroups !== 'undefined'
        ? await browser.tabGroups.query({})
        : [];

      setState({
        windows: windows.map((w) => ({
          id: w.id,
          focused: w.focused ?? false,
          incognito: w.incognito ?? false,
          alwaysOnTop: w.alwaysOnTop ?? false,
          type: w.type as any,
          state: w.state as any,
          title: w.title,
        })),
        tabs: tabs.map((t) => ({
          id: t.id,
          index: t.index,
          windowId: t.windowId,
          groupId: (t as any).groupId ?? -1,
          openerTabId: t.openerTabId,
          title: t.title,
          url: t.url,
          favIconUrl: t.favIconUrl,
          active: t.active ?? false,
          pinned: t.pinned ?? false,
          audible: t.audible,
          discarded: t.discarded ?? false,
          incognito: t.incognito ?? false,
          status: t.status as any,
        })),
        tabGroups: tabGroups.map((g) => ({
          id: g.id,
          collapsed: g.collapsed ?? false,
          color: g.color as any,
          title: g.title,
          windowId: g.windowId,
        })),
        capturedAt: Date.now(),
      });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    pollRef.current = setInterval(fetchState, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchState]);

  return { state, loading, error, refresh: fetchState };
}
