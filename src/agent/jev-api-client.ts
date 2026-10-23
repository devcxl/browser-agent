import {
  TOOL_CATEGORY_DESCRIPTIONS,
} from '@/shared/tool-categories';
import type { ToolCategory } from '@/shared/types/tool';

export const JEV_API_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-1.13.0';
export const JEV_REQUEST_TIMEOUT_MS = 5_000;
export const JEV_POSITIVE_THRESHOLD = 0.8;
export const JEV_NEGATIVE_THRESHOLD = 0.2;

const TOOL_CATEGORIES = Object.keys(TOOL_CATEGORY_DESCRIPTIONS) as ToolCategory[];

const JEV_QUESTIONS = Object.fromEntries(
  TOOL_CATEGORIES.map((category) => [category, {
    type: 'noul',
    instructions: `Does the request require the ${category} tool category?`,
    criteria: {
      true: TOOL_CATEGORY_DESCRIPTIONS[category],
      false: `The request can be handled without ${TOOL_CATEGORY_DESCRIPTIONS[category]}.`,
    },
  }]),
) as Record<ToolCategory, {
  type: 'noul';
  instructions: string;
  criteria: { true: string; false: string };
}>;

export interface JevDecision {
  model: string;
  probabilities: Record<ToolCategory, number>;
}

export type JevFailureReason = 'configuration' | 'timeout' | 'cancelled' | 'http' | 'network' | 'invalid_response';

export class JevApiError extends Error {
  constructor(readonly reason: JevFailureReason) {
    super(`Jev request failed: ${reason}`);
    this.name = 'JevApiError';
  }
}

interface RequestAbortControl {
  signal: AbortSignal;
  timedOut: () => boolean;
  dispose: () => void;
}

export class JevApiClient {
  constructor(
    private readonly fetchRequest: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly timeoutMs = JEV_REQUEST_TIMEOUT_MS,
  ) {}

  async classify(state: string, apiKey: string, signal?: AbortSignal): Promise<JevDecision> {
    const startedAt = performance.now();
    const abortControl = createRequestAbortControl(signal, this.timeoutMs);

    try {
      if (!apiKey.trim()) throw new JevApiError('configuration');

      const response = await this.fetchRequest(JEV_API_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: JEV_MODEL, state, questions: JEV_QUESTIONS }),
        signal: abortControl.signal,
        redirect: 'error',
        credentials: 'omit',
      });

      if (!response.ok) throw new JevApiError('http');

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new JevApiError('invalid_response');
      }

      const decision = parseJevDecision(payload);
      console.debug('[JevApiClient] decision complete', {
        outcome: 'success',
        model: decision.model,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
      return decision;
    } catch (error) {
      const reason = getFailureReason(error, abortControl);
      console.warn('[JevApiClient] decision failed', {
        outcome: reason,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
      throw error instanceof JevApiError ? error : new JevApiError(reason);
    } finally {
      abortControl.dispose();
    }
  }
}

function createRequestAbortControl(signal: AbortSignal | undefined, timeoutMs: number): RequestAbortControl {
  const controller = new AbortController();
  let timeoutElapsed = false;
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });

  const timeoutId = setTimeout(() => {
    timeoutElapsed = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    timedOut: () => timeoutElapsed,
    dispose: () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

function getFailureReason(error: unknown, abortControl: RequestAbortControl): JevFailureReason {
  if (abortControl.timedOut()) return 'timeout';
  if (abortControl.signal.aborted) return 'cancelled';
  if (error instanceof JevApiError) return error.reason;
  return 'network';
}

function parseJevDecision(value: unknown): JevDecision {
  if (!isRecord(value) || value.model !== JEV_MODEL) {
    throw new JevApiError('invalid_response');
  }
  const answers = value.answers;
  if (!isRecord(answers)) throw new JevApiError('invalid_response');

  const answerNames = Object.keys(answers);
  if (
    answerNames.length !== TOOL_CATEGORIES.length
    || !TOOL_CATEGORIES.every((category) => Object.hasOwn(answers, category))
    || answerNames.some((name) => !TOOL_CATEGORIES.includes(name as ToolCategory))
  ) {
    throw new JevApiError('invalid_response');
  }

  const probabilities = {} as Record<ToolCategory, number>;
  for (const category of TOOL_CATEGORIES) {
    const answer = answers[category];
    if (!isRecord(answer) || answer.type !== 'noul' || !isProbability(answer.noul)) {
      throw new JevApiError('invalid_response');
    }
    probabilities[category] = answer.noul;
  }

  return { model: JEV_MODEL, probabilities };
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
