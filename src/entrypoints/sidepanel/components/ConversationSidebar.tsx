import React, { useState } from 'react';
import type { ConversationSummary, AgentStatus, TokenUsage } from '../types';
import { formatDateTime, cn } from '../utils';

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  tokenUsage?: TokenUsage;
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

const statusColors: Record<string, string> = {
  idle: 'bg-gray-400',
  running: 'bg-yellow-400 animate-pulse',
  streaming: 'bg-green-400 animate-pulse',
  waitingConfirmation: 'bg-orange-400',
};

const statusLabels: Record<string, string> = {
  idle: '就绪',
  running: '运行中...',
  streaming: '输出中...',
  waitingConfirmation: '等待确认',
};

export function ConversationSidebar({
  conversations,
  activeId,
  loading,
  error,
  collapsed,
  onToggleCollapse,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onOpenSettings,
  tokenUsage,
}: Props) {
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

  if (collapsed) {
    return (
      <div className="border-r border-hairline bg-surface-soft w-12 flex flex-col items-center py-2 gap-3 shrink-0">
        <button
          type="button"
          data-testid="new-conversation-button"
          onClick={onNew}
          className="text-mute hover:text-primary w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-card"
          title="新建会话"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <div className="flex-1" />
        <button
          type="button"
          data-testid="settings-button"
          onClick={onOpenSettings}
          className="text-mute hover:text-primary w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-card"
          title="设置"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <button
          type="button"
          data-testid="conversation-sidebar-toggle"
          onClick={onToggleCollapse}
          className="text-mute hover:text-ink w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-card"
          title="展开侧栏"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l-7 7 7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="conversation-sidebar"
      className="w-[260px] border-r border-hairline bg-surface-soft flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-hairline">
        <span className="text-sm font-semibold text-ink">会话</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="new-conversation-button"
            onClick={onNew}
            className="px-2 py-1 text-xs rounded-full bg-primary text-on-primary hover:bg-primary-active"
          >
            + 新建
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-mute hover:text-ink w-6 h-6 flex items-center justify-center rounded hover:bg-surface-card"
            title="收起侧栏"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-mute text-xs">
            加载中...
          </div>
        )}

        {error && (
          <div className="mx-2 mt-2 text-xs text-danger bg-red-50 rounded-md px-2 py-1">
            {error}
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="text-center py-8 text-mute text-xs">暂无会话</div>
        )}

        {!loading &&
          conversations.map((conv) => (
            <div
              key={conv.id}
              data-testid="conversation-item"
              className={cn(
                'px-3 py-2 border-b border-hairline cursor-pointer hover:bg-surface-soft group',
                activeId === conv.id && 'bg-surface-soft border-l-2 border-l-primary',
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
                  className="w-full px-1 py-0.5 text-xs border border-primary rounded-md"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    {conv.status && conv.status !== 'idle' && (
                      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${statusColors[conv.status] ?? ''}`} />
                    )}
                    <div className="text-sm text-ink truncate flex-1">{conv.title}</div>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[10px] text-mute">
                      {conv.status && conv.status !== 'idle' ? statusLabels[conv.status] ?? conv.status : formatDateTime(conv.updatedAt)}
                    </span>
                    <div className="hidden group-hover:flex gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(conv.id, conv.title);
                        }}
                        className="text-[10px] text-mute hover:text-primary"
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(conv.id);
                        }}
                        className="text-[10px] text-mute hover:text-danger"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
      </div>

      {/* Settings */}
      <div className="border-t border-hairline px-2 py-2 space-y-1">
        {tokenUsage && (tokenUsage.prompt > 0 || tokenUsage.completion > 0) && (
          <div className="text-[10px] text-mute text-center">
            输入 {formatNum(tokenUsage.prompt)} / 输出 {formatNum(tokenUsage.completion)} / 总计 {formatNum(tokenUsage.prompt + tokenUsage.completion)}
          </div>
        )}
        <button
          type="button"
          data-testid="settings-button"
          onClick={onOpenSettings}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-surface-card text-ink hover:bg-primary hover:text-on-primary border border-hairline hover:border-primary transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          设置
        </button>
      </div>
    </div>
  );
}
