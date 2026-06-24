# 技术方案: Voice Input Mode

**日期:** 2026-06-24
**状态:** Draft

## 1. 技术栈

| 层级 | 技术选型 | 理由 |
|------|---------|------|
| 前端 | React 18 + TypeScript + Tailwind CSS v4 | 复用现有技术栈 |
| 音频采集 | 浏览器原生 MediaRecorder API | 零依赖，Chrome 47+/Firefox 88+ 均支持 |
| STT 请求 | fetch + multipart/form-data | 复用现有 LlmClient 的 headers/超时模式 |
| 状态管理 | React hooks (useRef + useState) | 单组件内状态，无需全局状态 |
| 存储 | chrome.storage.local（复用 ConfigStore） | sttModel 作为 ProviderConfig 字段持久化 |

## 2. 架构设计

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────┐
│  sidepanel (React)                                       │
│                                                          │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Settings │    │ MessageInput │    │ useVoiceInput │  │
│  │ Panel    │    │              │    │   (hook)      │  │
│  │          │    │ ┌──────────┐ │    │               │  │
│  │ sttModel │    │ │MicButton │─┼────┤ start/stop/   │  │
│  │ 输入框   │    │ └──────────┘ │    │ cancel        │  │
│  └──────────┘    │              │    │               │  │
│                  │ textarea ←───┼────┤ onTranscribed │  │
│                  └──────────────┘    │               │  │
│                                      │ getUserMedia  │  │
│                                      │ MediaRecorder │  │
│                                      └───────┬───────┘  │
│                                              │          │
│                      ┌───────────────────────┘          │
│                      ▼                                  │
│              ┌──────────────┐                           │
│              │  SttClient   │                           │
│              │  (provider/) │                           │
│              └──────┬───────┘                           │
└─────────────────────┼──────────────────────────────────┘
                      │ POST /v1/audio/transcriptions
                      │ multipart/form-data
                      ▼
              ┌──────────────┐
              │ OpenAI 兼容   │
              │ STT 端点      │
              └──────────────┘
```

### 2.2 数据流向

```
用户点击麦克风
    │
    ▼
useVoiceInput.startRecording()
    │
    ├─ navigator.mediaDevices.getUserMedia({ audio: true })
    ├─ new MediaRecorder(stream)
    ├─ 收集 chunks 到数组
    │
    ▼
用户再次点击（或取消）
    │
    ▼
useVoiceInput.stopRecording()
    │
    ├─ recorder.stop() → ondataavailable 产生 blob
    ├─ new SttClient(providerConfig).transcribe(blob)
    │
    ▼
POST /v1/audio/transcriptions
    │
    ├─ 成功 → onTranscribed(text) → MessageInput.setText(text)
    └─ 失败 → setError(msg) → UI 显示错误提示
```

### 2.3 模块划分

| 模块 | 文件 | 职责 |
|------|------|------|
| SttClient | `src/provider/stt-client.ts` | 封装 `/v1/audio/transcriptions` 请求 |
| useVoiceInput | `src/entrypoints/sidepanel/hooks/useVoiceInput.ts` | 录音生命周期管理、STT 调用编排 |
| MessageInput（改造） | `src/entrypoints/sidepanel/components/MessageInput.tsx` | 集成麦克风按钮和语音状态展示 |
| SettingsPanel（改造） | `src/entrypoints/sidepanel/components/SettingsPanel.tsx` | Provider 表单增加 sttModel 字段 |
| 类型扩展 | `src/shared/types/llm.ts` | ProviderConfig 增加 sttModel 可选字段 |
| UI 类型扩展 | `src/entrypoints/sidepanel/types.ts` | ProviderFormData 增加 sttModel 字段 |

## 3. 接口设计

### 3.1 SttClient

```typescript
// src/provider/stt-client.ts

export class SttClient {
  constructor(private config: ProviderConfig) {}

  /**
   * 将音频 Blob 发送到 STT 端点转写为文本
   * @param audioBlob 音频数据（webm 格式）
   * @param externalSignal 外部 AbortSignal（用于取消请求）
   * @returns 转写文本
   * @throws 网络错误、鉴权失败、格式不支持等
   */
  async transcribe(audioBlob: Blob, externalSignal?: AbortSignal): Promise<string>;

