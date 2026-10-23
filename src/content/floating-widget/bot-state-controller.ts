/**
 * BotStateController — 把 agent 状态流翻译成头像可见状态。
 *
 * 三个职责集中在这里，避免散落在 postMessage 回调里：
 * - 去抖：连续快速切换只让最终状态生效
 * - 庆祝：任务从活跃状态正常完成时先播 celebrate，再回落 idle
 * - 复位：面板关闭 / 出错 / 中止时立即回 idle，不庆祝
 *
 * 纯逻辑单元：不触碰 DOM，也不依赖 GrokBot 实例，只通过 apply 回调输出
 * 「现在应该显示哪个状态」。时间全部走 setTimeout，测试用假定时器锁定契约。
 */

import type { WidgetStatusReason } from '@/shared/types';
import type { GrokBotState } from './grokbot';

/** 状态切换去抖窗口（ms）：足够吞掉状态机的短促跳变，又不会让首次状态迟到 */
export const DEFAULT_DEBOUNCE_MS = 400;
/** 完成庆祝时长（ms） */
export const DEFAULT_CELEBRATE_MS = 2000;

/** 这些状态代表任务正在进行，从它们回到 idle 才值得庆祝 */
const ACTIVE_STATES: ReadonlySet<GrokBotState> = new Set([
  'thinking',
  'working',
  'listening',
]);

export interface BotStateControllerOptions {
  /** 应用一个可见状态（通常是 bot.update({ state })） */
  apply: (state: GrokBotState) => void;
  debounceMs?: number;
  celebrateMs?: number;
}

export class BotStateController {
  private readonly apply: (state: GrokBotState) => void;
  private readonly debounceMs: number;
  private readonly celebrateMs: number;

  /** 当前已经应用到引擎的状态 */
  private applied: GrokBotState = 'idle';
  /** 去抖窗口内等待生效的目标 */
  private pending: GrokBotState | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private celebrateTimer: ReturnType<typeof setTimeout> | null = null;
  private celebrating = false;

  constructor(options: BotStateControllerOptions) {
    this.apply = options.apply;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.celebrateMs = options.celebrateMs ?? DEFAULT_CELEBRATE_MS;
  }

  /**
   * 接收一次状态更新。
   *
   * @param state 已映射到 GrokBot 词表的状态
   * @param reason 仅 idle 转换可能携带；缺省视为正常完成（向后兼容旧发送端）
   */
  handle(state: GrokBotState, reason?: WidgetStatusReason): void {
    // 出错/中止：直接复位，不播庆祝，也不等待去抖
    if (state === 'idle' && (reason === 'error' || reason === 'abort')) {
      this.reset();
      return;
    }

    if (this.celebrating) {
      // 庆祝本身就是「完成了」的视觉表达，重复 idle 不应提前结束它
      if (state === 'idle') return;
      // 新状态立即中断庆祝并切走，避免庆祝动画盖住新任务
      this.cancelCelebration();
      this.cancelPending();
      this.commit(state);
      return;
    }

    if (state === this.applied) {
      // 目标与当前可见状态一致：丢弃仍在等待的中间状态
      this.cancelPending();
      return;
    }

    this.schedule(state);
  }

  /** 面板关闭等异常复位：取消去抖与庆祝，立即回 idle */
  reset(): void {
    this.cancelPending();
    this.cancelCelebration();
    if (this.applied !== 'idle') {
      this.applyImmediately('idle');
    }
  }

  /** 销毁：清理所有待触发定时器 */
  destroy(): void {
    this.cancelPending();
    this.cancelCelebration();
  }

  private schedule(state: GrokBotState): void {
    this.cancelPending();
    this.pending = state;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const next = this.pending;
      this.pending = null;
      if (next) this.commit(next);
    }, this.debounceMs);
  }

  private commit(state: GrokBotState): void {
    if (state === 'idle' && ACTIVE_STATES.has(this.applied)) {
      this.applyImmediately('celebrate');
      this.celebrating = true;
      this.celebrateTimer = setTimeout(() => {
        this.celebrateTimer = null;
        this.celebrating = false;
        this.applyImmediately('idle');
      }, this.celebrateMs);
      return;
    }

    this.applyImmediately(state);
  }

  private applyImmediately(state: GrokBotState): void {
    this.applied = state;
    this.apply(state);
  }

  private cancelPending(): void {
    this.pending = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private cancelCelebration(): void {
    this.celebrating = false;
    if (this.celebrateTimer) {
      clearTimeout(this.celebrateTimer);
      this.celebrateTimer = null;
    }
  }
}
