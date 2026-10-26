import { describe, it, expect } from 'vitest';
import {
  CircuitBreaker,
  CIRCUIT_BREAKER_THRESHOLD,
  DUPLICATE_TRIP_THRESHOLD,
  buildToolCallSignature,
  formatInterruptionMessage,
  normalizeToolInput,
} from '../circuit-breaker';

// ==================== 测试辅助 ====================

interface TestCall {
  toolCallId: string;
  toolName: string;
  input?: unknown;
  /** 工具执行结果；省略表示结果缺失（审批拒绝 / 未执行） */
  output?: unknown;
}

function step(calls: TestCall[]) {
  return {
    toolCalls: calls.map(({ toolCallId, toolName, input }) => ({ toolCallId, toolName, input })),
    toolResults: calls
      .filter((c) => c.output !== undefined)
      .map(({ toolCallId, output }) => ({ toolCallId, output })),
  };
}

const ok = (toolCallId: string, toolName = 'tabs_click') => ({
  toolCallId,
  toolName,
  input: { id: 'tab-1' },
  output: { success: true, data: {} },
});

/** 失败调用参数各不相同，确保只触发「连续失败」信号而非「重复调用」信号 */
const failed = (toolCallId: string, toolName = 'tabs_click') => ({
  toolCallId,
  toolName,
  input: { id: toolCallId },
  output: { success: false, error: '执行失败' },
});

// ==================== 参数归一化 ====================

describe('normalizeToolInput', () => {
  it('对象键顺序不同但内容相同应归一化为同一签名', () => {
    expect(normalizeToolInput({ b: 1, a: 2 })).toBe(normalizeToolInput({ a: 2, b: 1 }));
  });

  it('嵌套对象与数组同样归一化', () => {
    const left = { outer: { z: [3, { d: 4, c: 5 }], y: 1 } };
    const right = { outer: { y: 1, z: [3, { c: 5, d: 4 }] } };
    expect(normalizeToolInput(left)).toBe(normalizeToolInput(right));
  });

  it('不同参数值产生不同签名', () => {
    expect(normalizeToolInput({ id: 'a' })).not.toBe(normalizeToolInput({ id: 'b' }));
  });

  it('undefined 输入归一化为 null，避免签名变成 undefined', () => {
    expect(normalizeToolInput(undefined)).toBe('null');
  });

  it('buildToolCallSignature 组合工具名与归一化参数', () => {
    expect(buildToolCallSignature('tabs_click', { b: 1, a: 2 }))
      .toBe(buildToolCallSignature('tabs_click', { a: 2, b: 1 }));
    expect(buildToolCallSignature('tabs_click', { a: 1 }))
      .not.toBe(buildToolCallSignature('tabs_remove', { a: 1 }));
  });
});

// ==================== 重复调用死循环 ====================

