import React from 'react';
import type { TokenUsage } from '../types';
import { formatNum } from '../utils';
import { useI18n } from '../i18n/useI18n';

interface TokenPanelProps {
  usage: TokenUsage;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function TokenPanel({ usage, collapsed, onToggleCollapse }: TokenPanelProps) {
  const { t, locale } = useI18n();
  const hasData = usage.prompt > 0 || usage.completion > 0;
  const total = usage.prompt + usage.completion;

  if (collapsed) {
    return (
      <div className="border-l border-hairline bg-surface-soft w-[30px] flex flex-col shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center justify-center py-2 text-xs text-mute hover:text-ink"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="border-l border-hairline bg-surface-soft w-[220px] flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-hairline">
        <span className="text-xs font-medium text-mute">{t('token.title')}</span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="text-xs text-mute hover:text-ink"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
      <div className="flex-1 p-3 space-y-2 text-xs">
        {!hasData ? (
          <div className="text-ash text-center py-4">{t('token.noData')}</div>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-mute">{t('token.input')}</span>
              <span className="text-ink font-mono">{formatNum(usage.prompt, locale)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-mute">{t('token.output')}</span>
              <span className="text-ink font-mono">{formatNum(usage.completion, locale)}</span>
            </div>
            <div className="border-t border-hairline pt-2 flex justify-between">
              <span className="text-mute font-medium">{t('token.total')}</span>
              <span className="text-ink font-mono font-medium">{formatNum(total, locale)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
