/**
 * 重复调用软拦截：与熔断器的「停止」不同，这里把提示作为工具错误结果
 * 注入上下文，让模型自行调整策略后继续执行，循环不中断。
 *
 * - 连续第 3 次（DUPLICATE_BLOCK_THRESHOLD）「同工具 + 相同参数」起拦截，
 *   不执行工具，返回带 duplicateBlocked 标记的合成失败结果；
 * - 真正终止由 CircuitBreaker 在连续第 6 次（DUPLICATE_TRIP_THRESHOLD）兜底。
 *
 * 状态按 run 维护，每次 run 前 reset()。
 */
import { buildToolCallSignature, CIRCUIT_BREAKER_THRESHOLD } from './circuit-breaker';
import type { ToolResult } from '@/shared/types/tool';

/** 起拦截所需的连续次数（与连续失败熔断共用 3 次的直觉阈值） */
export const DUPLICATE_BLOCK_THRESHOLD = CIRCUIT_BREAKER_THRESHOLD;

/** 拦截提示：作为工具错误结果返回给模型 */
export const DUPLICATE_BLOCK_MESSAGE =
  '该工具已连续 3 次以完全相同的参数调用，本次调用已被拦截、未实际执行。'
  + '请改变策略：调整参数、换用其他工具，或先向用户说明当前障碍。'
  + '若继续以相同参数重复调用，任务将被强制终止。';

/** 合成失败结果上的内部标记，供熔断器跳过失败计数（见 circuit-breaker.isFailedOutput） */
export type DuplicateBlockedMarker = { duplicateBlocked: true };
export const DUPLICATE_BLOCK_MARKER_KEY = 'duplicateBlocked';

export function isDuplicateBlocked(output: unknown): boolean {
  return (
    output !== null
    && typeof output === 'object'
    && (output as DuplicateBlockedMarker).duplicateBlocked === true
  );
}

/** 构造注入给模型的拦截结果 */
export function duplicateBlockResult(): ToolResult & DuplicateBlockedMarker {
  return {
    success: false,
    error: DUPLICATE_BLOCK_MESSAGE,
    duplicateBlocked: true,
  };
}

export class DuplicateCallGuard {
  private lastSignature: string | null = null;
  private streak = 0;

  reset(): void {
    this.lastSignature = null;
    this.streak = 0;
  }

  /**
   * 记录一次调用并返回是否应拦截。
   * 参数归一化与熔断器一致（buildToolCallSignature，键序无关）。
   */
  shouldBlock(toolName: string, input: unknown): boolean {
    const signature = buildToolCallSignature(toolName, input);
    if (signature === this.lastSignature) {
      this.streak += 1;
    } else {
      this.lastSignature = signature;
      this.streak = 1;
    }
    return this.streak >= DUPLICATE_BLOCK_THRESHOLD;
  }
}
