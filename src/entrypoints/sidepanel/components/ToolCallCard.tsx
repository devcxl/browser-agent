import React, { useState } from 'react';
import type { ToolCallDisplay } from '../types';
import { cn, truncate } from '../utils';
import { useI18n } from '../i18n/useI18n';
import { StatusDot, RiskBadge } from './MessageBubble';

interface Props {
  call: ToolCallDisplay;
}

export function ToolCallCard({ call }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="w-fit min-w-[13rem] max-w-[92%] sm:max-w-[34rem] bg-surface-card rounded-xl border border-hairline shadow-sm overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-surface-soft transition-colors"
      >
        <StatusDot status={call.status} />
        <span className="font-mono font-medium text-ink flex-1 truncate">
          {call.name}
        </span>
        <RiskBadge level={call.riskLevel} />
        <svg
          className={cn('w-3.5 h-3.5 text-mute transition-transform duration-150', expanded && 'rotate-180')}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 py-2.5 bg-surface-card border-t border-hairline space-y-2 font-mono max-h-[120px] overflow-auto">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-mute mb-0.5">{t('chat.message.params')}</div>
            <code className="text-body break-all whitespace-pre-wrap">
              {truncate(JSON.stringify(call.params, null, 2), 400)}
            </code>
          </div>
          {call.result && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-mute mb-0.5">{t('chat.message.result')}</div>
              <code className="text-body break-all whitespace-pre-wrap">
                {call.result.success
                  ? truncate(JSON.stringify(call.result.data ?? 'ok', null, 2), 400)
                  : call.result.error}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI SDK 工具调用渲染（inline 使用） ───────────────────

/** AI SDK 工具调用 state → ToolCallDisplay status */
export function sdkStateToStatus(state: string): 'running' | 'success' | 'error' {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
    case 'approval-requested':
    case 'approval-responded':
      return 'running';
    case 'output-available':
      return 'success';
    case 'output-error':
    case 'output-denied':
      return 'error';
    default:
      return 'running';
  }
}

interface SDKProps {
  toolCallId: string;
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export function ToolCallCardSDK({ toolCallId: _toolCallId, toolName, state, input, output, errorText }: SDKProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const status = sdkStateToStatus(state);

  return (
    <div className="w-fit min-w-[13rem] max-w-[92%] sm:max-w-[34rem] bg-surface-card rounded-xl border border-hairline shadow-sm overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-surface-soft transition-colors"
      >
        <StatusDot status={status} />
        <span className="font-mono font-medium text-ink flex-1 truncate">{toolName}</span>
        <span className="text-[10px] font-medium text-mute">{state}</span>
        <svg
          className={cn('w-3.5 h-3.5 text-mute transition-transform duration-150', expanded && 'rotate-180')}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className="px-3 py-2.5 bg-surface-card border-t border-hairline space-y-2 font-mono max-h-[120px] overflow-auto">
          {input != null && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-mute mb-0.5">{t('chat.message.params')}</div>
              <code className="text-body break-all whitespace-pre-wrap">
                {truncate(JSON.stringify(input, null, 2), 400)}
              </code>
            </div>
          )}
          {output != null && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-mute mb-0.5">{t('chat.message.result')}</div>
              <code className="text-body break-all whitespace-pre-wrap">
                {truncate(JSON.stringify(output, null, 2), 400)}
              </code>
            </div>
          )}
          {errorText && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-mute mb-0.5">{t('chat.message.result')}</div>
              <code className="text-danger break-all whitespace-pre-wrap">{errorText}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
