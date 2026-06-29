# 开发文档: T12 - useVoiceInput hook 错误消息国际化

**Project:** i18n-国际化支持
**Task ID:** T12
**Slug:** i18n-voice-input
**Issue:** #118
**类型:** frontend
**Batch:** 3
**依赖:** T3 (I18nProvider + useI18n)

## 1. 目标

将 `useVoiceInput` hook 中的 6 种错误消息从硬编码中文改为通过 `t()` 函数动态获取，支持中/英文切换。

## 2. 前置条件

- [ ] T3 完成 — `useI18n` hook 可用，返回 `{ t }`；或导出一个独立的 `getT()` 函数供非组件上下文使用
- [ ] T1 完成 — 语言包中 `voice.*` 全部 key 已定义

## 3. 实现步骤

### 3.1 核心问题分析

`useVoiceInput` 是一个 React hook，但它通过 `useCallback` 创建的 `startRecording`、`stopRecording` 等函数在闭包中使用错误消息。如果直接调用 `useI18n()` 获取 `t` 函数：
- `t` 会在语言切换时变化
- `startRecording` 通过 `useCallback` 缓存，依赖数组需包含 `t`，导致频繁重建
- 但 `useCallback` 重建并非问题——`startRecording` 返回的引用变化不会导致 `MessageInput` 异常重渲染

**更优方案：** 将 `t` 函数作为 hook 的参数（`UseVoiceInputOptions`）传入，由调用方（`MessageInput`）负责提供 `t` 函数。

### 3.2 方案：通过 Options 传入 t 函数

#### 3.2.1 修改接口

**文件：** `src/entrypoints/sidepanel/hooks/useVoiceInput.ts`

修改 `UseVoiceInputOptions` 接口：
```typescript
export interface UseVoiceInputOptions {
  providers: ProviderConfig[];
  onTranscribed: (text: string) => void;
  /** 翻译函数（来自 useI18n），用于错误消息国际化 */
  t: (key: string, vars?: Record<string, string | number>) => string;
}
```

#### 3.2.2 修改 hook 函数签名

```typescript
export function useVoiceInput({
  providers,
  onTranscribed,
  t,
}: UseVoiceInputOptions): UseVoiceInputReturn {
```

#### 3.2.3 使用 tRef 保持引用稳定

与 `onTranscribedRef` 同理，使用 ref 保持 `t` 的最新引用，避免 `useCallback` 依赖 `t`：

```typescript
const tRef = useRef(t);

useEffect(() => {
  tRef.current = t;
}, [t]);
```

这样 `startRecording` 等函数的 `useCallback` 依赖数组无需包含 `t`。

#### 3.2.4 替换错误消息

现有代码中的 6 种硬编码中文错误消息：

| 位置 | 当前代码 | 替换为 | Key |
|------|---------|--------|-----|
| 第 98 行 | `'未配置语音模型，请在设置中为 Provider 添加 sttModel'` | `tRef.current('voice.noSttModel')` | `voice.noSttModel` |
| 第 128 行 | `'麦克风权限被拒绝，请在浏览器设置中允许访问麦克风'` | `tRef.current('voice.micDenied')` | `voice.micDenied` |
| 第 130 行 | `'未检测到麦克风设备'` | `tRef.current('voice.noMic')` | `voice.noMic` |
| 第 132 行 | `` `无法启动录音: ${error.message}` `` | `tRef.current('voice.startFailed', { message: error.message })` | `voice.startFailed` |
| 第 149 行 | `'Provider 配置丢失'` | `tRef.current('voice.providerLost')` | `voice.providerLost` |
| 第 161 行 | `` `语音识别失败: ${(err as Error).message}` `` | `tRef.current('voice.transcribeFailed', { message: (err as Error).message })` | `voice.transcribeFailed` |

#### 3.2.5 具体代码修改

**无 sttModel 错误（第 96-99 行）：**
```typescript
// 改前
setErrorMessage('未配置语音模型，请在设置中为 Provider 添加 sttModel');

// 改后
setErrorMessage(tRef.current('voice.noSttModel'));
```

**麦克风权限错误（第 127-133 行）：**
```typescript
// 改前
if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
  setErrorMessage('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
} else if (error.name === 'NotFoundError') {
  setErrorMessage('未检测到麦克风设备');
} else {
  setErrorMessage(`无法启动录音: ${error.message}`);
}

// 改后
if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
  setErrorMessage(tRef.current('voice.micDenied'));
} else if (error.name === 'NotFoundError') {
  setErrorMessage(tRef.current('voice.noMic'));
} else {
  setErrorMessage(tRef.current('voice.startFailed', { message: error.message }));
}
```

