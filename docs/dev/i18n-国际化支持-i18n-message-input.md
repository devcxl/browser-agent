# 开发文档: T8 - MessageInput 国际化

**Project:** i18n-国际化支持
**Task ID:** T8
**Slug:** i18n-message-input
**Issue:** #114
**类型:** frontend
**Batch:** 3
**依赖:** T3 (I18nProvider + useI18n)

## 1. 目标

将 `MessageInput` 组件中的 placeholder、按钮文本、语音按钮 title 属性全部替换为 `t()` 调用。

## 2. 前置条件

- [ ] T3 完成 — `useI18n` hook 可用
- [ ] T1 完成 — 语言包中 `chat.input.*` 和 `voice.*` 全部 key 已定义

## 3. 实现步骤

### 3.1 增加导入和 hook 调用

**文件：** `src/entrypoints/sidepanel/components/MessageInput.tsx`

增加导入：
```typescript
import { useI18n } from '../i18n/useI18n';
```

在 `MessageInput` 函数体顶部增加：
```typescript
const { t } = useI18n();
```

### 3.2 替换清单

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 75 | `title="语音输入"` | `title={t('chat.input.voiceInput')}` | `chat.input.voiceInput` |
| 88 | `title="正在请求麦克风权限..."` | `title={t('chat.input.requestingMic')}` | `chat.input.requestingMic` |
| 100 | `title="点击停止录音"` | `title={t('chat.input.stopRecording')}` | `chat.input.stopRecording` |
| 108 | `title="正在识别语音..."` | `title={t('chat.input.transcribing')}` | `chat.input.transcribing` |
| 120 | `title={errorMessage \|\| '语音识别出错'}` | `title={errorMessage \|\| t('chat.input.voiceError')}` | `chat.input.voiceError` |
| 152 | `placeholder={disabled ? 'Agent 运行中...' : '输入消息... (Enter 发送, Shift+Enter 换行)'}` | 见 3.3 | `chat.input.placeholder` / `chat.input.disabledPlaceholder` |
| 169 | `中止` | `{t('chat.input.abort')}` | `chat.input.abort` |
| 184 | `发送` | `{t('chat.input.send')}` | `chat.input.send` |

### 3.3 Placeholder 改造（重点）

第 152 行的 placeholder 是条件表达式，需要拆分：

```tsx
// 改前
placeholder={disabled ? 'Agent 运行中...' : '输入消息... (Enter 发送, Shift+Enter 换行)'}

// 改后
placeholder={disabled ? t('chat.input.disabledPlaceholder') : t('chat.input.placeholder')}
```

对应语言包：
- `chat.input.placeholder`：
  - 中文：`输入消息... (Enter 发送, Shift+Enter 换行)`
  - 英文：`Type a message... (Enter to send, Shift+Enter for new line)`
- `chat.input.disabledPlaceholder`：
  - 中文：`Agent 运行中...`
  - 英文：`Agent is running...`

### 3.4 语音错误 fallback

第 120 行的语音错误 title：
```tsx
// 改前
title={errorMessage ?? '语音识别出错'}

// 改后
title={errorMessage ?? t('chat.input.voiceError')}
```

对应语言包 `chat.input.voiceError`：
- 中文：`语音识别出错`
- 英文：`Voice recognition error`

**注意：** `errorMessage` 来自 `useVoiceInput` hook，是动态错误文本。此处的 i18n 仅覆盖 fallback 默认值。当 `errorMessage` 有值时，显示的是 hook 产出的错误文本（T12 任务将改造 hook 的错误消息为国际化）。

### 3.5 最终代码差异概览

**新增：**
- `import { useI18n } from '../i18n/useI18n';`
- `const { t } = useI18n();` 在组件顶部

**修改：**
- 5 处 `title` 属性改为 `t()` 调用
- 1 处 `placeholder` 改为条件 `t()` 调用
- 2 处按钮文本（发送/中止）改为 `t()` 调用

