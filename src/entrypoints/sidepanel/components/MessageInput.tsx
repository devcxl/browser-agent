import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../utils';
import type { ProviderConfig } from '@/shared/types';
import { useVoiceInput } from '../hooks/useVoiceInput';

interface Props {
  onSend: (text: string) => void;
  onAbort: () => void;
  disabled: boolean;
  isRunning: boolean;
  providers: ProviderConfig[];
}

const SpinnerIcon = (
  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
    <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="2" opacity="0.75" />
  </svg>
);

export function MessageInput({ onSend, onAbort, disabled, isRunning, providers }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTranscribed = useCallback((transcribedText: string) => {
    setText((prev) => {
      const separator = prev.trim() ? ' ' : '';
      return prev + separator + transcribedText;
    });
  }, []);

  const { voiceState, errorMessage, voiceAvailable, startRecording, stopRecording, clearError } =
    useVoiceInput({ providers, onTranscribed: handleTranscribed });

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

  const baseMicClass =
    'shrink-0 w-9 h-9 flex items-center justify-center rounded-md border border-hairline transition-colors';

  const renderMicButton = () => {
    if (!voiceAvailable) return null;

    switch (voiceState) {
      case 'idle':
        return (
          <button
            type="button"
            data-testid="mic-button"
            onClick={() => startRecording()}
            disabled={disabled}
            className={cn(
              baseMicClass,
              'text-mute hover:text-ink hover:border-primary',
              disabled && 'opacity-40 cursor-not-allowed',
            )}
            title="语音输入"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
        );

      case 'requesting':
        return (
          <span data-testid="mic-button" className={cn(baseMicClass, 'text-mute')} title="正在请求麦克风权限...">
            {SpinnerIcon}
          </span>
        );

      case 'recording':
        return (
          <button
            type="button"
            data-testid="mic-button"
            onClick={() => stopRecording()}
            className={cn(baseMicClass, 'border-danger bg-red-50 hover:bg-red-100')}
            title="点击停止录音"
          >
            <span className="w-3 h-3 rounded-full bg-danger animate-pulse" />
          </button>
        );

      case 'transcribing':
        return (
          <span data-testid="mic-button" className={cn(baseMicClass, 'text-mute opacity-60')} title="正在识别语音...">
            {SpinnerIcon}
          </span>
        );

      case 'error':
        return (
          <button
            type="button"
            data-testid="mic-button"
            onClick={() => clearError()}
            className={cn(baseMicClass, 'text-warning hover:text-orange-600')}
            title={errorMessage ?? '语音识别出错'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </button>
        );

      default:
        return null;
    }
  };

  return (
    <div className="border-t border-hairline bg-canvas">
      {isRunning && (
        <div className="h-0.5 bg-hairline overflow-hidden">
          <div className="h-full bg-primary w-1/3 animate-progress" />
        </div>
      )}
      <div className="px-4 py-3">
        <div className="flex items-end gap-3">
        {renderMicButton()}
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
            'flex-1 resize-none rounded-md bg-surface-card text-ink text-sm p-3',
            'border border-hairline',
            'placeholder:text-ash',
            'focus:outline-none focus:border-primary',
            'disabled:bg-hairline-soft disabled:text-ash',
          )}
        />
        {isRunning ? (
          <button
            type="button"
            data-testid="abort-button"
            onClick={onAbort}
            className="px-5 py-2 rounded-full bg-danger text-on-primary text-sm font-medium hover:bg-danger-hover shrink-0"
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
              'px-5 py-2 rounded-full text-sm font-medium shrink-0',
              text.trim() && !disabled
                ? 'bg-primary text-on-primary hover:bg-primary-active'
                : 'bg-hairline-soft text-ash cursor-not-allowed',
            )}
          >
            发送
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