  /** 检查 Provider 的 STT 端点是否可用 */
  async checkHealth(): Promise<boolean>;
}
```

**HTTP 请求格式：**

```
POST {endpoint}/v1/audio/transcriptions
Content-Type: multipart/form-data

file: <audioBlob>       (field name: "file")
model: {sttModel}       (field name: "model")
```

**请求头：**
```
Authorization: Bearer {apiKey}
(复用 ProviderConfig 的 extraHeaders)
```

**响应格式（OpenAI 兼容）：**
```json
{
  "text": "转写后的文本内容"
}
```

### 3.2 useVoiceInput Hook

```typescript
// src/entrypoints/sidepanel/hooks/useVoiceInput.ts

/** 语音输入状态 */
export type VoiceState =
  | 'idle'           // 初始/就绪
  | 'requesting'     // 请求麦克风权限中
  | 'recording'      // 录音中
  | 'transcribing'   // 转录中
  | 'error';         // 错误

export interface UseVoiceInputOptions {
  /** 已配置的 Provider 列表（用于查找有 sttModel 的 Provider） */
  providers: ProviderConfig[];
  /** 转录成功回调 */
  onTranscribed: (text: string) => void;
}

export interface UseVoiceInputReturn {
  /** 当前状态 */
  voiceState: VoiceState;
  /** 错误消息（voiceState === 'error' 时有值） */
  errorMessage: string | null;
  /** 是否可用（至少一个 Provider 配置了 sttModel） */
  voiceAvailable: boolean;
  /** 开始录音 */
  startRecording: () => Promise<void>;
  /** 停止录音并开始转录 */
  stopRecording: () => void;
  /** 取消录音（不转录） */
  cancelRecording: () => void;
  /** 清除错误状态 */
  clearError: () => void;
}
```

**内部状态机：**

```
idle ──startRecording()──▶ requesting ──getUserMedia成功──▶ recording
 │                           │                                 │
 │                           │ getUserMedia失败                 ├──stopRecording()──▶ transcribing
 │                           ▼                                 │                      │
 │                         error                               │                      ├──成功──▶ idle
 │                         (权限拒绝)                           │                      │
 │                                                             │                      └──失败──▶ error
 │                                                             │
 │                                                             └──cancelRecording()──▶ idle
 │                                                                                     (释放 stream)
 │
 ├──clearError()──▶ idle
 │
 └──startRecording() (从 error)──▶ requesting