**不变：**
- 语音按钮渲染逻辑（`renderMicButton` 的状态机分支）
- `voiceAvailable` 计算
- `handleTranscribed` 回调
- 键盘事件处理

## 4. 接口/契约

### 4.1 使用的语言包 Key

| Key | 中文 | 英文 |
|-----|------|------|
| `chat.input.placeholder` | 输入消息... (Enter 发送, Shift+Enter 换行) | Type a message... (Enter to send, Shift+Enter for new line) |
| `chat.input.disabledPlaceholder` | Agent 运行中... | Agent is running... |
| `chat.input.send` | 发送 | Send |
| `chat.input.abort` | 中止 | Abort |
| `chat.input.voiceInput` | 语音输入 | Voice input |
| `chat.input.requestingMic` | 正在请求麦克风权限... | Requesting microphone... |
| `chat.input.stopRecording` | 点击停止录音 | Click to stop recording |
| `chat.input.transcribing` | 正在识别语音... | Transcribing... |
| `chat.input.voiceError` | 语音识别出错 | Voice recognition error |

### 4.2 不需要改造的部分

- SVG 图标（箭头、麦克风、进度条等）— 非文本内容
- CSS 类名 — 非用户可见文本
- `SpinnerIcon` — 纯视觉元素

## 5. 测试指引

### 5.1 现有测试

当前存在 `src/entrypoints/sidepanel/__tests__/MessageInput.test.tsx`。

需更新：
- Mock `useI18n` 返回 `{ t: (key) => key, locale: 'zh-CN' }`
- 验证 placeholder 使用 `t()` 返回值
- 验证按钮文本使用 `t()` 返回值
- 验证语音按钮 title 属性使用 `t()` 返回值

### 5.2 手动验证

1. 中文环境：placeholder 显示"输入消息... (Enter 发送, Shift+Enter 换行)"
2. 英文环境：placeholder 显示"Type a message... (Enter to send, Shift+Enter for new line)"
3. Agent 运行中时：placeholder 显示"Agent 运行中..." / "Agent is running..."
4. 发送按钮："发送" / "Send"
5. 中止按钮："中止" / "Abort"
6. 语音按钮 hover title："语音输入" / "Voice input"
7. 录音中按钮 hover title："点击停止录音" / "Click to stop recording"
8. 转写中按钮 hover title："正在识别语音..." / "Transcribing..."

## 6. 验收标准

- [ ] 输入框 placeholder 正常/禁用两种状态均可切换
- [ ] "发送"按钮文本可切换
- [ ] "中止"按钮文本可切换
- [ ] 语音按钮 5 种状态的 `title` 属性均可切换
- [ ] 语音错误 fallback 文本可切换
- [ ] `npx tsc --noEmit` 零错误
- [ ] 现有测试全部通过

## 7. 注意事项

### 7.1 错误消息双层处理

`MessageInput` 的语音错误 fallback 和 `useVoiceInput` hook 的错误消息是两个不同层：
- hook 的错误消息（`errorMessage`）— 由 T12 改造为国际化
- 此处 fallback `t('chat.input.voiceError')` — 仅当 hook 返回的 `errorMessage` 为 `null` 时使用

两者需确保翻译一致性（即 fallback 文本和 hook 产出的默认文本含义相同）。

### 7.2 Placeholder 文本中的括号

原 placeholder 包含括号 `(Enter 发送, Shift+Enter 换行)`，英语版本应使用英语键盘术语：
- 中文：`Enter 发送, Shift+Enter 换行`
- 英文：`Enter to send, Shift+Enter for new line`

键盘按键名（Enter / Shift）保持英文，不翻译。

### 7.3 disabled 状态一致性

`disabled` prop 不仅影响样式，还影响 placeholder 文本的选择。改造后保持相同条件逻辑不变，仅替换文本源。