**Provider 丢失错误（第 149 行）：**
```typescript
// 改前
setErrorMessage('Provider 配置丢失');

// 改后
setErrorMessage(tRef.current('voice.providerLost'));
```

**转录失败错误（第 161 行）：**
```typescript
// 改前
setErrorMessage(`语音识别失败: ${(err as Error).message}`);

// 改后
setErrorMessage(tRef.current('voice.transcribeFailed', { message: (err as Error).message }));
```

#### 3.2.6 调用方 MessageInput 适配

**文件：** `src/entrypoints/sidepanel/components/MessageInput.tsx`

当前：
```typescript
const { voiceState, errorMessage, ... } = useVoiceInput({ providers, onTranscribed: handleTranscribed });
```

改后（需要先调用 `useI18n` 获取 `t`）：
```typescript
const { t } = useI18n();  // MessageInput 中已有此调用（T8 任务）
const { voiceState, errorMessage, ... } = useVoiceInput({ providers, onTranscribed: handleTranscribed, t });
```

### 3.3 备选方案：hook 内部直接使用 useI18n

如果团队认为 hook 内部调用 `useI18n()` 更简洁：

```typescript
import { useI18n } from '../i18n/useI18n';

export function useVoiceInput({ providers, onTranscribed }: UseVoiceInputOptions): UseVoiceInputReturn {
  const { t } = useI18n();
  const tRef = useRef(t);
  
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  
  // ... 其他代码不变，错误消息改为 tRef.current('voice.xxx')
}
```

**优点：** 调用方无需改动（`MessageInput` 不需要额外传入 `t`）。
**缺点：** hook 与 `I18nProvider` 产生隐式依赖，如果 hook 在 Provider 外使用会崩溃。

**推荐：** 使用备选方案（hook 内部调用 `useI18n()`）。因为 `useVoiceInput` 只在被 `I18nProvider` 包裹的组件树内使用，不存在脱离 Provider 的场景。同时减少调用方改动。

### 3.4 最终推荐实现

综合 3.2 和 3.3：**hook 内部直接调用 `useI18n()`**，减少对外接口的改动。

#### 步骤：

1. 在 `useVoiceInput.ts` 顶部增加：
```typescript
import { useI18n } from '../i18n/useI18n';
```

2. 在 hook 函数体内（`useVoiceInput` 函数开始处）增加：
```typescript
const { t } = useI18n();
const tRef = useRef(t);

useEffect(() => {
  tRef.current = t;
}, [t]);
```

3. 将 6 处错误消息替换为 `tRef.current(...)` 调用（见 3.2.4 清单）。

4. `UseVoiceInputOptions` 接口不变。

## 4. 接口/契约

### 4.1 Hook 接口不变

```typescript
export interface UseVoiceInputOptions {
  providers: ProviderConfig[];
  onTranscribed: (text: string) => void;
  // 不新增 t 参数
}
```

### 4.2 使用的语言包 Key

| Key | 中文 | 英文 |
|-----|------|------|
| `voice.noSttModel` | 未配置语音模型，请在设置中为 Provider 添加 sttModel | No STT model configured. Add sttModel to a Provider in Settings. |
| `voice.micDenied` | 麦克风权限被拒绝，请在浏览器设置中允许访问麦克风 | Microphone permission denied. Allow microphone access in browser settings. |
| `voice.noMic` | 未检测到麦克风设备 | No microphone device detected |
| `voice.startFailed` | 无法启动录音: {{message}} | Failed to start recording: {{message}} |
| `voice.providerLost` | Provider 配置丢失 | Provider configuration lost |
| `voice.transcribeFailed` | 语音识别失败: {{message}} | Transcription failed: {{message}} |

### 4.3 模板变量

- `voice.startFailed`：`message` — DOMException 的错误消息（如 "Permission denied"）
- `voice.transcribeFailed`：`message` — SttClient 转写失败的错误消息（如 "HTTP 403"）

模板变量值来自 `Error.message`，通常为英文技术信息，不通过 i18n 翻译。

## 5. 测试指引

### 5.1 现有测试

当前存在 `src/entrypoints/sidepanel/hooks/__tests__/useVoiceInput.test.ts`（或类似路径）。

需更新：
- 确保测试环境中 `useI18n` 可被 mock，返回 `{ t: (key) => key }`
- 更新所有断言错误消息的测试用例，将硬编码中文改为 key（因为 mock 的 `t` 返回 key 本身）
- 或者 mock `t` 返回对应的中文文本以保持现有测试不变

