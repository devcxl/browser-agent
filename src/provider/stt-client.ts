import type { ProviderConfig } from '@/shared/types';

export class SttClient {
  constructor(private config: ProviderConfig) {}

  private get apiUrl(): string {
    const base = this.config.endpoint.replace(/\/+$/, '');
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
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', this.config.sttModel ?? this.config.model);

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
    } finally {
      clear();
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const base = this.config.endpoint.replace(/\/+$/, '');
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
