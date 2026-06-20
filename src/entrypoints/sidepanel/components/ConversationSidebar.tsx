import React, { useState } from 'react';
import type { ConversationSummary } from '../types';
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
}

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
      <div className="border-r border-hairline bg-surface-soft w-10 flex flex-col items-center py-2">
        <button
          type="button"
          data-testid="conversation-sidebar-toggle"
          onClick={onToggleCollapse}
          className="text-mute hover:text-ink text-sm"
        >
          ▶
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
            className="text-mute hover:text-ink text-xs"
          >
            ◀
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
                  <div className="text-sm text-ink truncate">{conv.title}</div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[10px] text-mute">
                      {formatDateTime(conv.updatedAt)}
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
      <div className="border-t border-hairline px-3 py-2">
        <button
          type="button"
          data-testid="settings-button"
          onClick={onOpenSettings}
          className="w-full text-xs text-mute hover:text-ink transition-colors text-left"
        >
          [+] 设置
        </button>
      </div>
    </div>
  );
}
