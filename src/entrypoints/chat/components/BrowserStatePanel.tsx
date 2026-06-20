import React from 'react';
import type { BrowserState } from '@/shared/types';
import { cn } from '../utils';

interface Props {
  state: BrowserState | null;
  loading: boolean;
  error: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function BrowserStatePanel({ state, loading, error, collapsed, onToggleCollapse }: Props) {
  return (
    <div
      data-testid="browser-state-panel"
      className={cn(
        'border-l border-gray-200 bg-white flex flex-col',
        collapsed ? 'w-10' : 'w-[280px]',
      )}
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex items-center justify-between px-3 py-2 border-b border-gray-100 text-xs font-medium text-gray-500 hover:bg-gray-50"
      >
        {collapsed ? '◀' : <span>浏览器状态 ◀</span>}
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2 text-xs">
          {loading && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mr-2" />
              加载中...
            </div>
          )}

          {error && (
            <div className="text-red-500 bg-red-50 rounded px-2 py-1">
              错误: {error}
            </div>
          )}

          {!loading && !error && !state && (
            <div className="text-gray-400 text-center py-8">无数据</div>
          )}

          {!loading && state && (
            <>
              {/* Windows */}
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                窗口 ({state.windows.length})
              </p>
              {state.windows.map((w) => (
                <div
                  key={w.id}
                  className={cn(
                    'rounded px-2 py-1',
                    w.focused ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50',
                  )}
                >
                  <div className="flex items-center gap-1">
                    <span className="text-gray-700 font-medium truncate flex-1">
                      {w.title ?? `窗口 ${w.id}`}
                    </span>
                    {w.focused && (
                      <span className="text-[9px] bg-blue-100 text-blue-600 px-1 rounded">
                        活跃
                      </span>
                    )}
                  </div>
                  {w.type && <span className="text-gray-400">{w.type}</span>}
                </div>
              ))}

              {/* Tabs */}
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pt-2">
                标签页 ({state.tabs.length})
              </p>
              {state.tabs.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    'rounded px-2 py-1 flex items-center gap-1.5',
                    t.active ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50',
                  )}
                >
                  {t.favIconUrl && (
                    <img src={t.favIconUrl} alt="" className="w-3.5 h-3.5" />
                  )}
                  <span className="truncate flex-1 text-gray-700">{t.title}</span>
                  {t.audible && <span className="text-green-500 text-[10px]">🔊</span>}
                  {t.pinned && <span className="text-gray-300 text-[10px]">📌</span>}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
