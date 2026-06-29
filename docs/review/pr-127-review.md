## 审查报告 — PR #127: T8 MessageInput 国际化

### 变更概述
- **分支**: `feat/i18n-message-input` → `dev`
- **Issue**: #114
- **修改文件数**: 1
  - `src/entrypoints/sidepanel/components/MessageInput.tsx` — 全面国际化
- **风险等级**: 高 — 存在 1 个 Critical 问题

---

### 审查要点逐项分析

#### 1. 硬编码中文文本替换

| 位置 | 原文本 | 替换为 | 验证 |
|------|--------|--------|------|
| title="语音输入" | 硬编码 | `t('chat.input.voiceInput')` | ✅ |
| title="正在请求麦克风权限..." | 硬编码 | `t('chat.input.requestingMic')` | ✅ |
| title="点击停止录音" | 硬编码 | `t('chat.input.stopRecording')` | ✅ |
| title="正在识别语音..." | 硬编码 | `t('chat.input.transcribing')` | ✅ |
| fallback: '语音识别出错' | 硬编码 | `t('chat.input.voiceError')` | ✅ |
| placeholder="Agent 运行中..." | 硬编码 | `t('chat.input.disabledPlaceholder')` | ✅ |
| placeholder="输入消息... (...)" | 硬编码 | `t('chat.input.placeholder')` | ✅ |
| "中止" | 硬编码 | `t('chat.input.abort')` | ✅ |
| "发送" | 硬编码 | `t('chat.input.send')` | ✅ |
| (无) aria-label | 新增 | `aria-label={t('chat.input.send')}` | ✅ (可访问性改进) |

共 9 处硬编码中文全部替换，额外新增 1 个 `aria-label` 无障碍属性。

#### 2. i18n key 定义检查

所有 key 均存在于 `MessageSchema` (types.ts) 和两个 JSON 语言包中：

| Key | zh-CN | en |
|-----|-------|----|
| `chat.input.placeholder` | "输入消息..." | "Type a message..." |
| `chat.input.disabledPlaceholder` | "Agent 运行中..." | "Agent is running..." |
| `chat.input.abort` | "中止" | "Abort" |
| `chat.input.send` | "发送" | "Send" |
| `chat.input.voiceInput` | "语音输入" | "Voice input" |
| `chat.input.requestingMic` | "正在请求麦克风权限..." | "Requesting microphone..." |
| `chat.input.stopRecording` | "点击停止录音" | "Click to stop recording" |
| `chat.input.transcribing` | "正在识别语音..." | "Transcribing..." |
| `chat.input.voiceError` | "语音识别出错" | "Voice recognition error" |

全部 ✅

#### 3. Props / 逻辑 / 样式变更检查

- 无 Props 变更 ✅
- 无样式变更 ✅
- 新增 `aria-label` on send button — 无障碍增强，无功能影响 ✅
- **⚠️ 关键变更**: 向 `useVoiceInput` 传入 `t` 参数

---

### 发现问题

#### [CRITICAL] #1: `t` 参数传入 `useVoiceInput` 但 Hook 未定义该参数 — TypeScript 编译错误

- **文件**: `src/entrypoints/sidepanel/components/MessageInput.tsx:35`
- **代码**:
  ```typescript
  const { voiceState, errorMessage, voiceAvailable, startRecording, stopRecording, clearError } =
-    useVoiceInput({ providers, onTranscribed: handleTranscribed });
+    useVoiceInput({ providers, onTranscribed: handleTranscribed, t });
  ```
- **问题**: 当前 `dev` 分支的 `useVoiceInput` hook (`src/entrypoints/sidepanel/hooks/useVoiceInput.ts`) 的 `UseVoiceInputOptions` 接口不包含 `t` 属性：
  ```typescript
  // hooks/useVoiceInput.ts:7-10 (当前 dev)
  export interface UseVoiceInputOptions {
    providers: ProviderConfig[];
    onTranscribed: (text: string) => void;
    // ❌ 缺少 t
  }
  ```
- **影响**: 向类型化参数传递额外属性 `t` 会导致 TypeScript 编译错误：
  > Object literal may only specify known properties, and 't' does not exist in type 'UseVoiceInputOptions'.

- **根因分析**: `t` 的传递是为了让 `useVoiceInput` hook 内部使用 i18n 翻译其硬编码的 6 处中文错误消息（`voice.noSttModel`, `voice.micDenied`, `voice.noMic`, `voice.startFailed`, `voice.providerLost`, `voice.transcribeFailed`）。该功能对应 T9 (Voice 输入国际化)，在 worktree `i18n-voice-input` 中已实现（`t?` 可选参数 + fallback 模式）。

- **修复建议**:

  **方案 A（推荐）**: 在 T8（本 PR）中先不传 `t`，等 T9 合入后该参数自然可用时再传。
  ```typescript
  // 恢复为原始调用
  useVoiceInput({ providers, onTranscribed: handleTranscribed })
  ```

  **方案 B**: 在本 PR 中同时修改 `useVoiceInput` 接口，将 `t` 设为可选参数（提前定义接口，T9 随后实现实际翻译逻辑）。
  ```typescript
  // hooks/useVoiceInput.ts
  export interface UseVoiceInputOptions {
    providers: ProviderConfig[];
    onTranscribed: (text: string) => void;
+   t?: (key: string, vars?: Record<string, string | number>) => string; // I18n 翻译函数（可选）
  }
  ```

  推荐方案 A（最小变更，不越界修改其他文件）。

---

### 测试建议

1. 验证 `t('chat.input.*')` 所有 key 在 `zh-CN` / `en` 下正确渲染
2. 验证 `errorMessage ?? t('chat.input.voiceError')` fallback 行为 — 当 `errorMessage` 为 null 时显示翻译文本
3. 无障碍测试：确认 `aria-label={t('chat.input.send')}` 正确设置

---

### 审查结论

- [ ] **不通过** — 存在 1 个 Critical 问题（TypeScript 编译错误）

**阻塞项**: PR #127 向 `useVoiceInput` 传入 `t` 参数但 hook 不接受，无法独立编译。需移除 `t` 传参或同步修改 hook 接口。

**备注**: 除上述 Critical 问题外，MessageInput 组件的文本替换全部正确且干净，`aria-label` 增强为正向改进。
