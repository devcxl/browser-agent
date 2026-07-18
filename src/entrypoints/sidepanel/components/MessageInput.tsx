import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../utils';
import type { ProviderConfig, ReasoningEffort } from '@/shared/types';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useI18n } from '../i18n/useI18n';
import { ChatSelect } from './ChatSelect';

interface Props {
  onSend: (text: string) => void;
  onAbort: () => void;
  disabled: boolean;
  isRunning: boolean;
  providers: ProviderConfig[];
  selectedProviderId?: string;
  onSelectProvider?: (providerId: string) => void;
  selectedModelId?: string;
  onSelectModel?: (modelId: string) => void;
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortChange?: (effort: ReasoningEffort | undefined) => void;
  /** home: 居中大输入框；chat: 底部紧凑输入框 */
  variant?: 'home' | 'chat';
}

const SpinnerIcon = (
  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
    <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="2" opacity="0.75" />
  </svg>
);

export function MessageInput({
  onSend, onAbort, disabled, isRunning,
  providers, selectedProviderId = '', onSelectProvider = () => {}, selectedModelId = '', onSelectModel = () => {},
  reasoningEffort, onReasoningEffortChange = () => {},
  variant = 'chat',
}: Props) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeProvider = providers.find((provider) => provider.id === selectedProviderId) ?? providers[0] ?? null;
  const models = Object.values(activeProvider?.models ?? {});
  const activeModel = activeProvider?.models?.[selectedModelId] ?? null;

  const handleTranscribed = useCallback((transcribedText: string) => {
    setText((prev) => {
      const separator = prev.trim() ? ' ' : '';
      return prev + separator + transcribedText;
    });
  }, []);

  const { voiceState, errorMessage, voiceAvailable, startRecording, stopRecording, clearError } =
    useVoiceInput({ providers, onTranscribed: handleTranscribed, t });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled || (activeProvider && !activeModel)) return;
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
    'shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-colors';

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
              'text-mute hover:text-ink hover:bg-surface-soft',
              disabled && 'opacity-40 cursor-not-allowed',
            )}
            title={t('chat.input.voiceInput')}
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
          <span data-testid="mic-button" className={cn(baseMicClass, 'text-mute')} title={t('chat.input.requestingMic')}>
            {SpinnerIcon}
          </span>
        );
      case 'recording':
        return (
          <button
            type="button"
            data-testid="mic-button"
            onClick={() => stopRecording()}
            className={cn(baseMicClass, 'bg-danger/10 hover:bg-danger/20')}
            title={t('chat.input.stopRecording')}
          >
            <span className="w-3 h-3 rounded-full bg-danger animate-pulse" />
          </button>
        );
      case 'transcribing':
        return (
          <span data-testid="mic-button" className={cn(baseMicClass, 'text-mute opacity-60')} title={t('chat.input.transcribing')}>
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
            title={errorMessage ?? t('chat.input.voiceError')}
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

  const canSend = !!text.trim() && !disabled && (!activeProvider || !!activeModel);
  const hasConfigRow = !!activeProvider;
  const reasoningEfforts = activeModel?.reasoning ? activeModel.reasoningEfforts ?? [] : [];
  const isHome = variant === 'home';

  const [openSelectId, setOpenSelectId] = useState<string | null>(null);

  const micButton = renderMicButton();

  const providerOptions = providers.map((p) => ({ value: p.id, label: p.name }));
  const modelOptions = models.map((m) => ({ value: m.id, label: m.name || m.id }));
  const reasoningOptions: { value: string; label: string }[] = [
    { value: '', label: t('chat.configuration.reasoningOff') },
    ...reasoningEfforts.map((e) => ({ value: e, label: e })),
  ];

  return (
    <div className={cn(!isHome && 'border-t border-hairline bg-canvas px-3 pt-2 pb-3')}>
      {/* Composer 容器 */}
      <div
        className={cn(
          'bg-surface-card border border-hairline rounded-2xl shadow-sm',
          'transition-[border-color,box-shadow] duration-150',
          'focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--accent-soft)]',
        )}
      >
        <textarea
          ref={textareaRef}
          data-testid="message-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? t('chat.input.disabledPlaceholder') : t('chat.input.placeholder')}
          rows={isHome ? 3 : 1}
          className={cn(
            'w-full resize-none bg-transparent text-ink text-[13.5px] leading-relaxed',
            'px-4 pt-3.5 pb-2',
            'placeholder:text-mute',
            'focus:outline-none',
            'disabled:text-mute',
          )}
        />

        {/* 底部工具行 */}
        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          {hasConfigRow && (
            <>
              <ChatSelect
                id="provider-select"
                label={t('chat.configuration.provider')}
                value={activeProvider?.id ?? ''}
                options={providerOptions}
                onChange={onSelectProvider}
                openSelectId={openSelectId}
                onOpenChange={setOpenSelectId}
              />

              {models.length > 0 ? (
                <ChatSelect
                  id="model-select"
                  label={t('chat.configuration.model')}
                  value={selectedModelId}
                  options={modelOptions}
                  onChange={onSelectModel}
                  disabled={!selectedProviderId}
                  openSelectId={openSelectId}
                  onOpenChange={setOpenSelectId}
                />
              ) : (
                <span className="text-xs text-mute">No models configured</span>
              )}

              {reasoningEfforts.length > 0 ? (
                <ChatSelect
                  id="reasoning-select"
                  label={t('chat.configuration.reasoning')}
                  value={reasoningEffort ?? ''}
                  options={reasoningOptions}
                  onChange={(v) => onReasoningEffortChange?.(v ? (v as ReasoningEffort) : undefined)}
                  disabled={reasoningEfforts.length === 0}
                  openSelectId={openSelectId}
                  onOpenChange={setOpenSelectId}
                />
              ) : (
                <span
                  data-testid="reasoning-unsupported"
                  className="px-2.5 py-1 text-xs text-mute rounded-full bg-surface-soft"
                >
                  Think: Unsupported
                </span>
              )}
            </>
          )}

          {micButton}

          <div className="ml-auto flex items-center gap-2">
            {isRunning ? (
              <button
                type="button"
                data-testid="abort-button"
                onClick={onAbort}
                className="w-[30px] h-[30px] rounded-full bg-danger text-on-primary flex items-center justify-center hover:bg-danger-hover transition-colors"
                title={t('chat.input.abort')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                data-testid="send-button"
                onClick={handleSend}
                disabled={!canSend}
                aria-label={t('chat.input.send')}
                className={cn(
                  'w-[30px] h-[30px] rounded-full flex items-center justify-center transition-all',
                  canSend
                    ? 'bg-primary text-on-primary hover:bg-primary-active active:scale-95'
                    : 'bg-surface-soft text-mute cursor-not-allowed',
                )}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
