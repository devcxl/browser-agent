import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../utils';

interface Props {
  onSend: (text: string) => void;
  onAbort: () => void;
  disabled: boolean;
  isRunning: boolean;
}

export function MessageInput({ onSend, onAbort, disabled, isRunning }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [text]);

  return (
    <div className="border-t border-hairline bg-canvas px-4 py-3">
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          data-testid="message-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Agent 运行中...' : '输入消息... (Enter 发送, Shift+Enter 换行)'}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-sm bg-surface-soft text-ink text-sm p-3',
            'border border-hairline',
            'placeholder:text-mute',
            'focus:outline-none focus:bg-canvas focus:border-ink',
            'disabled:bg-surface-card disabled:text-ash',
          )}
        />
        {isRunning ? (
          <button
            type="button"
            data-testid="abort-button"
            onClick={onAbort}
            className="px-5 py-2 rounded-sm bg-danger text-canvas text-sm font-medium hover:bg-danger-hover shrink-0"
          >
            中止
          </button>
        ) : (
          <button
            type="button"
            data-testid="send-button"
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className={cn(
              'px-5 py-2 rounded-sm text-sm font-medium shrink-0',
              text.trim() && !disabled
                ? 'bg-ink text-canvas hover:bg-ink-deep'
                : 'bg-surface-card text-ash cursor-not-allowed',
            )}
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}
