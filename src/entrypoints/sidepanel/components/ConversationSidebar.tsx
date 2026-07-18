import React, { useState } from 'react';
import type { ConversationSummary, TokenUsage } from '../types';
import { formatDateTime, formatNum, cn } from '../utils';
import { useI18n } from '../i18n/useI18n';

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  tokenUsage?: TokenUsage;
}

const statusColors: Record<string, string> = {
  idle: 'bg-gray-400',
  running: 'bg-yellow-400 animate-dot-pulse',
  streaming: 'bg-green-400 animate-dot-pulse',
  waitingConfirmation: 'bg-orange-400',
};

export function ConversationSidebar({
  conversations,
  activeId,
  loading,
  error,
  open,
  onClose,
  onSelect,
  onNew,
  onRename,
  onDelete,
  tokenUsage,
}: Props) {
  const { t, locale } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const confirmRename = () => {
    if (editingId && editTitle.trim()) {
      onRename(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        data-testid="drawer-mask"
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-black/25 z-20 transition-opacity duration-150',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      />

      {/* 抽屉 */}
      <div
        data-testid="conversation-sidebar"
        className={cn(
          'absolute top-0 left-0 bottom-0 w-[280px] z-30',
          'bg-surface-card border-r border-hairline shadow-xl',
          'flex flex-col transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-hairline">
          <span className="text-[15px] font-semibold text-ink">{t('sidebar.title')}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="new-conversation-button"
              onClick={onNew}
              className="px-3 py-1 text-xs font-medium rounded-full bg-primary text-on-primary hover:bg-primary-active transition-colors"
            >
              {t('sidebar.newChat')}
            </button>
            <button
              type="button"
              data-testid="conversation-sidebar-toggle"
              onClick={onClose}
              className="text-mute hover:text-ink w-6 h-6 flex items-center justify-center rounded hover:bg-surface-soft transition-colors"
              title={t('sidebar.collapse')}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="flex items-center justify-center py-8 text-mute text-xs">
              加载中...
            </div>
          )}

          {error && (
            <div className="mx-1 mt-1 text-xs text-danger bg-danger/10 rounded-lg px-2 py-1.5">
              {error}
            </div>
          )}

          {!loading && conversations.length === 0 && (
            <div className="text-center py-8 text-mute text-xs">{t('sidebar.noConversations')}</div>
          )}

          {!loading &&
            conversations.map((conv) => (
              <div
                key={conv.id}
                data-testid="conversation-item"
                className={cn(
                  'px-2.5 py-2 rounded-lg cursor-pointer group relative transition-colors',
                  activeId === conv.id
                    ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--accent)]'
                    : 'hover:bg-surface-soft',
                )}
                onClick={() => onSelect(conv.id)}
              >
                {editingId === conv.id ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={confirmRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="w-full px-1 py-0.5 text-xs border border-primary rounded-md bg-surface-card text-ink"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      {conv.status && conv.status !== 'idle' && (
                        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${statusColors[conv.status] ?? ''}`} />
                      )}
                      <div className="text-[13px] text-ink truncate flex-1">{conv.title}</div>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[11px] text-mute">
                        {conv.status && conv.status !== 'idle' ? t(`sidebar.status.${conv.status}`) : formatDateTime(conv.updatedAt, locale)}
                      </span>
                      <div className="hidden group-hover:flex gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(conv.id, conv.title);
                          }}
                          className="text-[11px] text-mute hover:text-primary"
                        >
                          {t('sidebar.rename')}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(conv.id);
                          }}
                          className="text-[11px] text-mute hover:text-danger"
                        >
                          {t('sidebar.delete')}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
        </div>

        {/* Footer */}
        {tokenUsage && (tokenUsage.prompt > 0 || tokenUsage.completion > 0) && (
          <div className="border-t border-hairline px-3 py-2">
            <div className="text-[11px] text-mute text-center tabular-nums">
              {t('sidebar.input')} {formatNum(tokenUsage.prompt, locale)} / {t('sidebar.output')} {formatNum(tokenUsage.completion, locale)} / {t('sidebar.total')} {formatNum(tokenUsage.prompt + tokenUsage.completion, locale)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