describe('CircuitBreaker 重复工具调用检测', () => {
  it('阈值为 3，重复调用终止阈值为 6', () => {
    expect(CIRCUIT_BREAKER_THRESHOLD).toBe(3);
    expect(DUPLICATE_TRIP_THRESHOLD).toBe(6);
  });

  it('连续 6 次相同工具 + 相同参数才熔断（第 3 次起由软拦截注入提示）', () => {
    const breaker = new CircuitBreaker();
    const ids = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

    for (const [i, id] of ids.entries()) {
      const trip = breaker.recordStep(step([ok(id)]));
      if (i < 5) {
        expect(trip).toBeNull();
        expect(breaker.isTripped).toBe(false);
      } else {
        expect(trip).toEqual(expect.objectContaining({
          reason: 'duplicate-tool-call',
          toolName: 'tabs_click',
          count: 6,
        }));
        expect(trip!.message).toContain('连续 6 次相同参数调用同一个工具');
        expect(breaker.isTripped).toBe(true);
      }
    }
  });

  it('参数键顺序不同视为同一调用', () => {
    const breaker = new CircuitBreaker();
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) {
      breaker.recordStep(step([{ toolCallId: id, toolName: 'tabs_click', input: { a: 1, b: 2 }, output: { success: true } }]));
    }

    expect(breaker.recordStep(step([
      { toolCallId: 'c7', toolName: 'tabs_click', input: { b: 2, a: 1 }, output: { success: true } },
    ]))?.reason).toBe('duplicate-tool-call');
  });

  it('参数变化打断重复计数', () => {
    const breaker = new CircuitBreaker();
    breaker.recordStep(step([ok('c1')]));
    breaker.recordStep(step([ok('c2')]));
    // 第三次参数不同 → 计数重置为 1
    expect(breaker.recordStep(step([{
      toolCallId: 'c3',
      toolName: 'tabs_click',
      input: { id: 'tab-2' },
      output: { success: true },
    }]))).toBeNull();
    expect(breaker.isTripped).toBe(false);

    // c3..c8 同参数累计到 6 才熔断
    for (const id of ['c4', 'c5', 'c6', 'c7']) {
      expect(breaker.recordStep(step([{ toolCallId: id, toolName: 'tabs_click', input: { id: 'tab-2' }, output: { success: true } }]))).toBeNull();
    }
    expect(breaker.recordStep(step([
      { toolCallId: 'c8', toolName: 'tabs_click', input: { id: 'tab-2' }, output: { success: true } },
    ]))?.reason).toBe('duplicate-tool-call');
  });

  it('换工具打断重复计数', () => {
    const breaker = new CircuitBreaker();
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) {
      breaker.recordStep(step([{ toolCallId: id, toolName: 'tabs_click', input: { id: 1 }, output: { success: true } }]));
    }
    breaker.recordStep(step([{ toolCallId: 'c6', toolName: 'tabs_remove', input: { id: 1 }, output: { success: true } }]));

    expect(breaker.isTripped).toBe(false);
  });

  it('同一 step 内的并行重复调用同样累计', () => {
    const breaker = new CircuitBreaker();

    const trip = breaker.recordStep(step([
      { toolCallId: 'c1', toolName: 'tabs_click', input: { id: 1 }, output: { success: true } },
      { toolCallId: 'c2', toolName: 'tabs_click', input: { id: 1 }, output: { success: true } },
      { toolCallId: 'c3', toolName: 'tabs_click', input: { id: 1 }, output: { success: true } },
      { toolCallId: 'c4', toolName: 'tabs_click', input: { id: 1 }, output: { success: true } },
      { toolCallId: 'c5', toolName: 'tabs_click', input: { id: 1 }, output: { success: true } },
      { toolCallId: 'c6', toolName: 'tabs_click', input: { id: 1 }, output: { success: true } },
    ]));

    expect(trip?.reason).toBe('duplicate-tool-call');
  });

  it('同一 toolCallId 重复投喂不重复计数（stopWhen 反复扫描全部 steps）', () => {
    const breaker = new CircuitBreaker();
    const batch = step([ok('c1'), ok('c2')]);

    breaker.recordStep(batch);
    breaker.recordStep(batch);
    breaker.recordStep(batch);

    expect(breaker.isTripped).toBe(false);
  });

  it('熔断后保持首次熔断原因，不再继续计数', () => {
    const breaker = new CircuitBreaker();
    const first = breaker.recordStep(step([ok('c1'), ok('c2'), ok('c3'), ok('c4'), ok('c5'), ok('c6')]));
    const second = breaker.recordStep(step([ok('c7'), ok('c8'), ok('c9'), ok('c10'), ok('c11'), ok('c12')]));

    expect(first?.reason).toBe('duplicate-tool-call');
    expect(second).toBe(first);
    expect(breaker.tripReason).toBe(first);
  });

  it('软拦截结果（duplicateBlocked）不计数也不打断连续失败计数', () => {
    const breaker = new CircuitBreaker();
    const blocked = (id: string) => ({
      toolCallId: id,
      toolName: 'tabs_click',
      input: { id: 'tab-1' },
      output: { success: false, error: '已连续 3 次相同参数调用', duplicateBlocked: true },
    });

    // 1 次真实失败 → 3 次软拦截（失败计数保持为 1）→ 2 次真实失败 → 第 3 次真实失败熔断
    expect(breaker.recordStep(step([failed('f1')]))).toBeNull();
    for (const id of ['b1', 'b2', 'b3']) {
      expect(breaker.recordStep(step([blocked(id)]))).toBeNull();
    }
    expect(breaker.recordStep(step([failed('f2')]))).toBeNull();
    const trip = breaker.recordStep(step([failed('f3')]));
    expect(trip?.reason).toBe('consecutive-tool-errors');
  });
});

// ==================== 连续失败熔断 ====================

