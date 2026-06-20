# 开发文档: T13 - LLM Provider Client

**Project:** Browser Agent
**Task ID:** T13
**Slug:** llm-client
**Issue:** #13
**类型:** backend
**Batch:** 5
**依赖:** T2 (define-types), T5 (storage-impl)

## 1. 目标

实现 `ILlmClient` 接口，封装 `fetch` 调用 OpenAI-compatible API，支持非流式（`chat`）和流式 SSE（`chatStream`），支持 `AbortController` 中止、超时控制、`extraHeaders` 和健康检查。

## 2. 前置条件

- [x] T2: `shared/types/llm.ts` 中的 `ChatMessage`、`ChatCompletionRequest`、`ChatCompletionResponse`、`StreamChunk`、`ILlmClient`、`ProviderConfig` 类型已定义
- [x] T2: `shared/types/tool.ts` 中的 `OpenAIToolSchema` 类型已定义
- [x] T5: `ConfigStore` 可用于读写 Provider 配置

## 3. 实现步骤

### 3.1 类型定义复用

T2 中已定义的接口（来自技术方案 4.2.4）：

```ts
// 以下类型已存在于 src/shared/types/llm.ts，本任务直接导入

interface ProviderConfig {
  id: string;
  name: string;
  endpoint: string;        // 如 "https://api.openai.com" 或 "http://localhost:11434"
  apiKey: string;
  model: string;
  isLocalTrusted: boolean;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;      // 默认 120000
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCallDelta[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCallDelta {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;  // JSON string
  };
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: OpenAIToolSchema[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCallDelta[];
    };
    finish_reason: "stop" | "tool_calls" | "length";
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface StreamChunk {
  id: string;
  choices: Array<{
    delta: {
      role?: "assistant";
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: "stop" | "tool_calls" | "length" | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface ILlmClient {
  chat(request: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResponse>;
  chatStream(
    request: ChatCompletionRequest,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  checkHealth(config: ProviderConfig): Promise<boolean>;
}
```

### 3.2 LlmClient 核心实现

**文件:** `src/provider/llm-client.ts`

**关键设计：**

1. **构造函数接收 `ProviderConfig`** — 每次调用使用同一配置，不同 Provider 创建不同实例
2. **`/v1/chat/completions` 端点** — 自动拼接 `endpoint + "/v1/chat/completions"`，兼容 OpenAI / Ollama / llama-server
3. **非流式 `chat`** — `POST` 请求，`stream: false`，解析 JSON 响应
4. **流式 `chatStream`** — `POST` 请求，`stream: true`，通过 `ReadableStream` 读取 SSE，逐行解析 `data: {...}` 格式
5. **`AbortController`** — 通过 `signal` 参数传入 `fetch`，支持外部中止
6. **超时** — 用 `AbortController` + `setTimeout` 实现，默认 120s
7. **`extraHeaders`** — 合并到请求 headers

**实现伪代码：**

```ts
// src/provider/llm-client.ts

import type {
  ProviderConfig,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChunk,
  ILlmClient,
} from '../shared/types/llm';

const DEFAULT_TIMEOUT_MS = 120_000;

export class LlmClient implements ILlmClient {
  constructor(private config: ProviderConfig) {}

  private get apiUrl(): string {
    const base = this.config.endpoint.replace(/\/+$/, '');
    return `${base}/v1/chat/completions`;
  }

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    if (this.config.extraHeaders) {
      Object.assign(headers, this.config.extraHeaders);
    }
    return headers;
  }

  private createTimeoutSignal(externalSignal?: AbortSignal): {
    signal: AbortSignal;
    clear: () => void;
  } {
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();

    const timeoutId = setTimeout(() => controller.abort(new Error('请求超时')), timeoutMs);

    // 如果外部 signal 已 abort，联动 abort 内部 controller
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
      }
    }

    return {
      signal: controller.signal,
      clear: () => clearTimeout(timeoutId),
    };
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
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`LLM API 错误 ${response.status}: ${errorText}`);
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
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`LLM API 错误 ${response.status}: ${errorText}`);
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
          // 保留最后一个不完整的行
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') return;

            try {
              const chunk = JSON.parse(data) as StreamChunk;
              onChunk(chunk);
            } catch {
              // 忽略无法解析的行
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
      const timeoutId = setTimeout(() => controller.abort(), 10_000); // 健康检查 10s 超时

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
}
```

### 3.3 导出

**文件:** `src/provider/index.ts`

```ts
export { LlmClient } from './llm-client';
export type {
  ProviderConfig,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChunk,
  ToolCallDelta,
  ILlmClient,
} from '../shared/types/llm';
```

## 4. 接口/契约

### 4.1 ILlmClient 接口（已在 T2 定义）

```ts
interface ILlmClient {
  chat(request: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResponse>;
  chatStream(
    request: ChatCompletionRequest,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  checkHealth(config: ProviderConfig): Promise<boolean>;
}
```

