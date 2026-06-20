import type {
  ProviderConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChunk,
  ILlmClient,
} from '@/shared/types';

export class LlmClient implements ILlmClient {
  constructor(private config: ProviderConfig) {}

  private get apiUrl(): string {
    const base = this.config.endpoint.replace(/\/+$/, '');
    return `${base}/v1/chat/completions`;
  }

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    if (this.config.extraHeaders) {
      Object.assign(headers, this.config.extraHeaders);
    }
    return headers;
  }

  async chat(
    request: ChatCompletionRequest,
    externalSignal?: AbortSignal,
  ): Promise<ChatCompletionResponse> {
    const { signal, clear } = this.createTimeoutSignal(externalSignal);
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          model: this.config.model,
          messages: request.messages,
          tools: request.tools,
          stream: false,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          reasoning_effort: request.reasoning_effort,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(
          `LLM API 错误 ${response.status}: ${await response.text().catch(() => '')}`,
        );
      }

      return (await response.json()) as ChatCompletionResponse;
    } finally {
      clear();
    }
  }

  async chatStream(
    request: ChatCompletionRequest,
    onChunk: (chunk: StreamChunk) => void,
    externalSignal?: AbortSignal,
    onReasoning?: (content: string) => void,
  ): Promise<void> {
    const { signal, clear } = this.createTimeoutSignal(externalSignal);
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          model: this.config.model,
          messages: request.messages,
          tools: request.tools,
          stream: true,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          reasoning_effort: request.reasoning_effort,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(
          `LLM API 错误 ${response.status}: ${await response.text().catch(() => '')}`,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') return;

            try {
              const chunk = JSON.parse(data) as StreamChunk;
              // 提取 reasoning_content 并通过独立回调传递
              const reasoning = chunk.choices?.[0]?.delta?.reasoning_content;
              if (reasoning && onReasoning) {
                onReasoning(reasoning);
              }
              onChunk(chunk);
            } catch {
              // skip malformed JSON
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      clear();
    }
  }

  async checkHealth(config: ProviderConfig): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const base = config.endpoint.replace(/\/+$/, '');
      const response = await fetch(`${base}/v1/models`, {
        method: 'GET',
        headers: config.apiKey
          ? { Authorization: `Bearer ${config.apiKey}` }
          : {},
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
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
}
