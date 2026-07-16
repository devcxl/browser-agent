import type { OpenAIToolSchema } from './tool';

// ==================== Reasoning Effort ====================

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'max';

// ==================== Provider Config ====================

export interface ProviderConfig {
  id: string;
  /** 显示名称 */
  name: string;
  /** models.dev 中的 provider id，用于查找 endpoint 和可用模型列表 */
  providerId: string;
  /** API 端点 (e.g., https://api.openai.com/v1) */
  endpoint: string;
  /** API Key */
  apiKey: string;
  /** 是否为自定义 provider（不在 models.dev 列表中） */
  isCustom?: boolean;
  /** 是否标记为本地可信 */
  isLocalTrusted: boolean;
  /** 额外 HTTP headers */
  extraHeaders?: Record<string, string>;
  /** 请求超时 ms，默认 120000 */
  timeoutMs?: number;
  /** STT 语音识别模型（可选，如 whisper-1），不填则不支持语音功能 */
  sttModel?: string;
  /** 音频格式（可选），留空则自动检测浏览器支持的最佳格式 */
  audioFormat?: string;
  /** 是否默认 Provider */
  isDefault?: boolean;
}

// ==================== Chat Message ====================

export interface ToolCallDelta {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCallDelta[];
  tool_call_id?: string;
  name?: string;
}

// ==================== API Request/Response ====================

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: OpenAIToolSchema[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  reasoning_effort?: ReasoningEffort;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      reasoning_content?: string;
      tool_calls?: ToolCallDelta[];
    };
    finish_reason: 'stop' | 'tool_calls' | 'length';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ==================== Stream ====================

export interface StreamChunk {
  id: string;
  choices: Array<{
    delta: {
      role?: 'assistant';
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ==================== LLM Client 接口 ====================

export interface ILlmClient {
  /** 非流式聊天 */
  chat(request: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResponse>;
  /** 流式聊天 */
  chatStream(
    request: ChatCompletionRequest,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    onReasoning?: (content: string) => void,
  ): Promise<void>;
  /** 健康检查 */
  checkHealth(config: ProviderConfig): Promise<boolean>;
}
