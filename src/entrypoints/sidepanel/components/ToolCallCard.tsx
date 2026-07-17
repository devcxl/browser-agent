import React, { useState } from 'react';
import type { ToolCallDisplay } from '../types';
import { cn, riskColor, truncate } from '../utils';
import { useI18n } from '../i18n/useI18n';

interface Props {
  call: ToolCallDisplay;
}

export function ToolCallCard({ call }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const statusIcon = () => {
    switch (call.status) {
      case 'running':
        return <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />;
      case 'success':
        return <span className="text-success text-sm">✓</span>;
      case 'error':
        return <span className="text-danger text-sm">✕</span>;
    }
  };

  const isHighRisk = call.riskLevel === 'high' || call.riskLevel === 'critical';

  return (
    <div
      className={cn(
        'border rounded-md text-xs overflow-hidden',
        isHighRisk ? 'border-orange-400' : 'border-hairline',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 bg-canvas hover:bg-surface-soft text-left"
      >
        {statusIcon()}
        <span className="font-medium text-ink flex-1">
          {call.name}
        </span>
        <span className={cn('text-[10px] font-medium', riskColor(call.riskLevel).split(' ')[0])}>
          {call.riskLevel}
        </span>
        <span className="text-mute text-[10px]">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-2.5 py-2 bg-surface-soft border-t border-hairline space-y-1.5">
          <div>
            <span className="font-medium text-mute">{t('chat.message.params')}: </span>
            <code className="text-body break-all">
              {truncate(JSON.stringify(call.params), 200)}
            </code>
          </div>
          {call.result && (
            <div>
                <span className="font-medium text-mute">{t('chat.message.result')}: </span>
              <code className="text-body break-all">
                {call.result.success
                  ? truncate(JSON.stringify(call.result.data ?? 'ok'), 200)
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

  const statusIcon = () => {
    switch (status) {
      case 'running':
        return <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />;
      case 'success':
        return <span className="text-success text-sm">✓</span>;
      case 'error':
        return <span className="text-danger text-sm">✕</span>;
    }
  };

  return (
    <div className="border border-hairline rounded-md text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 bg-canvas hover:bg-surface-soft text-left"
      >
        {statusIcon()}
        <span className="font-medium text-ink flex-1">{toolName}</span>
        <span className="text-[10px] font-medium text-mute">{state}</span>
        <span className="text-mute text-[10px]">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-2.5 py-2 bg-surface-soft border-t border-hairline space-y-1.5">
          {input != null && (
            <div>
              <span className="font-medium text-mute">{t('chat.message.params')}: </span>
              <code className="text-body break-all">
                {truncate(JSON.stringify(input), 200)}
              </code>
            </div>
          )}
          {output != null && (
            <div>
              <span className="font-medium text-mute">{t('chat.message.result')}: </span>
              <code className="text-body break-all">
                {truncate(JSON.stringify(output), 200)}
              </code>
            </div>
          )}
          {errorText && (
            <div>
              <span className="font-medium text-mute">{t('chat.message.result')}: </span>
              <code className="text-danger break-all">{errorText}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
