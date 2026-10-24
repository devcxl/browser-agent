/**
 * 循环层智能熔断：替代固定步数上限，只拦真正的死循环。
 *
 * 两类信号：
 * - 重复调用：连续 3 次「同一工具 + 相同参数」。LLM 在无法推进任务时
 *   常表现为反复点同一个按钮 / 读同一个页面，参数归一化后 deep equal。
 * - 连续失败：连续 3 次工具执行失败（`success: false` 或抛错）。
 *
 * 状态按 run 维护：每个 CircuitBreaker 实例只服务一次运行，
 * `recordStep` 以 toolCallId 去重，因此 stopWhen 每步重扫全部 steps 也不会重复计数。
 */

/** 触发熔断所需的连续次数 */
export const CIRCUIT_BREAKER_THRESHOLD = 3;

export type CircuitBreakReason = 'duplicate-tool-call' | 'consecutive-tool-errors';

export interface CircuitBreakTrip {
  reason: CircuitBreakReason;
  /** 触发熔断的最后一个工具 */
  toolName: string;
  /** 触发熔断时的连续次数 */
  count: number;
  /** 面向用户的中文说明，可直接作为 assistant 消息 */
  message: string;
}

/** 熔断等保护机制触发时附加到 AgentRunOutput 的信息（可选字段，向后兼容） */
export interface AgentRunInterruption {
  /** 仅在保护机制中止循环时出现 */
  stopReason?: 'interrupted';
  interruption?: CircuitBreakTrip;
}

/** 熔断器观察到的一个执行步骤（与 AI SDK StepResult 结构兼容） */
export interface CircuitBreakerStep {
  toolCalls: ReadonlyArray<{ toolCallId: string; toolName: string; input?: unknown }>;
  /** 已执行的工具结果；缺失表示审批拒绝 / 未执行 */
  toolResults?: ReadonlyArray<{ toolCallId: string; output?: unknown }>;
  /** 执行抛错的调用（AI SDK 转为 tool-error 内容分片） */
  toolErrors?: ReadonlyArray<{ toolCallId: string }>;
}

const TRIP_MESSAGES: Record<CircuitBreakReason, string> = {
  'duplicate-tool-call': '检测到连续 3 次相同参数调用同一个工具，触发死循环熔断保护',
  'consecutive-tool-errors': '检测到连续工具执行失败，触发熔断保护',
};

/** 递归排序对象键，使 deep equal 的参数（键顺序不同）得到同一签名 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return sorted;
      }, {});
  }
  return value;
}

/** 归一化工具参数为稳定字符串 */
export function normalizeToolInput(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value) ?? null);
}

/** 工具调用签名：工具名 + 归一化参数 */
export function buildToolCallSignature(toolName: string, input: unknown): string {
  return `${toolName}\u0000${normalizeToolInput(input)}`;
}

/** 结果是否表示执行失败 */
function isFailedOutput(output: unknown): boolean {
  return (
    output !== null
    && typeof output === 'object'
    && (output as { success?: unknown }).success === false
  );
}

/** 把熔断说明拼接到已有回复之后（无前置文本时单独成句） */
export function formatInterruptionMessage(trip: CircuitBreakTrip, precedingText = ''): string {
  return precedingText ? `${precedingText}\n\n${trip.message}` : trip.message;
}

export class CircuitBreaker {
  private readonly seenCallIds = new Set<string>();
  private lastSignature: string | null = null;
  private duplicateStreak = 0;
  private failureStreak = 0;
  private trip: CircuitBreakTrip | null = null;

  constructor(private readonly threshold: number = CIRCUIT_BREAKER_THRESHOLD) {}

  get isTripped(): boolean {
    return this.trip !== null;
  }

  get tripReason(): CircuitBreakTrip | null {
    return this.trip;
  }

  /** 记录一个步骤内按执行顺序排列的调用；返回当前熔断状态（未熔断为 null） */
  recordStep(step: CircuitBreakerStep): CircuitBreakTrip | null {
    if (this.trip) return this.trip;

    const outputs = new Map((step.toolResults ?? []).map((r) => [r.toolCallId, r.output]));
    const errorIds = new Set((step.toolErrors ?? []).map((e) => e.toolCallId));

    for (const call of step.toolCalls ?? []) {
      if (this.seenCallIds.has(call.toolCallId)) continue;
      this.seenCallIds.add(call.toolCallId);
      this.recordCall(call, outputs, errorIds);
      if (this.trip) return this.trip;
    }
    return null;
  }

  reset(): void {
    this.seenCallIds.clear();
    this.lastSignature = null;
    this.duplicateStreak = 0;
    this.failureStreak = 0;
    this.trip = null;
  }

  private recordCall(
    call: { toolCallId: string; toolName: string; input?: unknown },
    outputs: Map<string, unknown>,
    errorIds: Set<string>,
  ): void {
    const signature = buildToolCallSignature(call.toolName, call.input);
    if (signature === this.lastSignature) {
      this.duplicateStreak += 1;
    } else {
      this.lastSignature = signature;
      this.duplicateStreak = 1;
    }

    if (this.duplicateStreak >= this.threshold) {
      this.trip = {
        reason: 'duplicate-tool-call',
        toolName: call.toolName,
        count: this.duplicateStreak,
        message: TRIP_MESSAGES['duplicate-tool-call'],
      };
      return;
    }

    const executed = outputs.has(call.toolCallId) || errorIds.has(call.toolCallId);
    if (!executed) return;

    if (errorIds.has(call.toolCallId) || isFailedOutput(outputs.get(call.toolCallId))) {
      this.failureStreak += 1;
      if (this.failureStreak >= this.threshold) {
        this.trip = {
          reason: 'consecutive-tool-errors',
          toolName: call.toolName,
          count: this.failureStreak,
          message: TRIP_MESSAGES['consecutive-tool-errors'],
        };
      }
      return;
    }

    this.failureStreak = 0;
  }
}
