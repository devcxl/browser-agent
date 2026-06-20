import React, { useState } from 'react';
import type { ToolCallDisplay } from '../types';
import { cn, riskColor, truncate } from '../utils';

interface Props {
  call: ToolCallDisplay;
}

export function ToolCallCard({ call }: Props) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = () => {
    switch (call.status) {
      case 'running':
        return <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      case 'success':
        return <span className="text-green-500 text-sm">✓</span>;
      case 'error':
        return <span className="text-red-500 text-sm">✕</span>;
    }
  };

  const isHighRisk = call.riskLevel === 'high' || call.riskLevel === 'critical';

  return (
    <div
      className={cn(
        'border rounded-lg text-xs overflow-hidden',
        isHighRisk ? 'border-orange-400' : 'border-gray-200',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 bg-white hover:bg-gray-50 text-left"
      >
        {statusIcon()}
        <span className="font-mono font-medium text-gray-700 flex-1">
          {call.name}
        </span>
        <span className={cn('text-[10px] font-medium', riskColor(call.riskLevel).split(' ')[0])}>
          {call.riskLevel}
        </span>
        <span className="text-gray-400 text-[10px]">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-2.5 py-2 bg-gray-50 border-t border-gray-100 space-y-1.5">
          <div>
            <span className="font-medium text-gray-500">参数: </span>
            <code className="text-gray-600 break-all">
              {truncate(JSON.stringify(call.params), 200)}
            </code>
          </div>
          {call.result && (
            <div>
              <span className="font-medium text-gray-500">结果: </span>
              <code className="text-gray-600 break-all">
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
