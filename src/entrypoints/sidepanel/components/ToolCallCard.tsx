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
        return <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />;
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
        'border rounded-sm text-xs overflow-hidden',
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
            <span className="font-medium text-mute">参数: </span>
            <code className="text-body break-all">
              {truncate(JSON.stringify(call.params), 200)}
            </code>
          </div>
          {call.result && (
            <div>
              <span className="font-medium text-mute">结果: </span>
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
