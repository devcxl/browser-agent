import type { ProviderConfig } from '@/shared/types';
import type { LanguageModel } from 'ai';
import { ProviderCatalog } from './provider-catalog';

/** models.dev 的 npm 包名 → 本扩展实际加载的 AI SDK provider 模块 */
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

/**
 * 解析 provider 应使用哪个 AI SDK 模块。
 *
 * 优先取 ProviderConfig.npm（由 models.dev 模板写入），
 * 其次回退到目录中同 id 的记录，最后回退 OpenAI-compatible。
 */
async function resolveModuleName(config: ProviderConfig): Promise<string> {
  if (config.npm) return NPM_TO_MODULE[config.npm] ?? '@ai-sdk/openai-compatible';
  if (!config.providerId) return '@ai-sdk/openai-compatible';

  try {
    const providerInfo = await ProviderCatalog.getInstance().getProvider(config.providerId);
    if (providerInfo?.npm) return NPM_TO_MODULE[providerInfo.npm] ?? '@ai-sdk/openai-compatible';
  } catch {
    // 目录不可用时按 OpenAI-compatible 处理
  }
  return '@ai-sdk/openai-compatible';
}

/**
 * 按 provider 配置创建聊天模型。
 *
 * 各 provider 的 baseURL / apiKey / headers 语义经此统一，
 * chat 与工具调用循环共用同一条路径。
 */
export async function createLanguageModel(
  config: ProviderConfig,
  modelId: string,
): Promise<LanguageModel> {
  const moduleName = await resolveModuleName(config);
  const baseUrl = (config.api ?? config.endpoint ?? '').replace(/\/+$/, '') || undefined;
  const headers: Record<string, string> = {
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    ...config.extraHeaders,
  };

  switch (moduleName) {
    case '@ai-sdk/anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const provider = createAnthropic({
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        apiKey: config.apiKey,
        headers,
      });
      return provider.languageModel(modelId) as unknown as LanguageModel;
    }
    case '@ai-sdk/google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const provider = createGoogleGenerativeAI({
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        apiKey: config.apiKey,
        headers,
      });
      return provider.languageModel(modelId) as unknown as LanguageModel;
    }
    case '@ai-sdk/cohere': {
      const { createCohere } = await import('@ai-sdk/cohere');
      const provider = createCohere({
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        apiKey: config.apiKey,
        headers,
      });
      return provider.languageModel(modelId) as unknown as LanguageModel;
    }
    case '@ai-sdk/openai': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const provider = createOpenAI({
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        apiKey: config.apiKey,
        headers,
      });
      return provider.languageModel(modelId) as unknown as LanguageModel;
    }
    case '@ai-sdk/openai-compatible':
    default: {
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
      const provider = createOpenAICompatible({
        name: config.name,
        baseURL: baseUrl ?? '',
        headers,
        // 请求流式 usage：否则 OpenAI-compatible 服务端默认不返回 usage，
        // tokenUsage 恒为 undefined，上下文占用进度环永不显示
        includeUsage: true,
      });
      return provider.chatModel(modelId) as unknown as LanguageModel;
    }
  }
}