```

**Provider 选择策略：**
- 遍历 `providers` 数组，找到第一个 `sttModel` 不为空的 Provider
- 若 providers 变化导致当前选中 Provider 的 sttModel 被清空，重新选择

### 3.3 类型扩展

#### ProviderConfig（src/shared/types/llm.ts）

```typescript
export interface ProviderConfig {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  isLocalTrusted: boolean;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
  isDefault?: boolean;
  /** STT 语音识别模型（可选，如 whisper-1），不填则不支持语音功能 */
  sttModel?: string;   // ← 新增
}
```

#### ProviderFormData（src/entrypoints/sidepanel/types.ts）

```typescript
export interface ProviderFormData {
  id?: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  isLocalTrusted: boolean;
  sttModel?: string;   // ← 新增
}
```

### 3.4 MessageInput Props 扩展

```typescript
interface Props {
  onSend: (text: string) => void;
  onAbort: () => void;
  disabled: boolean;
  isRunning: boolean;
  /** Provider 列表（用于语音功能） */      // ← 新增
  providers: ProviderConfig[];             // ← 新增
}
```

## 4. 关键决策

| 决策 | 方案 | 备选 | 理由 |
|------|------|------|------|
| STT 客户端位置 | `src/provider/stt-client.ts`，与 `llm-client.ts` 同级 | 放在 sidepanel 内 | 复用 provider 目录的定位（外部 API 客户端层），与 LlmClient 模式一致 |
| Provider 选择 | 选取第一个 `sttModel` 不为空的 Provider | 让用户选择 | KISS：绝大多数场景只有一个 Provider |
| 音频格式 | `audio/webm` | `audio/wav` | Chrome/Firefox 原生支持，OpenAI API 支持，无需转码 |
| 录音状态管理 | `useVoiceInput` hook 内部管理 | 提到 ChatContext | 状态仅在 MessageInput 内使用，无需全局共享 |
| 权限错误处理 | 捕获 `NotAllowedError` 给出中文提示 | 静默失败 | 用户需要知道为什么麦克风不工作 |
| 取消录音 | 直接丢弃 blob，不调用 API | 无 | 符合 PRD "取消不转录" 要求 |
| 超时设置 | 复用 `ProviderConfig.timeoutMs`，默认 120s | 硬编码固定值 | 与 LlmClient 一致，用户可配置 |

## 5. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| getUserMedia 在扩展页面中不可用 | 语音功能完全不可用 | 低 | 已知 sidepanel 在普通标签页中打开，getUserMedia 可用；若不可用，voiceAvailable 返回 false |
| 用户拒绝麦克风权限 | 录音无法启动 | 中 | 捕获 NotAllowedError，展示引导文字 |
| 音频过大导致请求超时 | 转录失败 | 低 | 用户手动控制录音时长，后续迭代可加上限 |
| STT 端点不支持 webm 格式 | 转录失败 | 低 | OpenAI 和大多数兼容端点支持 webm；错误信息中包含格式提示 |
| 扩展更新后 ProviderConfig 缺少 sttModel 字段 | 旧数据兼容 | 中 | sttModel 为可选字段，旧数据自动兼容（undefined 视为未配置） |
| 多个 Provider 配置了 sttModel，选错 | 使用非预期端点 | 低 | 始终选第一个；若需切换，后续迭代在 UI 中增加选择器 |

## 6. 非功能需求实现方案

- **性能**：录音到转录完成应在 5 秒内（不含用户说话时长）。SttClient 复用 LlmClient 的超时机制（createTimeoutSignal），默认 120s 对语音足够。
- **安全**：API Key 仅在 SttClient 内部使用，不打印到 console；音频 Blob 在 useVoiceInput 的 useRef 中暂存，组件卸载或新录音开始时自动释放；不写入任何持久化存储。
- **可用性**：
  - 录音中：按钮显示红色脉冲动画 + "录音中..." 文案
  - 转录中：按钮显示加载动画 + "识别中..." 文案
  - 录音/转录过程中 textarea 不禁用，用户可继续手动输入
  - 未配置 sttModel 时：按钮显示灰色禁用态，hover 提示"请先在设置中配置 STT 模型"
- **隐私**：仅在用户主动点击按钮时调用 `getUserMedia`，MediaRecorder 的 `start()` 由用户第二次点击触发；`cancelRecording()` 立即释放 MediaStream。
- **兼容性**：`MediaRecorder` 和 `getUserMedia` 在 Chrome 47+ / Firefox 88+ 均有完整支持，无需 polyfill。

## 7. 实施计划

### 子任务拆分

| # | 子任务 | 涉及文件 | 预估复杂度 | 依赖 |
|---|--------|---------|-----------|------|
| 1 | 扩展 ProviderConfig / ProviderFormData 增加 sttModel 字段 | `llm.ts`, `types.ts` | 低 | 无 |
| 2 | 实现 SttClient | `src/provider/stt-client.ts`（新建） | 中 | #1 |
| 3 | SettingsPanel 增加 STT 模型输入框 | `SettingsPanel.tsx` | 低 | #1 |
| 4 | 实现 useVoiceInput hook | `src/entrypoints/sidepanel/hooks/useVoiceInput.ts`（新建） | 中 | #1, #2 |
| 5 | MessageInput 集成麦克风按钮 | `MessageInput.tsx`, `App.tsx` | 中 | #4 |
| 6 | 编写测试 | `__tests__/` 对应文件 | 中 | #2, #4, #5 |

### 执行顺序

```
#1 (类型扩展) ──┬──▶ #2 (SttClient) ──┬──▶ #4 (useVoiceInput) ──▶ #5 (MessageInput)
               │                      │
               └──▶ #3 (SettingsPanel) │
                                      │
                                      └──▶ #6 (测试)
