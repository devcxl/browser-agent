import type { ProviderConfig } from '@/shared/types';

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * 语音转写客户端
 *
 * 通过 AI SDK transcribe() 调用 OpenAI 兼容的 /audio/transcriptions 端点。
 * baseURL 语义与 chat 路径一致（见 tool-loop-adapter 的 createModel）：
 * 传入 provider 的 base（含 /v1），由 SDK 追加资源路径。
 */
export class SttClient {
  constructor(private config: ProviderConfig) {}

  private createTimeoutSignal(
    externalSignal?: AbortSignal,
  ): { signal: AbortSignal; clear: () => void } {
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error('请求超时')),
      timeoutMs,
    );

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener(
          'abort',
          () => controller.abort(externalSignal.reason),
          { once: true },
        );
      }
    }

    return {
      signal: controller.signal,
      clear: () => clearTimeout(timeoutId),
    };
  }

  async transcribe(audioBlob: Blob, externalSignal?: AbortSignal): Promise<string> {
    if (!this.config.sttModel) {
      throw new Error('未配置 STT 语音识别模型');
    }

    const { signal, clear } = this.createTimeoutSignal(externalSignal);
    try {
      const { transcribe } = await import('ai');
      const { createOpenAI } = await import('@ai-sdk/openai');

      const provider = createOpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.api ?? this.config.endpoint,
        headers: this.config.extraHeaders,
      });

      const result = await transcribe({
        model: provider.transcription(this.config.sttModel),
        audio: new Uint8Array(await audioBlob.arrayBuffer()),
        abortSignal: signal,
      });

      return result.text;
    } finally {
      clear();
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const base = (this.config.api ?? this.config.endpoint ?? '').replace(/\/+$/, '');
      const response = await fetch(`${base}/v1/models`, {
        method: 'GET',
        headers: this.config.apiKey
          ? { Authorization: `Bearer ${this.config.apiKey}` }
          : {},
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }
}
