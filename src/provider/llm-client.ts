import type {
  ProviderConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChunk,
  ILlmClient,
} from '@/shared/types';
import { getProviderClientFactory } from './provider-client-factory';

export class LlmClient implements ILlmClient {
  private modelId: string;
  private underlying: ILlmClient | null = null;
  private initPromise: Promise<ILlmClient> | null = null;

  constructor(
    private config: ProviderConfig,
    modelId: string,
  ) {
    this.modelId = modelId;
  }

  private async getClient(): Promise<ILlmClient> {
    if (this.underlying) return this.underlying;
    if (!this.initPromise) {
      this.initPromise = getProviderClientFactory().createClient(this.config, this.modelId).then((c) => {
        this.underlying = c;
        return c;
      });
    }
    return this.initPromise;
  }

  async chat(
    request: ChatCompletionRequest,
    externalSignal?: AbortSignal,
  ): Promise<ChatCompletionResponse> {
    const client = await this.getClient();
    return client.chat(request, externalSignal);
  }

  async chatStream(
    request: ChatCompletionRequest,
    onChunk: (chunk: StreamChunk) => void,
    externalSignal?: AbortSignal,
    onReasoning?: (content: string) => void,
  ): Promise<void> {
    const client = await this.getClient();
    return client.chatStream(request, onChunk, externalSignal, onReasoning);
  }

  async checkHealth(): Promise<boolean> {
    try {
      const client = await this.getClient();
      return client.checkHealth(this.config);
    } catch {
      return false;
    }
  }
}
