import type { ProviderConfig } from '@/shared/types';
import { APICallError, streamText } from 'ai';
import { createLanguageModel } from './language-model';

/** 连通性测试失败原因：只给粗粒度分类，绝不透出上游报文、headers 或密钥 */
export type ConnectionTestFailureReason =
  | 'missing-model'
  | 'auth'
  | 'timeout'
  | 'empty-response'
  | 'request-failed';

export type ConnectionTestResult =
  | { ok: true }
  | { ok: false; reason: ConnectionTestFailureReason };

/** 探测超时：连通性检查要快速给出结论，不沿用聊天用的长超时 */
export const CONNECTION_TEST_TIMEOUT_MS = 15_000;

/** 极短提示词：只验证「能不能真的生成文本」 */
const PROBE_PROMPT = 'Reply with the single word: OK';

/**
 * 低 token 上界，只作成本兜底而非目标值。
 * 推理型模型会先消耗推理 token 才输出正文，压到 1–8 会出现「有响应但无正文」的误判；
 * 普通模型答完即收尾，实际消耗仍然很小。
 */
const PROBE_MAX_OUTPUT_TOKENS = 256;

export interface ConnectionTestOptions {
  /** 覆盖默认探测超时（主要给测试用） */
  timeoutMs?: number;
}

/** 把上游失败折叠成少量可展示的分类；原始 error 不外传 */
function classifyFailure(error: unknown, timedOut: boolean): ConnectionTestFailureReason {
  if (timedOut) return 'timeout';
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === 401 || status === 403) return 'auth';
  }
  return 'request-failed';
}

/**
 * 用真实的一次短流式生成验证 provider + model 是否可用。
 *
 * 与聊天共用同一条模型构造路径（createLanguageModel），因此 baseURL、
 * apiKey、extraHeaders 的语义完全一致；不做 /v1 之类的路径补全。
 * 判定通过需要同时满足：真的生成了非空白文本，且流以 stop/length 正常收尾。
 * 只有 HTTP 200、只收到 `[DONE]`、或正文之后紧跟错误/断流，都不算通过。
 */
export async function testProviderConnection(
  config: ProviderConfig,
  modelId: string | undefined,
  options: ConnectionTestOptions = {},
): Promise<ConnectionTestResult> {
  const trimmedModelId = modelId?.trim() ?? '';
  if (!trimmedModelId) return { ok: false, reason: 'missing-model' };

  const controller = new AbortController();
  let timedOut = false;
  let drained = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? CONNECTION_TEST_TIMEOUT_MS);

  try {
    const model = await createLanguageModel(config, trimmedModelId);
    const result = streamText({
      model,
      prompt: PROBE_PROMPT,
      maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
      maxRetries: 0,
      abortSignal: controller.signal,
      // SDK 默认把原始 error 打到 console.error，其中可能含请求体/headers/密钥
      onError: () => {},
    });

    let text = '';
    let finishReason: string | undefined;

    for await (const part of result.fullStream) {
      if (part.type === 'error') {
        return { ok: false, reason: classifyFailure(part.error, timedOut) };
      }
      if (part.type === 'abort') {
        return { ok: false, reason: timedOut ? 'timeout' : 'request-failed' };
      }
      if (part.type === 'text-delta') {
        text += part.text;
      } else if (part.type === 'finish-step' || part.type === 'finish') {
        finishReason = part.finishReason;
      }
    }
    drained = true;

    if (timedOut) return { ok: false, reason: 'timeout' };

    // 必须看到正常收尾（stop/length）才算这次生成真的走完：
    // 有正文但流被截断、或代理返回的不是模型流（HTML 页 → 'other'），都不算通。
    const completed = finishReason === 'stop' || finishReason === 'length';
    if (!completed) return { ok: false, reason: 'request-failed' };

    return text.trim() ? { ok: true } : { ok: false, reason: 'empty-response' };
  } catch (error) {
    return { ok: false, reason: classifyFailure(error, timedOut) };
  } finally {
    clearTimeout(timer);
    // 早退（错误 part / 中止）时显式中断底层请求，避免连接一直挂在后台；
    // 正常读完整条流时无需再动它
    if (!drained) controller.abort();
  }
}

/**
 * 选出这次探测要用的模型：优先沿用聊天当前选择，其次 provider 默认，最后第一个模型。
 * 返回空字符串表示该 provider 还没有可用模型。
 */
export function pickConnectionTestModelId(
  provider: ProviderConfig,
  activeProviderId: string | undefined,
  selectedModelId: string | undefined,
): string {
  const knownIds = Object.keys(provider.models ?? {});
  const isKnownModel = (id: string | undefined): id is string =>
    typeof id === 'string' && id.trim() !== '' && knownIds.includes(id);
  const declaredDefault = provider.defaultModelId?.trim();

  // 当前聊天选择只在它确实属于该 provider 的模型列表时才算数
  if (provider.id === activeProviderId && isKnownModel(selectedModelId)) return selectedModelId;
  // provider 自己声明的默认模型可信，即使本地还没有模型列表快照
  if (declaredDefault && (knownIds.length === 0 || knownIds.includes(declaredDefault))) {
    return declaredDefault;
  }
  return knownIds[0] ?? '';
}
