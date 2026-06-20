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
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
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
            'flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent',
            'placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400',
          )}
        />
        {isRunning ? (
          <button
            type="button"
            data-testid="abort-button"
            onClick={onAbort}
            className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors shrink-0"
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
              'px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0',
              text.trim() && !disabled
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            )}
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}