### 4.2 错误处理约定

| 场景 | 行为 |
|------|------|
| HTTP 非 2xx | 抛出 `Error("LLM API 错误 {status}: {body}")` |
| 请求超时（默认 120s） | 抛出 `Error("请求超时")` |
| `AbortController` 中止 | 抛出 `AbortError`（浏览器原生） |
| 网络断开 | 抛出 `TypeError: Failed to fetch` |
| `chatStream` SSE 解析失败 | 忽略该行，继续处理后续行 |

## 5. 测试指引

### 5.1 单元测试

**文件:** `src/provider/__tests__/llm-client.test.ts`

**Mock 策略：** 使用 `vi.fn()` mock 全局 `fetch`，返回可控的 `Response` 对象。

**测试场景及预期：**

| # | 场景 | 输入 | 预期结果 |
|---|------|------|----------|
| 1 | `chat` 正常响应 | mock fetch 返回标准 `ChatCompletionResponse` JSON | 返回解析后的对象 |
| 2 | `chat` 含 tool_calls 响应 | mock 返回含 `tool_calls` 的响应 | `choices[0].message.tool_calls` 正确 |
| 3 | `chat` HTTP 错误 | mock 返回 500 | 抛出 `Error("LLM API 错误 500: ...")` |
| 4 | `chat` 超时 | 设置 `timeoutMs: 100`，mock 延迟 200ms | 抛出 `Error("请求超时")` |
| 5 | `chat` AbortController 中止 | 调用 `controller.abort()` 后 fetch | `AbortError` |
| 6 | `chatStream` 正常流式 | mock ReadableStream 逐行发送 SSE chunks | `onChunk` 被调用 N 次，每次收到正确的 chunk |
| 7 | `chatStream` 含 `[DONE]` 终止 | SSE 流以 `data: [DONE]` 结束 | `onChunk` 在 `[DONE]` 前收到所有 chunk |
| 8 | `chatStream` 含 tool_calls 增量 | SSE 流包含 tool_calls delta | 累积的 tool_calls 正确 |
| 9 | `chatStream` HTTP 错误 | mock 返回 500 | 抛出错误 |
| 10 | `checkHealth` 正常 | mock `/v1/models` 返回 200 | `true` |
| 11 | `checkHealth` 失败 | mock `/v1/models` 返回 401 | `false` |
| 12 | `checkHealth` 超时 | mock 延迟 > 10s | `false` |
| 13 | `extraHeaders` 附加 | 配置 `extraHeaders: {"X-Custom": "val"}` | fetch 请求包含该 header |

## 6. 验收标准

- [ ] `chat()` 非流式调用 OpenAI-compatible API，返回 `ChatCompletionResponse`
- [ ] `chatStream()` 流式调用，逐 chunk 回调，正确处理 SSE 格式
- [ ] 支持 OpenAI / Ollama / llama-server / 任意兼容端点（统一 `/v1/chat/completions` 路径）
- [ ] `checkHealth()` 通过 `GET /v1/models` 验证端点可连接
- [ ] `AbortController` 信号正确中止请求
- [ ] 非流式请求超时 120s（可配置 `timeoutMs`）
- [ ] `extraHeaders` 正确附加到请求 headers
- [ ] 单元测试 mock fetch，覆盖成功/失败/超时/中止/流式所有场景

## 7. 注意事项

1. **Ollama 兼容性** — Ollama 的 API 路径为 `/api/chat` 而非 `/v1/chat/completions`。如需兼容，可在 `ProviderConfig` 中增加 `apiStyle: "openai" | "ollama"` 字段。MVP 阶段假设所有 Provider 使用 OpenAI-compatible 端点。
2. **SSE 解析健壮性** — SSE 协议中 `data:` 行可能被拆分成多个 chunk，需要用 buffer 累积不完整的行。`data: [DONE]` 是流结束信号。
3. **tool_calls 增量合并** — 流式模式下，tool_calls 的 `function.arguments` 是增量 JSON 片段，需要调用方（Agent Loop）自行累积合并。`LlmClient` 只负责透传每个 chunk。
4. **健康检查端点** — `/v1/models` 是 OpenAI 标准端点，部分自部署服务（如 llama-server）可能不提供，此时 `checkHealth` 返回 `false` 但不影响实际使用。可后续改为 `GET /` 或 `GET /v1/chat/completions`（带 OPTIONS 预检）。
5. **API Key 空值处理** — 当 `apiKey` 为空时，不发送 `Authorization` header（Ollama 等本地服务不需要）。
6. **流式请求无单独超时** — 流式请求使用与 `timeoutMs` 相同的超时逻辑，但流式传输期间每次 `reader.read()` 都可能被超时信号中断。对于长时流式场景（如长时间推理），可能需要动态延长超时或取消超时限制。
