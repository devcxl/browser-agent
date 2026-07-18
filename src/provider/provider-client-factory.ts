import type { ProviderConfig, ILlmClient, ChatCompletionRequest, StreamChunk, ChatMessage, OpenAIToolSchema } from '@/shared/types';
import type { CatalogModel } from './provider-catalog';
import { ProviderCatalog } from './provider-catalog';

/* eslint-disable @typescript-eslint/no-explicit-any */

const NPM_TO_MODULE: Record<string, string> = {
  '@ai-sdk/openai': '@ai-sdk/openai',
  '@ai-sdk/openai-compatible': '@ai-sdk/openai-compatible',
  '@ai-sdk/anthropic': '@ai-sdk/anthropic',
  '@ai-sdk/google': '@ai-sdk/google',
  '@ai-sdk/google-vertex': '@ai-sdk/google',
  '@ai-sdk/google-vertex/anthropic': '@ai-sdk/google',
  '@ai-sdk/cohere': '@ai-sdk/cohere',
  '@ai-sdk/mistral': '@ai-sdk/openai-compatible',
  '@ai-sdk/xai': '@ai-sdk/openai-compatible',
  '@ai-sdk/groq': '@ai-sdk/openai-compatible',
  '@ai-sdk/perplexity': '@ai-sdk/openai-compatible',
  '@ai-sdk/deepinfra': '@ai-sdk/openai-compatible',
  '@ai-sdk/togetherai': '@ai-sdk/openai-compatible',
  '@ai-sdk/cerebras': '@ai-sdk/openai-compatible',
  '@ai-sdk/vercel': '@ai-sdk/openai-compatible',
  '@ai-sdk/gateway': '@ai-sdk/openai-compatible',
  '@openrouter/ai-sdk-provider': '@ai-sdk/openai-compatible',
  '@aihubmix/ai-sdk-provider': '@ai-sdk/openai-compatible',
  'gitlab-ai-provider': '@ai-sdk/openai-compatible',
  'venice-ai-sdk-provider': '@ai-sdk/openai-compatible',
  'merge-gateway-ai-sdk-provider': '@ai-sdk/openai-compatible',
  'ai-gateway-provider': '@ai-sdk/openai-compatible',
  '@jerome-benoit/sap-ai-provider-v2': '@ai-sdk/openai-compatible',
};

function mapReasoningEffort(effort?: string): string | undefined {
  if (!effort || effort === 'none') return undefined;
  const map: Record<string, string> = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    max: 'xhigh',
  };
  return map[effort] ?? effort;
}

function mapMessagesToPrompt(messages: ChatMessage[]): any[] {
  return messages
    .filter((m) => {
      if (m.role === 'tool') return true;
      if (m.role === 'system' && m.content === null) return false;
      if (m.role === 'assistant' && m.content === null && (!m.tool_calls || m.tool_calls.length === 0)) return false;
      return m.content !== null || (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0);
    })
    .map((m) => {
      if (m.role === 'system') {
        return { role: 'system', content: m.content ?? '' };
      }
      if (m.role === 'user') {
        return { role: 'user', content: [{ type: 'text', text: m.content ?? '' }] };
      }
      if (m.role === 'assistant') {
        const parts: any[] = [];
        if (m.content) {
          parts.push({ type: 'text', text: m.content });
        }
        if (m.tool_calls) {
          for (const tc of m.tool_calls) {
            let input: unknown;
            try { input = JSON.parse(tc.function.arguments); } catch { input = tc.function.arguments; }
            parts.push({ type: 'tool-call', toolCallId: tc.id, toolName: tc.function.name, input });
          }
        }
        return { role: 'assistant', content: parts };
      }
      if (m.role === 'tool') {
        const resultParts: any[] = [];
        if (m.content) {
          let value: any = m.content;
          try { value = JSON.parse(m.content); } catch { /* keep as string */ }
          resultParts.push({
            type: 'tool-result',
            toolCallId: m.tool_call_id ?? '',
            toolName: m.name ?? '',
            output: typeof value === 'string' ? { type: 'text', value } : { type: 'json', value },
          });
        }
        return { role: 'tool', content: resultParts };
      }
      return { role: m.role, content: [{ type: 'text', text: m.content ?? '' }] };
    });
}

