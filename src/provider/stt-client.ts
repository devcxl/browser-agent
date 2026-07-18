import type { ProviderConfig } from '@/shared/types';
import { convertToWav, mimeToExt } from './audio-utils';

const WAV_MIME = 'audio/wav';

function shouldConvertToWav(blob: Blob, config: ProviderConfig): boolean {
  if (!config.sttModel) return false;
  const format = config.audioFormat;
  if (!format) return blob.type !== WAV_MIME;
  return format !== blob.type;
}

export class SttClient {
  constructor(private config: ProviderConfig) {}

  private get apiUrl(): string {
    const base = (this.config.api ?? this.config.endpoint ?? '').replace(/\/+$/, '');
    return `${base}/v1/audio/transcriptions`;
  }

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    if (this.config.extraHeaders) {
      Object.assign(headers, this.config.extraHeaders);
    }
    return headers;
  }

  private createTimeoutSignal(
    externalSignal?: AbortSignal,
  ): { signal: AbortSignal; clear: () => void } {
    const timeoutMs = this.config.timeoutMs ?? 120_000;
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
    const { signal, clear } = this.createTimeoutSignal(externalSignal);
    try {
      if (this.config.useSDKTranscribe) {
        return await this.transcribeWithSDK(audioBlob, signal);
      }
      return await this.transcribeWithFetch(audioBlob, signal);
    } finally {
      clear();
    }
  }

  /**
   * 使用 AI SDK transcribe() 的转录路径。
   */
  private async transcribeWithSDK(audioBlob: Blob, signal: AbortSignal): Promise<string> {
    const { transcribe } = await import('ai');
    const { createOpenAI } = await import('@ai-sdk/openai');

    if (!this.config.sttModel) {
      throw new Error('未配置 STT 语音识别模型');
    }

    const provider = createOpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.endpoint,
      headers: this.config.extraHeaders,
    });

    const buffer = await audioBlob.arrayBuffer();
    const audioData = new Uint8Array(buffer);

    const result = await transcribe({
      model: provider.transcription(this.config.sttModel),
      audio: audioData,
      abortSignal: signal,
    });

    return result.text;
  }

  /**
   * 原有的手动 fetch + FormData 转录路径。
   */
  private async transcribeWithFetch(audioBlob: Blob, signal: AbortSignal): Promise<string> {
    const sendBlob = shouldConvertToWav(audioBlob, this.config)
      ? await convertToWav(audioBlob)
      : audioBlob;

    const ext = mimeToExt(sendBlob.type);
    const formData = new FormData();
    formData.append('file', sendBlob, `audio.${ext}`);
    if (!this.config.sttModel) {
      throw new Error('未配置 STT 语音识别模型');
    }
    formData.append('model', this.config.sttModel);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: this.headers,
      body: formData,
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`STT API 错误 ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as { text: string };
    return data.text;
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
