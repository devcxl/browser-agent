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
      <div className="border-r border-gray-200 bg-gray-50 w-10 flex flex-col items-center py-2">
        <button
          type="button"
          data-testid="conversation-sidebar-toggle"
          onClick={onToggleCollapse}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ▶
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="conversation-sidebar"
      className="w-[260px] border-r border-gray-200 bg-gray-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-900">会话</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="new-conversation-button"
            onClick={onNew}
            className="px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600"
          >
            + 新建
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-gray-400 hover:text-gray-600 text-xs"
          >
            ◀
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-gray-400 text-xs">
            加载中...
          </div>
        )}

        {error && (
          <div className="mx-2 mt-2 text-xs text-red-500 bg-red-50 rounded px-2 py-1">
            {error}
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-xs">暂无会话</div>
        )}

        {!loading &&
          conversations.map((conv) => (
            <div
              key={conv.id}
              data-testid="conversation-item"
              className={cn(
                'px-3 py-2 border-b border-gray-100 cursor-pointer hover:bg-gray-100 group',
                activeId === conv.id && 'bg-blue-50 border-l-2 border-l-blue-500',
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
                  className="w-full px-1 py-0.5 text-xs border border-blue-300 rounded"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <div className="text-sm text-gray-800 truncate">{conv.title}</div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[10px] text-gray-400">
                      {formatDateTime(conv.updatedAt)}
                    </span>
                    <div className="hidden group-hover:flex gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(conv.id, conv.title);
                        }}
                        className="text-[10px] text-gray-400 hover:text-blue-500"
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(conv.id);
                        }}
                        className="text-[10px] text-gray-400 hover:text-red-500"
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
    </div>
  );
}