```

### 各子任务验收标准

**#1 类型扩展**
- [ ] `ProviderConfig` 有 `sttModel?: string` 字段
- [ ] `ProviderFormData` 有 `sttModel?: string` 字段
- [ ] 编译通过，现有测试通过

**#2 SttClient**
- [ ] `transcribe(blob)` 发送正确的 multipart/form-data 请求
- [ ] 请求 URL 为 `{endpoint}/v1/audio/transcriptions`
- [ ] 请求头包含 `Authorization: Bearer {apiKey}`
- [ ] 成功返回 `{ text: "..." }` 中的 text
- [ ] 非 2xx 响应抛出含状态码的错误
- [ ] 支持 AbortSignal 取消请求
- [ ] 单元测试覆盖：成功、失败、超时

**#3 SettingsPanel**
- [ ] Provider 编辑表单有"STT 模型"输入框
- [ ] 占位符为"STT 模型 (如 whisper-1)，可选"
- [ ] 保存时 sttModel 持久化到 chrome.storage.local
- [ ] 编辑已有 Provider 时 sttModel 正确回显

**#4 useVoiceInput**
- [ ] `voiceAvailable` 在无 Provider 配置 sttModel 时返回 false
- [ ] `startRecording()` 请求麦克风权限，状态变为 `requesting` → `recording`
- [ ] `stopRecording()` 停止录音，状态变为 `transcribing`，调用 SttClient
- [ ] `cancelRecording()` 丢弃录音，释放 stream，状态回到 `idle`
- [ ] 转录成功调用 `onTranscribed(text)`
- [ ] 转录失败状态变为 `error`，`errorMessage` 有值
- [ ] `clearError()` 重置到 `idle`
- [ ] 权限拒绝时状态变为 `error`，有中文提示

**#5 MessageInput**
- [ ] `providers` 有 sttModel 时显示可点击麦克风按钮
- [ ] `providers` 无 sttModel 时显示禁用麦克风按钮
- [ ] 录音中按钮有视觉反馈（红色脉冲）
- [ ] 转录中按钮有加载状态
- [ ] 转录完成后文本填入 textarea，光标聚焦
- [ ] 录音/转录过程中 textarea 不禁用
- [ ] 错误提示在输入框附近展示，可关闭
- [ ] 现有 MessageInput 测试全部通过

**#6 测试**
- [ ] SttClient 单元测试：mock fetch，验证请求格式
- [ ] useVoiceInput 测试：mock MediaRecorder 和 getUserMedia
- [ ] MessageInput 测试：语音按钮交互

## 8. 文件清单

| 操作 | 文件路径 |
|------|---------|
| 修改 | `src/shared/types/llm.ts` — ProviderConfig 加 sttModel |
| 修改 | `src/entrypoints/sidepanel/types.ts` — ProviderFormData 加 sttModel |
| 新建 | `src/provider/stt-client.ts` — SttClient 类 |
| 新建 | `src/provider/__tests__/stt-client.test.ts` — SttClient 测试 |
| 修改 | `src/provider/index.ts` — 导出 SttClient |
| 新建 | `src/entrypoints/sidepanel/hooks/useVoiceInput.ts` — 录音 hook |
| 新建 | `src/entrypoints/sidepanel/hooks/__tests__/useVoiceInput.test.ts` — hook 测试 |
| 修改 | `src/entrypoints/sidepanel/components/MessageInput.tsx` — 集成麦克风按钮 |
| 修改 | `src/entrypoints/sidepanel/components/SettingsPanel.tsx` — 加 sttModel 输入框 |
| 修改 | `src/entrypoints/sidepanel/App.tsx` — MessageInput 传 providers |
| 修改 | `src/entrypoints/sidepanel/__tests__/MessageInput.test.tsx` — 补充语音测试 |

**共计：11 个文件（3 新建，8 修改）**

## 9. 未决假设

1. **STT 端点兼容性**：假设用户使用的 OpenAI 兼容端点完全支持 `/v1/audio/transcriptions`，且接受 `audio/webm` 格式。若端点返回格式不支持错误，当前方案仅显示通用错误信息，不做格式回退。
2. **MediaRecorder 可用性**：假设 sidepanel 在普通标签页中打开（`browser.tabs.create`），`getUserMedia` 可正常调用。若未来改为 Chrome Side Panel API，需要确认权限模型。
3. **单 Provider**：MVP 选择第一个配置了 sttModel 的 Provider。若需要支持切换，后续迭代可在 UI 中增加下拉选择。
4. **无录音时长限制**：MVP 不做时长上限，由用户手动控制。若需防止过长录音，后续迭代增加可配置上限。