推荐后者（mock 返回中文），改动最小：
```typescript
const mockT = vi.fn((key: string) => {
  const messages: Record<string, string> = {
    'voice.noSttModel': '未配置语音模型，请在设置中为 Provider 添加 sttModel',
    'voice.micDenied': '麦克风权限被拒绝，请在浏览器设置中允许访问麦克风',
    // ...
  };
  return messages[key] ?? key;
});

vi.mock('../i18n/useI18n', () => ({
  useI18n: () => ({ t: mockT, locale: 'zh-CN', setLanguage: vi.fn() }),
}));
```

### 5.2 测试用例需更新的断言

| 原测试 | 改动 |
|--------|------|
| 预期 `errorMessage` 包含 `'未配置语音模型'` | 预期包含 `voice.noSttModel` 的翻译结果（中文/英文） |
| 预期 `errorMessage` 包含 `'麦克风权限被拒绝'` | 同上 |
| 预期 `errorMessage` 包含 `'未检测到麦克风'` | 同上 |
| 预期 `errorMessage` 包含 `'无法启动录音:'` | 同上 |
| 预期 `errorMessage` 包含 `'Provider 配置丢失'` | 同上 |
| 预期 `errorMessage` 包含 `'语音识别失败:'` | 同上 |

### 5.3 额外测试用例

新增：语言切换后错误消息更新。
1. 切换到英文 → 触发权限错误 → 错误消息为英文
2. 切换到中文 → 触发权限错误 → 错误消息为中文

### 5.4 手动验证

1. 不配置 sttModel → 点击语音按钮 → 显示"未配置语音模型..." / "No STT model configured..."
2. 拒绝麦克风权限 → 显示"麦克风权限被拒绝..." / "Microphone permission denied..."
3. 拔掉麦克风 → 显示"未检测到麦克风设备" / "No microphone device detected"
4. 录音中修改 providers 导致丢失 → 显示"Provider 配置丢失" / "Provider configuration lost"
5. STT 接口返回错误 → 显示"语音识别失败: {message}" / "Transcription failed: {message}"

## 6. 验收标准

- [ ] 6 种错误消息均通过 `t()` 获取，无硬编码中文
- [ ] `voice.noSttModel` 错误消息可切换
- [ ] `voice.micDenied` 权限拒绝消息可切换
- [ ] `voice.noMic` 无设备消息可切换
- [ ] `voice.startFailed` 启动失败消息可切换（模板变量正确替换）
- [ ] `voice.providerLost` Provider 丢失消息可切换
- [ ] `voice.transcribeFailed` 转录失败消息可切换（模板变量正确替换）
- [ ] 语言切换后，新产生的错误消息跟随当前语言
- [ ] 调用方 `MessageInput` 无需额外改动（hook 内部获取 `t`）
- [ ] `npx tsc --noEmit` 零错误
- [ ] 现有测试全部通过

## 7. 注意事项

### 7.1 错误消息中的动态内容

`voice.startFailed` 和 `voice.transcribeFailed` 包含动态 `message` 变量（来自 `Error.message`），这些内容通常是英文技术错误（如 "Permission denied"、"HTTP 403 Forbidden"），不需要也不应该通过 i18n 翻译。模板变量仅将技术信息嵌入翻译后的提示文案中。

### 7.2 tRef 模式

使用 `tRef` 而非直接在 `useCallback` 依赖中包含 `t`，是因为：
- `t` 函数在语言切换时引用会变化
- 如果在 `useCallback` 中依赖 `t`，`startRecording` 等函数会在语言切换时重建
- 这可能导致正在录音中的场景出现意外行为（`startRecording` 引用变但当前录音不受影响，因为录音状态已在 ref 中）

使用 `tRef` 确保 `useCallback` 依赖数组保持最小（仅 `providers`、`setVoiceStateSync`）。

### 7.3 国际化 hook 的模块耦合

`useVoiceInput` 在 `src/entrypoints/sidepanel/hooks/`，`useI18n` 在 `src/entrypoints/sidepanel/i18n/`，两者在同一 entrypoint 内，导入路径合理。

如果未来 `useVoiceInput` 被移到 `src/provider/` 或共享目录，需要重新考虑 `t` 函数的提供方式（可能回退到参数传入方案）。

### 7.4 与 T8 错误消息 fallback 的关系

T8（`MessageInput`）中有一处语音错误 fallback：`title={errorMessage ?? t('chat.input.voiceError')}`。

`errorMessage` 来自 `useVoiceInput` hook，T12 改造后它已经是国际化文本。而 fallback `t('chat.input.voiceError')` 仅在 `errorMessage` 为 `null` 时使用。

确保两处文本不冲突：`chat.input.voiceError`（fallback）和 `voice.*` 系列（hook 产出的错误）语义一致但用途不同。
