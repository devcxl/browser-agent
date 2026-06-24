# 开发文档: T4 - 实现 useVoiceInput hook（录音+转写编排）

**Project:** voice-input-mode
**Task ID:** T4
**Slug:** use-voice-input-hook
**Issue:** #97
**类型:** frontend
**Batch:** 3
**依赖:** T1 (#94), T2 (#95)

## 1. 目标

实现 `useVoiceInput` hook，封装完整的浏览器端录音 → 语音转文字（STT）生命周期。hook 管理麦克风权限请求、MediaRecorder 录音、SttClient 转写调用，通过状态机对外暴露可预测的状态和操作方法。

## 2. 前置条件

- [x] T1 完成 — `ProviderConfig.sttModel?: string` 和 `ProviderFormData.sttModel?: string` 已就绪
- [x] T2 完成 — `SttClient` 类已实现并可从 `@/provider` 导入，提供 `transcribe(audioBlob, externalSignal?)` 和 `checkHealth()`
- 当前 `src/provider/index.ts` 仅导出 `LlmClient`，本任务需要新增 `SttClient` 的导出（若 T2 未处理，此处需一并修改）

### 关键现有代码参考

| 文件 | 用途 |
|------|------|
| `src/provider/llm-client.ts` | LlmClient 的 `createTimeoutSignal` 模式，SttClient 参考实现 |
| `src/provider/index.ts` | Provider 模块导出入口，需新增 `SttClient` 导出 |
| `src/entrypoints/sidepanel/hooks/useAgent.ts` | 现有 hook 实现模式（useRef 持有实例、useCallback 封装方法） |
| `src/entrypoints/sidepanel/hooks/useBrowserState.ts` | 简单 hook 模式（useState + useRef + useCallback） |
| `src/entrypoints/sidepanel/hooks/__tests__/useAgent.test.ts` | 测试模式（renderHook + act + vi.mock 模块 mock） |
| `src/entrypoints/sidepanel/utils.ts` | 包含 `uid()` 等工具函数 |

## 3. 实现步骤

### 3.1 确保 SttClient 可从 `@/provider` 导入

**文件：** `src/provider/index.ts`

若 T2 未处理导出，增加一行：
```typescript
export { SttClient } from './stt-client';
```

验证：`import { SttClient } from '@/provider'` 类型检查通过。

### 3.2 实现 useVoiceInput hook

**文件：** `src/entrypoints/sidepanel/hooks/useVoiceInput.ts`（新建）

#### 3.2.1 类型定义

```typescript
/** 语音输入状态 */
export type VoiceState =
  | 'idle'           // 初始/就绪
  | 'requesting'     // 请求麦克风权限中
  | 'recording'      // 录音中
  | 'transcribing'   // 转录中（SttClient 请求中）
  | 'error';         // 错误

export interface UseVoiceInputOptions {
  /** 已配置的 Provider 列表（用于查找有 sttModel 的 Provider） */
  providers: ProviderConfig[];
  /** 转录成功回调 */
  onTranscribed: (text: string) => void;
}

export interface UseVoiceInputReturn {
  voiceState: VoiceState;
  errorMessage: string | null;
  voiceAvailable: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  clearError: () => void;
}
```

#### 3.2.2 核心状态与 Ref

```typescript
const [voiceState, setVoiceState] = useState<VoiceState>('idle');
const [errorMessage, setErrorMessage] = useState<string | null>(null);
const streamRef = useRef<MediaStream | null>(null);
const recorderRef = useRef<MediaRecorder | null>(null);
const chunksRef = useRef<Blob[]>([]);
const selectedProviderRef = useRef<ProviderConfig | null>(null);
const onTranscribedRef = useRef(onTranscribed);
```

- `streamRef` — 持有 `getUserMedia` 返回的 `MediaStream`，在 `cancelRecording` 和组件卸载时释放
- `recorderRef` — 持有 `MediaRecorder` 实例，用于 `stop()` 控制
- `chunksRef` — 收集 `ondataavailable` 事件的音频数据片段
- `selectedProviderRef` — 缓存当前选中的 Provider，避免 providers 变化时状态不一致
- `onTranscribedRef` — 保持回调引用最新，避免 useEffect 依赖问题

#### 3.2.3 voiceAvailable 计算

```typescript
const voiceAvailable = useMemo(() => {
  return typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices !== 'undefined'
    && typeof navigator.mediaDevices.getUserMedia === 'function'
    && providers.some(p => p.sttModel);
}, [providers]);
```

同时检查 `navigator.mediaDevices` 可用性和至少一个 Provider 配置了 `sttModel`。

#### 3.2.4 查找选中 Provider

```typescript
function selectProvider(providers: ProviderConfig[]): ProviderConfig | null {
  return providers.find(p => p.sttModel) ?? null;
}
```

**选择策略：** 遍历 `providers` 数组，找到第一个 `sttModel` 不为空的 Provider。若找不到返回 `null`。

#### 3.2.5 释放资源

```typescript
function releaseStream() {
  if (streamRef.current) {
    streamRef.current.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }
  recorderRef.current = null;
  chunksRef.current = [];
}
```

- 停止所有 MediaStreamTrack
- 清空 recorder 和 chunks 引用
- 在 `cancelRecording`、转录完成、组件卸载时调用

#### 3.2.6 startRecording

```typescript
const startRecording = useCallback(async () => {
  // 1. 清理上一次可能的残留
  releaseStream();
  setErrorMessage(null);

  // 2. 选择 Provider
  const provider = selectProvider(providers);
  if (!provider) {
    setErrorMessage('未配置语音模型，请在设置中为 Provider 添加 sttModel');
    setVoiceState('error');
    return;
  }
  selectedProviderRef.current = provider;

  // 3. 请求麦克风权限
  setVoiceState('requesting');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    // 4. 创建 MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/webm;codecs=opus';
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      // onstop 在 stopRecording/cancelRecording 中处理
      // 此处置空，实际逻辑在 stopRecording 和 cancelRecording 中
    };

    recorder.start();
    setVoiceState('recording');
  } catch (err) {
    releaseStream();
    const error = err as DOMException;
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      setErrorMessage('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
    } else if (error.name === 'NotFoundError') {
      setErrorMessage('未检测到麦克风设备');
    } else {
      setErrorMessage(`无法启动录音: ${error.message}`);
    }
    setVoiceState('error');
  }
}, [providers]);
```

**关键逻辑：**
1. 每次调用先清理上次残留（`releaseStream()`）
2. 找不到 sttModel Provider → 直接进入 `error` 状态，不请求权限
3. `requesting` 状态下调用 `getUserMedia`，失败根据 `DOMException.name` 分类设置中文错误消息
4. MIME type 优先 `audio/webm`，回退 `audio/webm;codecs=opus`
5. `ondataavailable` 收集非空数据块
6. `onstop` 不在此时绑定逻辑——由 `stopRecording` 和 `cancelRecording` 通过 Promise 控制

#### 3.2.7 stopRecording

```typescript
const stopRecording = useCallback(() => {
  const recorder = recorderRef.current;
  if (!recorder || recorder.state !== 'recording') return;

  setVoiceState('transcribing');

  // 覆盖 onstop 为转写逻辑
  recorder.onstop = async () => {
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
    const provider = selectedProviderRef.current;

    if (!provider) {
      setErrorMessage('Provider 配置丢失');
      setVoiceState('error');
      releaseStream();
      return;
    }

    try {
      const client = new SttClient(provider);
      const text = await client.transcribe(blob);
      onTranscribedRef.current(text);
      setVoiceState('idle');
    } catch (err) {
      setErrorMessage(`语音识别失败: ${(err as Error).message}`);
      setVoiceState('error');
    } finally {
      releaseStream();
    }
  };

  recorder.stop();
}, []);
```

**关键逻辑：**
1. 防护：`recorder.state !== 'recording'` 时直接返回（避免重复调用）
2. 状态切换到 `transcribing`
3. 动态设置 `onstop` — 合并所有 chunks 为 Blob，调用 `SttClient.transcribe`
4. 成功 → 调用 `onTranscribed(text)` → `idle`
5. 失败 → 设置 `errorMessage` → `error`
6. `finally` 中调用 `releaseStream()` 释放资源

#### 3.2.8 cancelRecording

```typescript
const cancelRecording = useCallback(() => {
  const recorder = recorderRef.current;
  if (!recorder || recorder.state !== 'recording') return;

  // 覆盖 onstop 为空操作（不触发转写）
  recorder.onstop = () => {
    releaseStream();
    setVoiceState('idle');
  };

  recorder.stop();
}, []);
```

**关键逻辑：**
1. 同样防护 `recorder.state !== 'recording'`
2. `onstop` 仅释放资源并回到 `idle`，不调用 `SttClient`
3. 必须调用 `recorder.stop()` 触发 `onstop`，否则 stream 不会被释放

#### 3.2.9 clearError

```typescript
const clearError = useCallback(() => {
  setErrorMessage(null);
  setVoiceState('idle');
}, []);
```

仅在 `voiceState === 'error'` 时调用有意义，但也允许从其他状态调用（安全重置）。

#### 3.2.10 组件卸载清理

```typescript
useEffect(() => {
  return () => {
    // 组件卸载时释放所有资源
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      // 录音中卸载：停止 recorder 但不触发转写
      recorderRef.current.onstop = () => {};
      recorderRef.current.stop();
    }
    releaseStream();
  };
}, []);
```

**注意：** 使用空依赖数组 `[]`，仅在组件卸载时执行一次。`releaseStream()` 是幂等的（内部有 null 检查）。

#### 3.2.11 onTranscribed 回调同步

```typescript
// 保持 onTranscribed 回调引用最新
useEffect(() => {
  onTranscribedRef.current = onTranscribed;
}, [onTranscribed]);
```

避免 `startRecording` 的 `useCallback` 因 `onTranscribed` 变化而重建。

#### 3.2.12 返回值

```typescript
return {
  voiceState,
  errorMessage,
  voiceAvailable,
  startRecording,
  stopRecording,
  cancelRecording,
  clearError,
};
```

### 3.3 完整状态机流程

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  idle ──startRecording()──▶ requesting ──getUserMedia✅──▶ recording
│   ▲                           │                                   │
│   │                           │ getUserMedia❌                     │
│   │                           ▼                                   │
│   │                         error                                 │
│   │                         (权限/设备)                            │
│   │                                                                │
│   │                         recording                             │
│   │                           │                                   │
│   │          ┌────────────────┼────────────────┐                  │
│   │          │                │                │                  │
│   │   stopRecording()  cancelRecording()  组件卸载                 │
│   │          │                │                │                  │
│   │          ▼                ▼                ▼                  │
│   │    transcribing         idle             (静默清理)            │
│   │          │                ▲                                   │
│   │   ┌──────┴──────┐         │                                   │
│   │   │             │         │                                   │
│   │   ✅成功        ❌失败     │                                   │
│   │   │             │         │                                   │
│   │   ▼             ▼         │                                   │
│   │  idle          error      │                                   │
│   │                 │         │                                   │
│   │          clearError()     │                                   │
│   │                 │         │                                   │
│   │                 ▼         │                                   │
│   └──────────────── idle ─────┘                                   │
│                                                                  │
│  error ──startRecording()──▶ requesting (重新尝试)                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.4 编写单元测试

**文件：** `src/entrypoints/sidepanel/hooks/__tests__/useVoiceInput.test.ts`（新建）

参考 `useAgent.test.ts` 的测试模式：
- `vitest` + `@testing-library/react` 的 `renderHook` + `act`
- `vi.mock()` 模拟外部依赖
- `beforeEach` 中重置 mock

#### 3.4.1 Mock 策略

```typescript
// Mock SttClient
const mockTranscribe = vi.fn();
vi.mock('@/provider', () => ({
  SttClient: vi.fn().mockImplementation(() => ({
    transcribe: mockTranscribe,
  })),
  LlmClient: vi.fn(),
}));

// Mock navigator.mediaDevices.getUserMedia
const mockGetUserMedia = vi.fn();
Object.defineProperty(navigator, 'mediaDevices', {
  value: { getUserMedia: mockGetUserMedia },
  writable: true,
  configurable: true,
});

// Mock MediaRecorder
class MockMediaRecorder {
  state: string = 'inactive';
  mimeType: string = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  stream: MediaStream;

  static isTypeSupported = vi.fn().mockReturnValue(true);

  constructor(stream: MediaStream, _options?: MediaRecorderOptions) {
    this.stream = stream;
  }

  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    // 模拟 ondataavailable
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['mock-audio']) });
    }
    // 异步触发 onstop（模拟真实行为）
    setTimeout(() => {
      this.onstop?.();
    }, 0);
  }
}

(globalThis as any).MediaRecorder = MockMediaRecorder;
```

#### 3.4.2 测试用例清单

| # | 测试用例 | 输入 | 预期 |
|---|---------|------|------|
| 1 | 初始状态 | hook 初始化 | `voiceState === 'idle'`, `errorMessage === null` |
| 2 | voiceAvailable = true | `navigator.mediaDevices` 可用 + provider 有 sttModel | `voiceAvailable === true` |
| 3 | voiceAvailable = false (无 mediaDevices) | `navigator.mediaDevices` 为 undefined | `voiceAvailable === false` |
| 4 | voiceAvailable = false (无 sttModel) | providers 中没有 sttModel | `voiceAvailable === false` |
| 5 | startRecording 无 sttModel Provider | providers 均为空 sttModel | 状态 → `error`，`errorMessage` 包含 "未配置语音模型" |
| 6 | startRecording 正常流程 | provider 有 sttModel，getUserMedia 成功 | 状态流转 `idle → requesting → recording` |
| 7 | startRecording 权限拒绝 | getUserMedia 抛出 `NotAllowedError` | 状态 → `error`，`errorMessage` 包含 "麦克风权限被拒绝" |
| 8 | startRecording 无设备 | getUserMedia 抛出 `NotFoundError` | 状态 → `error`，`errorMessage` 包含 "未检测到麦克风" |
| 9 | startRecording 其他错误 | getUserMedia 抛出通用 Error | 状态 → `error`，`errorMessage` 包含 "无法启动录音" |
| 10 | stopRecording 转写成功 | recorder 在 recording 状态，SttClient 返回文本 | 状态 `recording → transcribing → idle`，`onTranscribed` 被调用 |
| 11 | stopRecording 转写失败 | recorder 在 recording 状态，SttClient 抛出错误 | 状态 `recording → transcribing → error`，`errorMessage` 有值 |
| 12 | stopRecording 非 recording 状态 | recorder 不在 recording 状态 | 无操作，不抛异常 |
| 13 | cancelRecording | recorder 在 recording 状态 | 状态 → `idle`，`onTranscribed` 不被调用，stream tracks 被释放 |
| 14 | cancelRecording 非 recording 状态 | recorder 不在 recording 状态 | 无操作，不抛异常 |
| 15 | clearError | 当前状态为 `error` | 状态 → `idle`，`errorMessage → null` |
| 16 | clearError 非 error 状态 | 当前状态为 `idle` | 状态仍为 `idle`，无副作用 |
| 17 | 从 error 状态重新 startRecording | 在 error 状态调用 startRecording | 先清除错误，再走正常流程 `requesting → recording` |
| 18 | 组件卸载时释放资源 | hook 卸载时 recorder 正在 recording | stream tracks 被释放，不触发转写 |
| 19 | stopRecording 时 provider 丢失 | selectedProviderRef 为 null | 状态 → `error`，`errorMessage` 包含 "Provider 配置丢失" |
| 20 | providers 变化时 voiceAvailable 更新 | providers 从有 sttModel 变为无 | `voiceAvailable` 从 `true` 变为 `false` |

#### 3.4.3 测试实现关键点

**用例 10（转写成功）的完整流程：**

```typescript
it('stopRecording 后调用 SttClient.transcribe 并回调 onTranscribed', async () => {
  mockTranscribe.mockResolvedValue('你好世界');
  mockGetUserMedia.mockResolvedValue(new MockMediaStream());
  const onTranscribed = vi.fn();

  const { result } = renderHook(() =>
    useVoiceInput({ providers: [providerWithSttModel], onTranscribed })
  );

  // 开始录音
  await act(async () => {
    await result.current.startRecording();
  });
  expect(result.current.voiceState).toBe('recording');

  // 停止录音 → 触发 onstop
  await act(async () => {
    result.current.stopRecording();
  });

  // 等待 onstop 异步回调完成
  await vi.waitFor(() => {
    expect(result.current.voiceState).toBe('idle');
  });

  expect(mockTranscribe).toHaveBeenCalledTimes(1);
  expect(onTranscribed).toHaveBeenCalledWith('你好世界');
});
```

**注意：** `MediaRecorder.onstop` 通过 `setTimeout(0)` 异步触发，测试中需要使用 `vi.waitFor` 或 `waitFor` 等待状态变化。

## 4. 接口/契约

### 4.1 Hook 接口

| 方法/属性 | 类型 | 说明 |
|-----------|------|------|
| `voiceState` | `VoiceState` | 当前状态：`idle` / `requesting` / `recording` / `transcribing` / `error` |
| `errorMessage` | `string \| null` | 错误消息，仅在 `voiceState === 'error'` 时有值 |
| `voiceAvailable` | `boolean` | 语音功能是否可用（mediaDevices 存在 + 至少一个 Provider 有 sttModel） |
| `startRecording()` | `() => Promise<void>` | 开始录音，返回 Promise 在权限请求完成或失败后 resolve |
| `stopRecording()` | `() => void` | 停止录音并开始转录，同步返回 |
| `cancelRecording()` | `() => void` | 取消录音（丢弃音频数据），同步返回 |
| `clearError()` | `() => void` | 清除错误状态回到 idle |

### 4.2 数据模型变更

无。`useVoiceInput` 是纯运行时 hook，不涉及持久化存储。

### 4.3 依赖接口

```typescript
// SttClient (from @/provider)
class SttClient {
  constructor(config: ProviderConfig);
  transcribe(audioBlob: Blob, externalSignal?: AbortSignal): Promise<string>;
}

// ProviderConfig (from @/shared/types)
interface ProviderConfig {
  // ... existing fields
  sttModel?: string;  // STT 模型名称（如 whisper-1）
}
```

## 5. 测试指引

### 5.1 运行测试

```bash
# 仅运行 useVoiceInput 测试
npx vitest run src/entrypoints/sidepanel/hooks/__tests__/useVoiceInput.test.ts

# 运行全部测试确保无回归
npx vitest run
```

### 5.2 测试覆盖目标

- 所有状态转换路径（idle → requesting → recording → transcribing → idle/error）
- 所有异常路径（权限拒绝、无设备、无 sttModel、转写失败、Provider 丢失）
- 资源清理（cancelRecording、组件卸载）
- voiceAvailable 的 3 种情况
- clearError 从 error 和其他状态调用

### 5.3 手动验证

由于 `MediaRecorder` 在 jsdom 中需要 mock，建议在真实浏览器环境中额外验证：

1. 打开 sidepanel，确保至少一个 Provider 配置了 `sttModel`
2. 调用 `startRecording()` → 浏览器应弹出麦克风权限请求
3. 允许权限 → 状态变为 `recording`
4. 等待几秒 → 调用 `stopRecording()` → 状态变为 `transcribing` → 完成后回到 `idle`
5. 检查 `onTranscribed` 回调是否收到转写文本
6. 再次录音 → 调用 `cancelRecording()` → 直接回到 `idle`，不触发 `onTranscribed`

## 6. 验收标准

- [ ] `voiceAvailable` 反映 `navigator.mediaDevices` 可用性和 `providers` 中是否有 `sttModel`
- [ ] `startRecording` 时状态机正确流转 `idle → requesting → recording`
- [ ] 权限拒绝时状态变为 `error`，`errorMessage` 包含中文提示
- [ ] 无 sttModel Provider 时 `startRecording` 直接设置 `errorMessage`，不请求权限
- [ ] `stopRecording` 后调用 `SttClient.transcribe` 并回调 `onTranscribed`
- [ ] `cancelRecording` 后不触发转写，释放 stream tracks
- [ ] 转写失败时进入 `error` 状态，`errorMessage` 包含错误信息
- [ ] `clearError` 重置到 `idle`
- [ ] 组件卸载时自动释放所有资源
- [ ] `onTranscribed` 回调引用始终保持最新
- [ ] 单元测试覆盖所有状态转换和异常路径（至少 20 个测试用例）
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部通过

## 7. 注意事项

### 7.1 边界情况

| 场景 | 处理方式 |
|------|---------|
| 连续调用 `startRecording` 两次 | 第一次调用中 `releaseStream()` 会清理，第二次覆盖 |
| `stopRecording` 在 `requesting` 状态调用 | `recorder` 为 null，`recorder.state !== 'recording'` 防护直接返回 |
| `cancelRecording` 在 `transcribing` 状态调用 | `recorder` 为 null，防护返回；转写请求不受影响 |
| `providers` 变化但 `selectedProviderRef` 仍指向旧值 | `selectedProviderRef` 在 `startRecording` 时更新，录音中途 providers 变化不影响当前转录 |
| `providers` 变化导致 `voiceAvailable` 变化 | `useMemo` 依赖 `providers`，自动重新计算 |
| `onstop` 异步回调中组件已卸载 | `setVoiceState` / `setErrorMessage` 在卸载后调用会产生 React warning，但不影响功能。如需严格处理，可引入 `isMountedRef` |

### 7.2 潜在风险

1. **MediaRecorder.stop() 的 onstop 异步性**：`recorder.stop()` 后 `ondataavailable` 和 `onstop` 是异步触发的。测试中必须用 `waitFor` 等待，生产代码中通过状态机确保不会在 `transcribing` 期间再次调用 `startRecording`。

2. **SttClient 实例化在 hook 内部**：每次 `stopRecording` 都 `new SttClient(provider)`，这符合 KISS 原则。若后续需要复用连接，可改为 ref 持有单例。

3. **MIME type 回退**：`audio/webm` 在 Chrome 47+ / Firefox 88+ 完全支持，回退 `audio/webm;codecs=opus` 仅在极旧浏览器需要。若 STT 端点不支持 webm，会收到 HTTP 错误，`errorMessage` 会包含服务端返回的错误信息。

4. **录音时长无上限**：MVP 不做时长限制。若用户录制超长音频，可能导致 `SttClient` 超时（默认 120s）。后续迭代可在 UI 层增加提示。

5. **useVoiceInput 不暴露 AbortController**：当前设计不向调用方暴露取消转写的能力。若 `transcribing` 状态需要可取消，后续迭代增加 `abortTranscribing()` 方法。

### 7.3 编码规范

- 遵循现有 hook 命名和结构模式（参考 `useAgent.ts`）
- 使用 `useCallback` 包装所有返回的方法
- 使用 `useRef` 持有可变引用（stream、recorder、chunks、selectedProvider）
- 错误消息使用中文
- 不添加 JSDoc 注释（除非必要说明非显而易见的逻辑）
- 文件末尾导出类型和 hook 函数
