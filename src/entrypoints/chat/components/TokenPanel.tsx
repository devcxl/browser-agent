import React from 'react';
import type { TokenUsage } from '../types';
import { cn } from '../utils';

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
      <div className="border-l border-gray-200 bg-white w-[30px] flex flex-col shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center justify-center py-2 text-xs text-gray-400 hover:text-gray-600"
        >
          ◀
        </button>
      </div>
    );
  }

  return (
    <div className="border-l border-gray-200 bg-white w-[240px] flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-500">Token 用量</span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          ▶
        </button>
      </div>
      <div className="flex-1 p-3 space-y-2 text-xs">
        {!hasData ? (
          <div className="text-gray-400 text-center py-4">--</div>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500">输入</span>
              <span className="text-gray-800 font-mono">{formatNumber(usage.prompt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">输出</span>
              <span className="text-gray-800 font-mono">{formatNumber(usage.completion)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between">
              <span className="text-gray-500 font-medium">总计</span>
              <span className="text-gray-800 font-mono font-medium">{formatNumber(total)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
