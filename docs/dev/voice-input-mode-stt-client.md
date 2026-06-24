# 开发文档: T2 - 实现 SttClient 类

**Project:** voice-input-mode
**Task ID:** T2
**Slug:** stt-client
**Issue:** #95
**类型:** backend
**Batch:** 2
**依赖:** T1 (#94)

## 1. 目标

实现 `SttClient` 类，封装 OpenAI 兼容的 `/v1/audio/transcriptions` 端点，将音频 Blob 发送至 STT 服务并返回转写文本。完全复用 `LlmClient` 的架构模式（超时、AbortSignal、extraHeaders 等）。

## 2. 前置条件

- [ ] T1 (#94): `ProviderConfig` 类型已在 `src/shared/types/llm.ts` 中定义完毕（**当前已存在，T1 可能涉及补充 `sttModel` 字段**）

### 2.1 关于 `sttModel` 的假设

技术方案中 HTTP 请求体使用 `model: {sttModel}`，但当前 `ProviderConfig` 只有 `model` 字段。处理策略：

| 场景 | 策略 |
|------|------|
| T1 补充了 `sttModel?: string` 字段 | `transcribe()` 使用 `this.config.sttModel ?? this.config.model` |
| T1 未补充该字段 | `transcribe()` 直接使用 `this.config.model` |

本文档后续章节按 **T1 未补充** 的情况编写（使用 `this.config.model`）。若 T1 补充了该字段，实现时按上表策略调整。

## 3. 实现步骤

### 3.1 新建 `src/provider/stt-client.ts`

**设计原则：** 与 `LlmClient` 保持结构一致，复用相同的辅助方法模式（`apiUrl`、`headers`、`createTimeoutSignal`），仅 HTTP 请求细节不同。

#### 3.1.1 类结构

```typescript
import type { ProviderConfig } from '@/shared/types';

export class SttClient {
  constructor(private config: ProviderConfig) {}

  /** POST {endpoint}/v1/audio/transcriptions，发送 FormData */
  async transcribe(audioBlob: Blob, externalSignal?: AbortSignal): Promise<string>;

  /** 检查 Provider 端点可用性（GET /v1/models） */
  async checkHealth(): Promise<boolean>;
}
```

#### 3.1.2 `apiUrl` getter

```typescript
private get apiUrl(): string {
  const base = this.config.endpoint.replace(/\/+$/, '');
  return `${base}/v1/audio/transcriptions`;
}
```

#### 3.1.3 `headers` getter

与 `LlmClient` 完全一致，但 Content-Type 不需要设置（`fetch` 在发送 FormData 时自动设置带 boundary 的 `multipart/form-data`）：

```typescript
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
```

> **注意：** 不设置 `Content-Type`。`fetch` 对 `FormData` 会自动设置 `multipart/form-data; boundary=...`。

#### 3.1.4 `createTimeoutSignal` 方法

**完全复用** `LlmClient.createTimeoutSignal` 的实现，一字不改：

```typescript
private createTimeoutSignal(externalSignal?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const timeoutMs = this.config.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('请求超时')), timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
    }
  }

  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
}
```

#### 3.1.5 `transcribe` 方法

```typescript
async transcribe(audioBlob: Blob, externalSignal?: AbortSignal): Promise<string> {
  const { signal, clear } = this.createTimeoutSignal(externalSignal);

  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', this.config.model);

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
```

**关键设计点：**
- `FormData.append('file', audioBlob, 'audio.webm')` — 第三个参数指定文件名，帮助服务端识别格式
- `FormData.append('model', this.config.model)` — 使用 config 中的 model 字段
- 响应格式：`{ text: "..." }` — 直接解构返回 `data.text`
- 错误消息前缀使用 `STT API` 以区别于 `LlmClient` 的 `LLM API`

#### 3.1.6 `checkHealth` 方法

实例方法，不接收外部 config 参数（与 `LlmClient.checkHealth` 不同——后者是静态风格的方法签名）：

```typescript
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
```

### 3.2 修改 `src/provider/index.ts`

在现有导出后追加一行：

```typescript
export { LlmClient } from './llm-client';
export { SttClient } from './stt-client';          // ← 新增
export type {
  ProviderConfig,
  // ... 其他类型保持不变
} from '@/shared/types';
```

### 3.3 新建 `src/provider/__tests__/stt-client.test.ts`

参照 `llm-client.test.ts` 的测试风格，使用 vitest + mock fetch。

#### 3.3.1 测试辅助函数

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SttClient } from '../stt-client';
import type { ProviderConfig } from '@/shared/types';

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-stt-provider',
    name: 'Test STT',
    endpoint: 'https://api.test.com/v1',
    apiKey: 'sk-test-key',
    model: 'whisper-1',
    isLocalTrusted: false,
    ...overrides,
  };
}

function makeAudioBlob(): Blob {
  return new Blob(['fake-audio-data'], { type: 'audio/webm' });
}