describe('CircuitBreaker 连续工具失败检测', () => {
  it('连续 3 次 success:false 触发熔断', () => {
    const breaker = new CircuitBreaker();

    expect(breaker.recordStep(step([failed('c1')]))).toBeNull();
    expect(breaker.recordStep(step([failed('c2')]))).toBeNull();

    const trip = breaker.recordStep(step([failed('c3')]));
    expect(trip).toEqual(expect.objectContaining({
      reason: 'consecutive-tool-errors',
      count: 3,
    }));
    expect(trip!.message).toContain('连续工具执行失败');
  });

  it('成功调用打断失败计数', () => {
    const breaker = new CircuitBreaker();
    breaker.recordStep(step([failed('c1')]));
    breaker.recordStep(step([failed('c2')]));
    breaker.recordStep(step([{
      toolCallId: 'c3',
      toolName: 'tabs_click',
      input: { id: 'c3' },
      output: { success: true },
    }]));
    breaker.recordStep(step([failed('c4')]));
    breaker.recordStep(step([failed('c5')]));

    expect(breaker.isTripped).toBe(false);
  });

  it('不同工具的失败同样累计（连续失败与工具名无关）', () => {
    const breaker = new CircuitBreaker();
    breaker.recordStep(step([failed('c1', 'tabs_click')]));
    breaker.recordStep(step([failed('c2', 'tabs_remove')]));

    expect(breaker.recordStep(step([failed('c3', 'windows_create')]))?.reason)
      .toBe('consecutive-tool-errors');
  });

  it('工具执行抛错（tool-error，无 toolResult）计入失败', () => {
    const breaker = new CircuitBreaker();
    for (const id of ['c1', 'c2']) {
      breaker.recordStep({
        toolCalls: [{ toolCallId: id, toolName: 'tabs_click', input: { id } }],
        toolResults: [],
        toolErrors: [{ toolCallId: id }],
      });
    }

    const trip = breaker.recordStep({
      toolCalls: [{ toolCallId: 'c3', toolName: 'tabs_click', input: { id: 'c3' } }],
      toolResults: [],
      toolErrors: [{ toolCallId: 'c3' }],
    });

    expect(trip?.reason).toBe('consecutive-tool-errors');
  });

  it('结果缺失（审批拒绝 / 未执行）既不计失败也不打断失败计数', () => {
    const breaker = new CircuitBreaker();
    breaker.recordStep(step([failed('c1')]));
    breaker.recordStep(step([{ toolCallId: 'c2', toolName: 'tabs_remove', input: { id: 2 } }]));
    breaker.recordStep(step([failed('c3')]));
    expect(breaker.isTripped).toBe(false);

    breaker.recordStep(step([{ toolCallId: 'c4', toolName: 'tabs_remove', input: { id: 4 } }]));

    // c1 → c3 → c5 三次失败之间夹着未执行的 c2/c4，失败计数不被打断
    expect(breaker.recordStep(step([failed('c5')]))?.reason).toBe('consecutive-tool-errors');
  });
});

// ==================== 通用行为 ====================

describe('CircuitBreaker 通用行为', () => {
  it('空 step 不改变状态', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.recordStep({ toolCalls: [] })).toBeNull();
    expect(breaker.isTripped).toBe(false);
  });

  it('每个实例状态独立（per-run）', () => {
    const first = new CircuitBreaker();
    first.recordStep(step([ok('c1'), ok('c2'), ok('c3'), ok('c4'), ok('c5'), ok('c6')]));
    const second = new CircuitBreaker();

    expect(first.isTripped).toBe(true);
    expect(second.isTripped).toBe(false);
  });

  it('reset() 清空全部状态', () => {
    const breaker = new CircuitBreaker();
    breaker.recordStep(step([ok('c1'), ok('c2'), ok('c3'), ok('c4'), ok('c5'), ok('c6')]));
    expect(breaker.isTripped).toBe(true);

    breaker.reset();

    expect(breaker.isTripped).toBe(false);
    expect(breaker.tripReason).toBeNull();
    expect(breaker.recordStep(step([ok('c1'), ok('c2')]))).toBeNull();
  });

  it('支持自定义阈值（第二个参数覆盖重复调用终止阈值）', () => {
    const breaker = new CircuitBreaker(CIRCUIT_BREAKER_THRESHOLD, 2);
    breaker.recordStep(step([ok('c1')]));

    expect(breaker.recordStep(step([ok('c2')]))?.reason).toBe('duplicate-tool-call');
  });
});

describe('formatInterruptionMessage', () => {
  const trip = {
    reason: 'duplicate-tool-call' as const,
    toolName: 'tabs_click',
    count: 3,
    message: '检测到连续 3 次相同参数调用同一个工具，触发死循环熔断保护',
  };

  it('无前置文本时直接返回熔断说明', () => {
    expect(formatInterruptionMessage(trip)).toBe(trip.message);
    expect(formatInterruptionMessage(trip, '')).toBe(trip.message);
  });

  it('有前置文本时追加为独立段落', () => {
    expect(formatInterruptionMessage(trip, '已完成部分操作'))
      .toBe(`已完成部分操作\n\n${trip.message}`);
  });
});
