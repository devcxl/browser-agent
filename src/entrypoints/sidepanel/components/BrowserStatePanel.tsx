import React from 'react';
import type { BrowserState } from '@/shared/types';
import { cn, formatNum } from '../utils';
import { useI18n } from '../i18n/useI18n';

interface Props {
  state: BrowserState | null;
  loading: boolean;
  error: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function BrowserStatePanel({ state, loading, error, collapsed, onToggleCollapse }: Props) {
  const { t, locale } = useI18n();
  return (
    <div
      data-testid="browser-state-panel"
      className={cn(
        'border-l border-hairline bg-canvas flex flex-col',
        collapsed ? 'w-10' : 'w-[280px]',
      )}
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex items-center justify-between px-3 py-2 border-b border-hairline text-xs font-medium text-mute hover:bg-surface-soft"
      >
        {collapsed ? '◀' : <span>{t('browser.title')} ◀</span>}
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2 text-xs">
          {loading && (
            <div className="flex items-center justify-center py-8 text-mute">
              <span className="inline-block w-3 h-3 border-2 border-ash border-t-primary rounded-full animate-spin mr-2" />
              {t('browser.loading')}
            </div>
          )}

          {error && (
            <div className="text-danger bg-red-50 rounded-md px-2 py-1">
              {t('browser.error')}: {error}
            </div>
          )}

          {!loading && !error && !state && (
            <div className="text-mute text-center py-8">{t('browser.noData')}</div>
          )}

          {!loading && state && (
            <>
              <p className="text-[10px] font-semibold text-mute uppercase tracking-wider">
                {t('browser.windows')} ({formatNum(state.windows.length, locale)})
              </p>
              {state.windows.map((w) => (
                <div
                  key={w.id}
                  className={cn(
                    'rounded-md px-2 py-1',
                    w.focused ? 'bg-surface-soft border border-hairline-strong' : 'bg-surface-soft',
                  )}
                >
                  <div className="flex items-center gap-1">
                    <span className="text-ink font-medium truncate flex-1">
                      {w.title ?? `${t('browser.windowLabel')} ${formatNum(w.id, locale)}`}
                    </span>
                    {w.focused && (
                      <span className="text-[9px] bg-primary text-on-primary px-1 rounded-full">
                        {t('browser.active')}
                      </span>
                    )}
                  </div>
                  {w.type && <span className="text-mute">{w.type}</span>}
                </div>
              ))}

              <p className="text-[10px] font-semibold text-mute uppercase tracking-wider pt-2">
                {t('browser.tabs')} ({formatNum(state.tabs.length, locale)})
              </p>
              {state.tabs.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    'rounded-md px-2 py-1 flex items-center gap-1.5',
                    t.active ? 'bg-surface-soft border border-hairline-strong' : 'hover:bg-surface-soft',
                  )}
                >
                  {t.favIconUrl && (
                    <img src={t.favIconUrl} alt="" className="w-3.5 h-3.5" />
                  )}
                  <span className="truncate flex-1 text-ink">{t.title}</span>
                  {t.audible && <span className="text-success text-[10px]">🔊</span>}
                  {t.pinned && <span className="text-ash text-[10px]">📌</span>}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