function mockFetchOk(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetchError(status: number) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: 'something went wrong' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetchPending() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    (_url, init) =>
      new Promise<Response>((_, reject) => {
        const signal = init?.signal as AbortSignal;
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        const onAbort = () => reject(signal.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
      }),
  );
}
```

#### 3.3.2 测试用例

| # | 测试场景 | 输入 | 预期结果 |
|---|---------|------|----------|
| 1 | `transcribe` 成功返回文本 | mock fetch 返回 `{ text: "你好世界" }` | 返回 `"你好世界"` |
| 2 | `transcribe` 发送正确的 FormData | 捕获 fetch 调用参数 | body 为 FormData，含 `file` 和 `model` 字段 |
| 3 | `transcribe` 发送正确的 URL | 捕获 fetch 调用参数 | URL 为 `https://api.test.com/v1/v1/audio/transcriptions` |
| 4 | `transcribe` 发送 Authorization header | 捕获 fetch 调用参数 | headers 含 `Authorization: Bearer sk-test-key` |
| 5 | `transcribe` HTTP 400 错误 | mock fetch 返回 400 | 抛出 `Error("STT API 错误 400: ...")` |
| 6 | `transcribe` HTTP 500 错误 | mock fetch 返回 500 | 抛出 `Error("STT API 错误 500: ...")` |
| 7 | `transcribe` 请求超时 | `timeoutMs: 100`，mock 不 resolve | 抛出错误（超时） |
| 8 | `transcribe` 外部 AbortSignal 取消 | 调用 `controller.abort()` | 抛出 `AbortError` |
| 9 | `transcribe` 外部 AbortSignal 已取消 | 传入已 abort 的 signal | fetch 被拒绝 |
| 10 | `transcribe` extraHeaders 附加 | config 含 `extraHeaders: {"X-Custom": "val"}` | fetch headers 含 `X-Custom: val` |
| 11 | `checkHealth` 返回 true | mock fetch 返回 200 | `true` |
| 12 | `checkHealth` 返回 false (401) | mock fetch 返回 401 | `false` |
| 13 | `checkHealth` 返回 false (超时) | mock 延迟 > 10s | `false` |

#### 3.3.3 关键测试代码示例

```typescript
describe('SttClient', () => {
  let client: SttClient;
  let config: ProviderConfig;

  beforeEach(() => {
    config = makeConfig();
    client = new SttClient(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('transcribe', () => {
    it('应该发送请求并返回转写文本', async () => {
      const fetchSpy = mockFetchOk({ text: '你好世界' });

      const result = await client.transcribe(makeAudioBlob());

      expect(result).toBe('你好世界');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.com/v1/v1/audio/transcriptions');
      expect(init.method).toBe('POST');

      // 验证 FormData
      const body = init.body as FormData;
      expect(body.has('file')).toBe(true);
      expect(body.has('model')).toBe(true);
      expect(body.get('model')).toBe('whisper-1');
    });

    it('应该在 HTTP 4xx 时抛出错误', async () => {
      mockFetchError(400);

      await expect(client.transcribe(makeAudioBlob())).rejects.toThrow('STT API 错误 400');
    });

    it('应该在 HTTP 5xx 时抛出错误', async () => {
      mockFetchError(500);

      await expect(client.transcribe(makeAudioBlob())).rejects.toThrow('STT API 错误 500');
    });

    it('应该在超时时抛出错误', async () => {
      vi.useFakeTimers();
      const fastConfig = makeConfig({ timeoutMs: 100 });
      const fastClient = new SttClient(fastConfig);
      mockFetchPending();

      const promise = fastClient.transcribe(makeAudioBlob());
      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow();
      vi.useRealTimers();
    });

    it('应该响应外部 AbortSignal 取消', async () => {
      mockFetchPending();
      const controller = new AbortController();

      const promise = client.transcribe(makeAudioBlob(), controller.signal);
      controller.abort();

      await expect(promise).rejects.toThrow('The operation was aborted');
    });

    it('应该附加 extraHeaders', async () => {
      const configWithHeaders = makeConfig({
        extraHeaders: { 'X-Custom': 'value1' },
      });
      const customClient = new SttClient(configWithHeaders);
      const fetchSpy = mockFetchOk({ text: 'test' });

      await customClient.transcribe(makeAudioBlob());

      const headers = fetchSpy.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers['X-Custom']).toBe('value1');
      expect(headers['Authorization']).toBe('Bearer sk-test-key');
    });
  });

  describe('checkHealth', () => {
    it('应该在 200 时返回 true', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

      const result = await client.checkHealth();

      expect(result).toBe(true);
    });

    it('应该在 401 时返回 false', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));

      const result = await client.checkHealth();

      expect(result).toBe(false);
    });
  });
});
```

## 4. 接口/契约

### 4.1 `SttClient` 公开方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `transcribe` | `(audioBlob: Blob, externalSignal?: AbortSignal): Promise<string>` | 发送音频到 STT 端点，返回转写文本 |
| `checkHealth` | `(): Promise<boolean>` | 检查 Provider 端点是否可用 |

