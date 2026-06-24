## PR #101 审查报告

**审查日期**: 2026-06-24  
**审查者**: @reviewer  
**PR 标题**: T2: 实现 SttClient 类 (closes #95)  
**关联 Issue**: #95  
**变更文件数**: 3（2 新建 + 1 修改）

---

### 变更摘要

在 `src/provider/stt-client.ts` 中新建 `SttClient` 类，封装 OpenAI 兼容的 `/v1/audio/transcriptions` 端点。复用 `LlmClient` 的架构模式（超时、AbortSignal、extraHeaders）。同时新增 11 个单元测试用例，并在 `src/provider/index.ts` 中导出。

| 文件 | 类型 | 行数 |
|------|------|------|
| `src/provider/stt-client.ts` | 新建 | +94 |
| `src/provider/__tests__/stt-client.test.ts` | 新建 | +189 |
| `src/provider/index.ts` | 修改 | +1 |

---

### 验收标准对照

- [x] **标准 1** — `SttClient` 类可实例化，构造函数接收 `ProviderConfig` ✅
  - 构造函数签名: `constructor(private config: ProviderConfig) {}`
  - 测试中 `new SttClient(config)` 正常实例化

- [x] **标准 2** — `transcribe()` 发送 POST 到 `{endpoint}/v1/audio/transcriptions` ✅
  - `apiUrl` getter: `${base}/v1/audio/transcriptions`
  - 测试断言 method 为 POST

- [x] **标准 3** — FormData 包含 `file` 和 `model` 字段 ✅
  - `formData.append('file', audioBlob, 'audio.webm')`
  - `formData.append('model', this.config.sttModel ?? this.config.model)`
  - 测试断言两个字段均存在

- [x] **标准 4** — 支持 `AbortSignal` 外部取消 ✅
  - `transcribe(audioBlob, externalSignal?)` 接收可选 AbortSignal
  - `createTimeoutSignal` 内部监听外部 signal 的 abort 事件
  - 测试覆盖外部 AbortController.abort() 场景

- [x] **标准 5** — 超时机制复用 `config.timeoutMs`，默认 120s ✅
  - `const timeoutMs = this.config.timeoutMs ?? 120_000`
  - 测试用 `vi.useFakeTimers` 验证超时

- [x] **标准 6** — HTTP 错误抛出含状态码的 Error（前缀 STT API）✅
  - `throw new Error(\`STT API 错误 ${response.status}: ${errorText}\`)`
  - 测试覆盖 400/500

- [x] **标准 7** — 单元测试覆盖全部场景 ✅
  - 成功返回文本、Authorization header、无 Content-Type、400/500 错误、超时、外部 AbortSignal、extraHeaders、sttModel 优先、checkHealth（200/401），共 11 个用例

- [x] **标准 8** — `src/provider/index.ts` 导出 `SttClient` ✅
  - `export { SttClient } from './stt-client';`

- [x] **标准 9** — 现有测试全部通过 ✅
  - PR body 声明 720 tests 全部通过

---

### 问题列表

#### [MEDIUM] 测试 fixture 中 endpoint 含 `/v1` 导致 URL 双写

- **文件**: `src/provider/__tests__/stt-client.test.ts:81`
- **问题**: `makeConfig` 设置 `endpoint: 'https://api.test.com/v1'`，而 `apiUrl` getter 追加 `/v1/audio/transcriptions`，导致最终 URL 为 `https://api.test.com/v1/v1/audio/transcriptions`。测试断言 `expect(url).toBe('https://api.test.com/v1/v1/audio/transcriptions')` 虽然与当前代码行为一致，但暴露了测试 fixture 与预期使用方式的偏差。

  如果项目约定 `endpoint` 不含 `/v1` 后缀（如 `https://api.openai.com`），则测试 fixture 应改为 `endpoint: 'https://api.test.com'`，期望 URL 为 `https://api.test.com/v1/audio/transcriptions`。当前写法容易误导后续维护者。

- **修复建议**:
  ```typescript
  // makeConfig 中去掉 /v1 后缀
  endpoint: 'https://api.test.com',
  ```
  然后修改断言：
  ```typescript
  expect(url).toBe('https://api.test.com/v1/audio/transcriptions');
  ```
  同理 `checkHealth` 测试中：
  ```typescript
  expect(fetchSpy.mock.calls[0]![0]).toBe('https://api.test.com/v1/models');
  ```

- **备注**: 此问题与 `LlmClient` 采用相同模式，属于历史遗留。不阻塞合入，但建议统一修正。

---

#### [MEDIUM] `checkHealth` 签名与 `LlmClient` 不一致

- **文件**: `src/provider/stt-client.ts:81`
- **问题**: `LlmClient.checkHealth(config: ProviderConfig)` 接收 config 参数（static 方法风格），而 `SttClient.checkHealth()` 无参数，直接使用 `this.config`。两者的调用方式不一致。
- **修复建议**: 统一为无参方式（更合理，因为已经是实例方法），或将 `LlmClient.checkHealth` 也改为无参。
- **风险**: 如果调用方按 `LlmClient` 的模式传参调用 `SttClient.checkHealth(config)`，TypeScript 会报错，但不会造成运行时问题（因为 `SttClient` 不需要参数）。

---

#### [MEDIUM] 缺少部分边界场景测试

- **文件**: `src/provider/__tests__/stt-client.test.ts`
- **问题**: 以下边界场景未覆盖：
  1. **网络错误**（如 DNS 解析失败、连接拒绝）— `fetch` 抛出 `TypeError`，`transcribe` 会因 `finally` 块中的 `clear()` 正常执行但错误不会带 `STT API` 前缀。当前无测试验证此行为。
  2. **response.json() 解析失败** — 如果 API 返回非 JSON 响应体（如 HTML 错误页），`response.json()` 会抛出，错误信息不会带 `STT API` 前缀。
  3. **`response.json()` 返回对象不含 `text` 字段** — `data.text` 为 `undefined`，函数返回 `undefined` 而非抛出错误。
  4. **`checkHealth` 超时场景** — `LlmClient.checkHealth` 和 `SttClient.checkHealth` 均有 10s 超时，但均未测试超时后的行为。
  5. **`apiKey` 为空/undefined 时 Authorization header 不存在** — 测试始终提供 apiKey，未验证无 apiKey 的场景。

- **修复建议**（非阻塞，可后续补充）:
  ```typescript
  // 网络错误
  it('should propagate fetch network errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(client.transcribe(makeAudioBlob())).rejects.toThrow('Failed to fetch');
  });

  // 响应不含 text 字段
  it('should throw if response has no text field', async () => {
    mockFetchOk({ no_text: true });
    await expect(client.transcribe(makeAudioBlob())).rejects.toThrow();
  });

  // checkHealth 超时
  it('should return false on timeout', async () => {
    vi.useFakeTimers();
    mockFetchPending();
    const promise = client.checkHealth();
    vi.advanceTimersByTime(10_000);
    await expect(promise).resolves.toBe(false);
    vi.useRealTimers();
  });
  ```

---

#### [LOW] `createTimeoutSignal` 在 `LlmClient` 与 `SttClient` 中完全重复

- **文件**: `src/provider/stt-client.ts:23-47`, `src/provider/llm-client.ts:155-181`
- **问题**: 两个类中的 `createTimeoutSignal` 方法完全一致。Issue #95 的设计说明中明确允许"直接复制，避免循环依赖"，因此这属于已知取舍。
- **建议**: 后续可将 `createTimeoutSignal` 抽取到 `src/shared/` 下的工具函数，消除重复。当前不阻塞。

---

#### [LOW] `checkHealth` 未复用 `createTimeoutSignal`

- **文件**: `src/provider/stt-client.ts:81-97`
- **问题**: `checkHealth` 手动创建 `AbortController` 和 `setTimeout`，而非调用 `this.createTimeoutSignal()`。`LlmClient` 也存在相同模式。
- **建议**: 后续可让 `checkHealth` 复用 `createTimeoutSignal()`，减少重复的超时处理逻辑。

---

### 代码质量评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 安全性 | ✅ 通过 | 无硬编码密钥、无注入风险、无路径遍历 |
| 错误处理 | ✅ 良好 | HTTP 错误、超时、AbortSignal 均有处理，finally 确保清理 |
| 测试覆盖 | ⚠️ 良好 | 核心场景全覆盖，边界场景有遗漏 |
| 代码一致性 | ⚠️ 基本一致 | 与 LlmClient 模式一致，checkHealth 签名有小差异 |
| 可维护性 | ✅ 良好 | 代码简洁，无过度抽象 |

---

### 审查结论

**结论: 有条件通过（Approve with Comments）**

- 无 Critical/High 级别问题
- 3 个 MEDIUM 问题：测试 fixture URL 双写、checkHealth 签名不一致、边界测试缺失
- 2 个 LOW 问题：createTimeoutSignal 重复、checkHealth 未复用超时工具
- 所有 MEDIUM 问题均属于历史遗留或测试增强，不阻塞合入
- 核心功能实现正确，与 Issue #95 验收标准完全匹配

**建议**: 合入后创建 follow-up issue，统一修正 `endpoint` 配置约定和 `checkHealth` 签名不一致问题。