function mapOpenAITools(tools?: OpenAIToolSchema[]): any[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: 'function' as const,
    name: t.function.name,
    description: t.function.description,
    inputSchema: t.function.parameters as unknown as Record<string, unknown>,
  }));
}

export class ProviderClientFactory {
  async createClient(providerConfig: ProviderConfig, modelId: string): Promise<ILlmClient> {
    const catalog = await ProviderCatalog.getInstance().getCatalog();
    const providerInfo = providerConfig.providerId ? catalog[providerConfig.providerId] : undefined;
    const npm = providerConfig.npm ?? providerInfo?.npm ?? '@ai-sdk/openai-compatible';
    const moduleName = NPM_TO_MODULE[npm] ?? '@ai-sdk/openai-compatible';

    const model = await this.loadModel(moduleName, providerConfig, modelId);

    return {
      chat: async (request: ChatCompletionRequest, signal?: AbortSignal) => {
        const prompt = mapMessagesToPrompt(request.messages);
        const tools = mapOpenAITools(request.tools);

        const result = await model.doGenerate({
          prompt,
          tools,
          toolChoice: tools ? { type: 'auto' } : undefined,
          abortSignal: signal,
          maxOutputTokens: request.max_tokens,
          temperature: request.temperature,
          reasoning: mapReasoningEffort(request.reasoning_effort),
        });

        const content: any[] = result.content ?? [];
        const textParts = content.filter((c: any) => c.type === 'text' && c.text);
        const toolCallParts = content.filter((c: any) => c.type === 'tool-call');

        const message: any = {
          role: 'assistant' as const,
          content: textParts.map((c: any) => c.text).join('') || null,
          tool_calls: toolCallParts.length > 0
            ? toolCallParts.map((tc: any) => ({
                id: tc.toolCallId ?? '',
                type: 'function' as const,
                function: {
                  name: tc.toolName ?? '',
                  arguments: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input),
                },
              }))
            : undefined,
        };

        return {
          id: result.response?.id ?? '',
          choices: [{
            message,
            finish_reason: result.finishReason?.unified === 'tool-calls' ? 'tool_calls' : 'stop',
          }],
          usage: result.usage ? {
            prompt_tokens: result.usage.inputTokens?.total ?? 0,
            completion_tokens: result.usage.outputTokens?.total ?? 0,
            total_tokens: (result.usage.inputTokens?.total ?? 0) + (result.usage.outputTokens?.total ?? 0),
          } : undefined,
        };
      },

      chatStream: async (
        request: ChatCompletionRequest,
        onChunk: (chunk: StreamChunk) => void,
        signal?: AbortSignal,
        onReasoning?: (content: string) => void,
      ) => {
        const prompt = mapMessagesToPrompt(request.messages);
        const tools = mapOpenAITools(request.tools);

        const result = await model.doStream({
          prompt,
          tools,
          toolChoice: tools ? { type: 'auto' } : undefined,
          abortSignal: signal,
          maxOutputTokens: request.max_tokens,
          temperature: request.temperature,
          reasoning: mapReasoningEffort(request.reasoning_effort),
        });

        const reader = result.stream.getReader();
        const toolCallsAccum: Record<number, { id: string; type: 'function'; function: { name: string; arguments: string } }> = {};
        let streamId = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value?.type) continue;

            const v = value as any;

            switch (v.type) {
              case 'stream-start':
                break;
              case 'text-start':
                if (v.id) streamId = v.id;
                break;
              case 'text-delta':
                if (v.delta) {
                  onChunk({
                    id: streamId,
                    choices: [{ delta: { content: v.delta }, finish_reason: null }],
                  });
                }
                break;
              case 'reasoning-start':
              case 'reasoning-delta':
                if (v.delta && onReasoning) onReasoning(v.delta);
                break;
              case 'tool-input-start': {
                if (v.toolName) {
                  const idx = Object.keys(toolCallsAccum).length;
                  toolCallsAccum[idx] = {
                    id: v.id ?? '',
                    type: 'function',
                    function: { name: v.toolName, arguments: '' },
                  };
                }
                break;
              }
              case 'tool-input-delta': {
                if (v.delta) {
                  const entries = Object.entries(toolCallsAccum);
                  const last = entries[entries.length - 1];
                  if (last) last[1].function.arguments += v.delta;
                }
                break;
              }
              case 'finish': {
                const finishReason = v.finishReason?.unified === 'tool-calls' ? 'tool_calls'
                  : v.finishReason?.unified === 'length' ? 'length'
                  : 'stop';
                const toolsOut = Object.values(toolCallsAccum);
                if (toolsOut.length > 0) {
                  onChunk({
                    id: streamId,
                    choices: [{
                      delta: {
                        tool_calls: toolsOut.map((tc, i) => ({
                          index: i, id: tc.id, type: 'function' as const,
                          function: { name: tc.function.name, arguments: tc.function.arguments },
                        })),
                      },
                      finish_reason: 'tool_calls',
                    }],
                  });
                } else {
                  onChunk({
                    id: streamId,
                    choices: [{ delta: {}, finish_reason: finishReason }],
                  });
                }
                break;
              }
              case 'error':
                throw v.error instanceof Error ? v.error : new Error(String(v.error));
            }
          }
        } finally {
          reader.releaseLock();
        }
      },

      checkHealth: async () => true,
    };
  }

  private async loadModel(moduleName: string, config: ProviderConfig, modelId: string): Promise<any> {
    const endpoint = (config.api ?? config.endpoint ?? '').replace(/\/+$/, '');
    const headers: Record<string, string> = {
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      ...config.extraHeaders,
    };

    const baseUrl = endpoint || undefined;

    switch (moduleName) {
      case '@ai-sdk/anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        const provider = createAnthropic({
          ...(baseUrl ? { baseURL: baseUrl } : {}),
          apiKey: config.apiKey,
          headers,
        });
        return (provider as any).chatModel(modelId);
      }
      case '@ai-sdk/google': {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
        const provider = createGoogleGenerativeAI({
          ...(baseUrl ? { baseURL: baseUrl } : {}),
          apiKey: config.apiKey,
          headers,
        });
        return (provider as any).chatModel(modelId);
      }
      case '@ai-sdk/cohere': {
        const { createCohere } = await import('@ai-sdk/cohere');
        const provider = createCohere({
          ...(baseUrl ? { baseURL: baseUrl } : {}),
          apiKey: config.apiKey,
          headers,
        });
        return (provider as any).chatModel(modelId);
      }
      case '@ai-sdk/openai': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        const provider = createOpenAI({
          ...(baseUrl ? { baseURL: baseUrl } : {}),
          apiKey: config.apiKey,
          headers,
        });
        return (provider as any).chatModel(modelId);
      }
      case '@ai-sdk/openai-compatible':
      default: {
        const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
        const provider = createOpenAICompatible({
          name: config.name,
          baseURL: baseUrl || 'https://api.openai.com/v1',
          headers,
        });
        return (provider as any).chatModel(modelId);
      }
    }
  }

  async getModels(providerConfig: ProviderConfig): Promise<CatalogModel[]> {
    if (providerConfig.models) return Object.values(providerConfig.models);
    const catalog = await ProviderCatalog.getInstance().getCatalog();
    const providerInfo = providerConfig.providerId ? catalog[providerConfig.providerId] : undefined;
    if (!providerInfo) return [];
    return Object.values(providerInfo.models);
  }
}

let factoryInstance: ProviderClientFactory | null = null;

export function getProviderClientFactory(): ProviderClientFactory {
  if (!factoryInstance) {
    factoryInstance = new ProviderClientFactory();
  }
  return factoryInstance;
}

export function resetProviderClientFactory(): void {
  factoryInstance = null;
}