### 4.2 HTTP 请求格式

```
POST {endpoint}/v1/audio/transcriptions
Content-Type: multipart/form-data
Authorization: Bearer {apiKey}
{extraHeaders...}

FormData:
  file: <Blob>      (filename: "audio.webm")
  model: {model}    (来自 ProviderConfig.model)
```

### 4.3 HTTP 响应格式

```json
{
  "text": "转写后的文本内容"
}
```

### 4.4 错误处理约定

| 场景 | 行为 |
|------|------|
| HTTP 非 2xx | 抛出 `Error("STT API 错误 {status}: {body}")` |
| 请求超时（默认 120s） | 抛出 `Error("请求超时")` |
| `AbortController` 中止 | 抛出浏览器原生 `AbortError` |
| 网络断开 | 抛出 `TypeError: Failed to fetch` |
| 响应 JSON 不含 `text` 字段 | 返回 `undefined`（由调用方处理） |

### 4.5 数据模型

无新增数据模型。完全复用 `ProviderConfig`（`src/shared/types/llm.ts`）。

## 5. 测试指引

### 5.1 单元测试

**文件:** `src/provider/__tests__/stt-client.test.ts`

**Mock 策略:** 使用 `vi.spyOn(globalThis, 'fetch')` mock 全局 `fetch`。

**运行命令:**
```bash
npx vitest run src/provider/__tests__/stt-client.test.ts
```

### 5.2 集成测试（手动，可选）

若本地有 Whisper 兼容服务（如 Ollama + whisper、faster-whisper-server），可手动验证：

```typescript
const client = new SttClient({
  id: 'local-whisper',
  name: 'Local Whisper',
  endpoint: 'http://localhost:8080/v1',
  apiKey: '',
  model: 'whisper-1',
  isLocalTrusted: true,
});

const audioBlob = await mediaRecorder.getBlob();  // 从实际录音获取
const text = await client.transcribe(audioBlob);
console.log('转写结果:', text);
```

### 5.3 回归测试

确保修改 `index.ts` 导出后，现有测试全部通过：

```bash
npx vitest run
```

## 6. 验收标准

- [ ] `SttClient` 类可实例化，构造函数接收 `ProviderConfig`
- [ ] `transcribe()` 发送 POST 到 `{endpoint}/v1/audio/transcriptions`
- [ ] FormData 包含 `file` 和 `model` 字段
- [ ] 支持 `AbortSignal` 外部取消
- [ ] 超时机制复用 `config.timeoutMs`，默认 120s
- [ ] HTTP 错误抛出含状态码的 Error（前缀 `STT API`）
- [ ] 单元测试覆盖：成功返回文本、HTTP 4xx/5xx 错误、请求超时、外部 AbortSignal 取消、extraHeaders
- [ ] `src/provider/index.ts` 导出 `SttClient`
- [ ] 现有测试（`llm-client.test.ts` 等）全部通过

## 7. 注意事项

### 7.1 与 LlmClient 的差异

| 维度 | LlmClient | SttClient |
|------|-----------|-----------|
| 端点 | `/v1/chat/completions` | `/v1/audio/transcriptions` |
| 请求体 | JSON (`application/json`) | FormData (`multipart/form-data`) |
| Content-Type header | 手动设置 `application/json` | 不设置（浏览器自动处理） |
| 响应格式 | `ChatCompletionResponse` | `{ text: string }` |
| 错误前缀 | `LLM API` | `STT API` |
| `checkHealth` 签名 | `(config: ProviderConfig): Promise<boolean>` | `(): Promise<boolean>` |

### 7.2 `sttModel` 字段问题

当前 `ProviderConfig` 只有 `model` 字段。如果语音转写需要与聊天使用不同模型，需在 `ProviderConfig` 中增加 `sttModel?: string` 可选字段。`transcribe()` 中使用 `this.config.sttModel ?? this.config.model` 即可向下兼容。

### 7.3 `checkHealth` 签名差异

`LlmClient.checkHealth` 接收 `ProviderConfig` 参数（因为它在某些上下文中作为静态工具方法使用），而 `SttClient.checkHealth` 是纯实例方法。这是有意为之——`SttClient` 的实例已经持有 config，无需重复传入。

### 7.4 音频文件名字段

`FormData.append('file', audioBlob, 'audio.webm')` 中的第三个参数 `'audio.webm'` 指定了文件名。某些 STT 服务会根据文件扩展名推断音频格式，因此使用 `.webm` 扩展名符合浏览器 `MediaRecorder` 的默认输出格式。

### 7.5 潜在风险

- **大音频文件超时**：默认 120s 对于长录音（> 5 分钟）可能不足，需由调用方在 `ProviderConfig` 中配置更大的 `timeoutMs`
- **无重试机制**：网络瞬时故障时不会自动重试，由上层调用方处理（保持 `SttClient` 职责单一）
- **响应格式兼容性**：假设所有 Provider 返回 `{ text: string }`，若某 Provider 返回不同格式（如 `{ data: { text: "..." } }`）会失败
