import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BotStateController,
  DEFAULT_CELEBRATE_MS,
  DEFAULT_DEBOUNCE_MS,
} from '../bot-state-controller';
import type { GrokBotState } from '../grokbot';

/**
 * BotStateController 是纯逻辑单元：不碰 DOM、不依赖 GrokBot 实例，
 * 只把「agent 状态流」翻译成「何时调用 apply(visibleState)」。
 * 用假定时器锁定去抖/庆祝的时间契约。
 */

function setup() {
  const apply = vi.fn<(state: GrokBotState) => void>();
  const controller = new BotStateController({ apply });
  return { apply, controller };
}

/** 走过的状态序列（apply 调用参数） */
function appliedStates(apply: ReturnType<typeof vi.fn>): GrokBotState[] {
  return apply.mock.calls.map((call) => call[0] as GrokBotState);
}

describe('BotStateController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('去抖参数在 300–500ms 区间内', () => {
    expect(DEFAULT_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
    expect(DEFAULT_DEBOUNCE_MS).toBeLessThanOrEqual(500);
  });

  it('单个状态在去抖后生效，且不超过 500ms', () => {
    const { apply, controller } = setup();

    controller.handle('working');
    expect(apply).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS - 1);
    expect(apply).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith('working');
  });

  it('连续快速切换只应用最终状态', () => {
    const { apply, controller } = setup();

    controller.handle('working');
    vi.advanceTimersByTime(100);
    controller.handle('thinking');
    vi.advanceTimersByTime(100);
    controller.handle('listening');
    vi.advanceTimersByTime(100);
    controller.handle('working');
    vi.advanceTimersByTime(100);

    // 仍在去抖窗口内：未应用中间的 thinking/listening
    expect(apply).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    expect(appliedStates(apply)).toEqual(['working']);
  });

  it('去抖期间回到当前已应用状态时取消切换', () => {
    const { apply, controller } = setup();

    controller.handle('working');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    expect(appliedStates(apply)).toEqual(['working']);

    controller.handle('thinking');
    controller.handle('working');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

    expect(appliedStates(apply)).toEqual(['working']);
  });

  it('从活跃状态回到 idle 时先庆祝，2 秒后回落 idle', () => {
    const { apply, controller } = setup();

    controller.handle('working');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    controller.handle('idle');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

    expect(appliedStates(apply)).toEqual(['working', 'celebrate']);

    vi.advanceTimersByTime(DEFAULT_CELEBRATE_MS - 1);
    expect(appliedStates(apply)).toEqual(['working', 'celebrate']);

    vi.advanceTimersByTime(1);
    expect(appliedStates(apply)).toEqual(['working', 'celebrate', 'idle']);
  });

  it('thinking / listening 也算活跃状态，回到 idle 会庆祝', () => {
    for (const active of ['thinking', 'listening'] as const) {
      const { apply, controller } = setup();
      controller.handle(active);
      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
      controller.handle('idle');
      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
      expect(appliedStates(apply)).toEqual([active, 'celebrate']);
      vi.advanceTimersByTime(DEFAULT_CELEBRATE_MS);
    }
  });

  it('面板刚打开时 idle → idle 不产生视觉更新', () => {
    const { apply, controller } = setup();
    controller.handle('idle');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    expect(apply).not.toHaveBeenCalled();
  });

  it('庆祝期间有新状态时立即中断庆祝并切到新状态', () => {
    const { apply, controller } = setup();

    controller.handle('working');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    controller.handle('idle');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    expect(appliedStates(apply)).toEqual(['working', 'celebrate']);

    controller.handle('thinking');
    // 立即中断，不等去抖
    expect(appliedStates(apply)).toEqual(['working', 'celebrate', 'thinking']);

    vi.advanceTimersByTime(DEFAULT_CELEBRATE_MS * 2);
    expect(appliedStates(apply)).toEqual(['working', 'celebrate', 'thinking']);
  });

  it('庆祝期间重复收到 idle 不会提前结束庆祝', () => {
    const { apply, controller } = setup();

    controller.handle('working');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    controller.handle('idle');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    controller.handle('idle');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

    expect(appliedStates(apply)).toEqual(['working', 'celebrate']);

    vi.advanceTimersByTime(DEFAULT_CELEBRATE_MS);
    expect(appliedStates(apply)).toEqual(['working', 'celebrate', 'idle']);
  });

  it('reset() 立即回 idle，并取消尚未生效的去抖', () => {
    const { apply, controller } = setup();

    controller.handle('working');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    controller.handle('thinking'); // 去抖中
    controller.reset();

    expect(appliedStates(apply)).toEqual(['working', 'idle']);

    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS * 2);
    expect(appliedStates(apply)).toEqual(['working', 'idle']);
  });

  it('reset() 取消庆祝，立即回 idle 且不再额外回落', () => {
    const { apply, controller } = setup();

    controller.handle('working');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    controller.handle('idle');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    expect(appliedStates(apply)).toEqual(['working', 'celebrate']);

    controller.reset();
    expect(appliedStates(apply)).toEqual(['working', 'celebrate', 'idle']);

    vi.advanceTimersByTime(DEFAULT_CELEBRATE_MS * 2);
    expect(appliedStates(apply)).toEqual(['working', 'celebrate', 'idle']);
  });

  it('reset() 在已经是 idle 时不重复 apply', () => {
    const { apply, controller } = setup();
    controller.reset();
    expect(apply).not.toHaveBeenCalled();
  });

  it('error 结束不庆祝，立即回 idle', () => {
    const { apply, controller } = setup();

    controller.handle('working');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    controller.handle('idle', 'error');

    expect(appliedStates(apply)).toEqual(['working', 'idle']);

    vi.advanceTimersByTime(DEFAULT_CELEBRATE_MS * 2);
    expect(appliedStates(apply)).toEqual(['working', 'idle']);
  });

  it('abort 结束不庆祝，立即回 idle', () => {
    const { apply, controller } = setup();

    controller.handle('working');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    controller.handle('idle', 'abort');

    expect(appliedStates(apply)).toEqual(['working', 'idle']);
  });

  it('缺省 reason 的 idle 视为正常完成（向后兼容）', () => {
    const { apply, controller } = setup();

    controller.handle('working');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    controller.handle('idle');

    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    expect(appliedStates(apply)).toEqual(['working', 'celebrate']);
  });

  it('destroy() 清除去抖与庆祝定时器', () => {
    const { apply, controller } = setup();

    controller.handle('working');
    controller.destroy();
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS * 2);
    expect(apply).not.toHaveBeenCalled();

    const second = setup();
    second.controller.handle('working');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    second.controller.handle('idle');
    vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    second.controller.destroy();
    vi.advanceTimersByTime(DEFAULT_CELEBRATE_MS * 2);
    expect(appliedStates(second.apply)).toEqual(['working', 'celebrate']);
  });
});
