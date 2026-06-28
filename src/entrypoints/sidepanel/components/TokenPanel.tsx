import React from 'react';
import type { TokenUsage } from '../types';

interface TokenPanelProps {
  usage: TokenUsage;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function TokenPanel({ usage, collapsed, onToggleCollapse }: TokenPanelProps) {
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
        <span className="text-xs font-medium text-mute">Token 用量</span>
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
          <div className="text-ash text-center py-4">--</div>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-mute">输入</span>
              <span className="text-ink font-mono">{formatNumber(usage.prompt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-mute">输出</span>
              <span className="text-ink font-mono">{formatNumber(usage.completion)}</span>
            </div>
            <div className="border-t border-hairline pt-2 flex justify-between">
              <span className="text-mute font-medium">总计</span>
              <span className="text-ink font-mono font-medium">{formatNumber(total)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
