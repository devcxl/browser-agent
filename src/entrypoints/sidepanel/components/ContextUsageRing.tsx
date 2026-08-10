import React from 'react';
import { cn, formatNum } from '../utils';
import { useI18n } from '../i18n/useI18n';

/** 进度环几何常量（模块内私有） */
const SIZE = 20;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** 占用率 ≥ 80% 时进度弧变色警告 */
const WARNING_THRESHOLD = 0.8;

interface ContextUsageRingProps {
  /** 最近一次请求发送给 LLM 的完整上下文 token 数（tokenUsage.prompt） */
  used: number;
  /** 上下文上限（模型 limit.context 或 agentSettings.contextWindowTokens） */
  limit: number;
}

/** 占用率（0-100 整数），limit<=0 时防御性返回 0 */
export function contextUsagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  const percent = Math.round((used / limit) * 100);
  if (percent <= 0) return 0;
  if (percent >= 100) return 100;
  return percent;
}

export function ContextUsageRing({ used, limit }: ContextUsageRingProps) {
  const { t, locale } = useI18n();

  if (used <= 0 || limit <= 0) return null;

  const percent = contextUsagePercent(used, limit);
  const isWarning = percent >= WARNING_THRESHOLD * 100;
  const dashOffset = CIRCUMFERENCE * (1 - percent / 100);
  const tooltip = t('chat.contextUsage.tooltip', {
    used: formatNum(used, locale),
    limit: formatNum(limit, locale),
  });

  return (
    <span
      data-testid="context-usage-ring"
      data-state={isWarning ? 'warning' : 'normal'}
      title={tooltip}
      aria-label={tooltip}
      className="shrink-0 inline-flex items-center justify-center"
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block" aria-hidden="true">
        {/* 背景轨 */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          opacity="0.15"
          className="text-mute"
        />
        {/* 进度弧：rotate(-90) 使起点在 12 点方向 */}
        <circle
          data-testid="context-usage-ring-progress"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          className={cn(isWarning ? 'text-warning' : 'text-primary')}
        />
      </svg>
    </span>
  );
}
