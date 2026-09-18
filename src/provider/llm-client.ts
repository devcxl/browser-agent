import type {
  ProviderConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ILlmClient,
} from '@/shared/types';
import { generateText } from 'ai';
import { createLanguageModel } from './language-model';

/**
 * 非流式 LLM 客户端
 *
 * 供会话标题生成等单次补全场景使用（Agent 主循环直接使用 AI SDK ToolLoopAgent）。
 * 内部通过 createLanguageModel 按 provider 配置选择正确的 provider 模块。
 */
export class LlmClient implements ILlmClient {
  constructor(
    private config: ProviderConfig,
    private modelId: string,
  ) {}

  async chat(
    request: ChatCompletionRequest,
    externalSignal?: AbortSignal,
  ): Promise<ChatCompletionResponse> {
    const model = await createLanguageModel(this.config, request.model || this.modelId);

    const result = await generateText({
      model,
      messages: request.messages.map((m) => ({
        role: m.role === 'tool' ? ('assistant' as const) : m.role,
        content: m.content ?? '',
      })),
      temperature: request.temperature,
      maxOutputTokens: request.max_tokens,
      abortSignal: externalSignal,
    });

    const usage = result.usage;
    return {
      id: result.response?.id ?? '',
      choices: [{
        message: { role: 'assistant', content: result.text },
        finish_reason: result.finishReason === 'length' ? 'length' : 'stop',
      }],
      usage: usage
        ? {
            prompt_tokens: usage.inputTokens ?? 0,
            completion_tokens: usage.outputTokens ?? 0,
            total_tokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
          }
        : undefined,
    };
  }

}
