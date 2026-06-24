# 开发文档: T5 - MessageInput 集成麦克风按钮 + App 传参

**Project:** voice-input-mode
**Task ID:** T5
**Slug:** message-input-mic
**Issue:** #98
**类型:** frontend
**Batch:** 4
**依赖:** T4 (#97) — useVoiceInput hook

## 1. 目标

在 `MessageInput` 组件中集成语音输入麦克风按钮，调用 T4 实现的 `useVoiceInput` hook 管理录音→转写生命周期，并在 `App.tsx` 中将 `providers` 状态传递给 `MessageInput`。

## 2. 前置条件

- [ ] T1 (#94) — `ProviderConfig` / `ProviderFormData` 已增加 `sttModel?: string` 字段
- [ ] T2 — `SttClient` 类已实现并可从 `@/provider` 导入
- [ ] T4 (#97) — `useVoiceInput` hook 已实现，导出类型 `VoiceState`、`UseVoiceInputReturn`

**T4 接口契约（假设已实现，T5 按此接口消费）：**

```typescript
// src/entrypoints/sidepanel/hooks/useVoiceInput.ts

export type VoiceState = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error';

export interface UseVoiceInputOptions {
  providers: ProviderConfig[];
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

export function useVoiceInput(options: UseVoiceInputOptions): UseVoiceInputReturn;
```

> **注意：** 若 T4 尚未实现，T5 开发者需与 T4 开发者确认接口签名一致。本方案中所有接口引用均以上述签名为准。

## 3. 实现步骤

### 3.1 MessageInput 改造

**文件：** `src/entrypoints/sidepanel/components/MessageInput.tsx`

#### 3.1.1 Props 扩展

在现有 `Props` 接口中新增 `providers` 字段：

```typescript
import type { ProviderConfig } from '@/shared/types';
import { useVoiceInput } from '../hooks/useVoiceInput';
import type { VoiceState } from '../hooks/useVoiceInput';

interface Props {
  onSend: (text: string) => void;
  onAbort: () => void;
  disabled: boolean;
  isRunning: boolean;
  /** Provider 列表（用于语音功能，至少一个配置了 sttModel 才显示麦克风） */
  providers: ProviderConfig[];
}
```

#### 3.1.2 引入 useVoiceInput hook

在组件函数体顶部调用 `useVoiceInput`，`onTranscribed` 回调将转写文本追加到 textarea：

```typescript
export function MessageInput({ onSend, onAbort, disabled, isRunning, providers }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { voiceState, errorMessage, voiceAvailable, startRecording, stopRecording, clearError } =
    useVoiceInput({
      providers,
      onTranscribed: (transcribedText: string) => {
        // 追加模式：在现有文本末尾追加转写结果
        setText((prev) => {
          const separator = prev.trim() ? ' ' : '';
          return prev + separator + transcribedText;
        });
      },
    });
  // ... 其余逻辑保持不变
```

#### 3.1.3 麦克风按钮渲染逻辑

在 textarea 左侧添加一个麦克风按钮，根据 `voiceState` 渲染不同的视觉状态。按钮放在 `<div className="flex items-end gap-3">` 内部，textarea 之前。

**核心状态映射：**

| voiceState | 按钮外观 | 交互行为 | data-testid |
|---|---|---|---|
| `idle` | 🎤 灰色图标 | 点击调用 `startRecording()` | `mic-button` |
| `requesting` | 加载动画（spinner） | 不可交互 | `mic-button` |
| `recording` | 🔴 红色脉冲圆点 + "录音中" | 点击调用 `stopRecording()` | `mic-button` |
| `transcribing` | 转圈动画 | disabled，不可交互 | `mic-button` |
| `error` | ⚠️ 警告图标 | 点击调用 `clearError()`，hover 显示 errorMessage | `mic-button` |

**按钮实现代码：**

```tsx
// 麦克风按钮渲染辅助函数
const renderMicButton = () => {
  if (!voiceAvailable) return null; // 无可用 STT Provider 时不显示

  const baseClass =
    'shrink-0 w-9 h-9 flex items-center justify-center rounded-md border border-hairline transition-colors';

  switch (voiceState) {
    case 'idle':
      return (
        <button
          type="button"
          data-testid="mic-button"
          onClick={() => startRecording()}
          disabled={disabled}
          className={cn(baseClass, 'text-mute hover:text-ink hover:border-primary', disabled && 'opacity-40 cursor-not-allowed')}
          title="语音输入"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>
      );

    case 'requesting':
      return (
        <span data-testid="mic-button" className={cn(baseClass, 'text-mute')} title="正在请求麦克风权限...">
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="2" opacity="0.75" />
          </svg>
        </span>
      );

    case 'recording':
      return (
        <button
          type="button"
          data-testid="mic-button"
          onClick={() => stopRecording()}
          className={cn(baseClass, 'border-danger bg-red-50 hover:bg-red-100')}
          title="点击停止录音"
        >
          <span className="w-3 h-3 rounded-full bg-danger animate-pulse" />
        </button>
      );

    case 'transcribing':
      return (
        <span data-testid="mic-button" className={cn(baseClass, 'text-mute opacity-60')} title="正在识别语音...">
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="2" opacity="0.75" />
          </svg>
        </span>
      );

    case 'error':
      return (
        <button
          type="button"
          data-testid="mic-button"
          onClick={() => clearError()}
          className={cn(baseClass, 'text-warning hover:text-orange-600')}
          title={errorMessage ?? '语音识别出错'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>
      );

    default:
      return null;
  }
};
```

#### 3.1.4 JSX 布局调整

在现有 `<div className="flex items-end gap-3">` 中，在 textarea 之前插入麦克风按钮：

```tsx
<div className="border-t border-hairline bg-canvas px-4 py-3">
  <div className="flex items-end gap-3">
    {renderMicButton()}
    <textarea ... />
    {/* 发送/中止按钮保持不变 */}
  </div>
</div>
```

#### 3.1.5 完整改造后的 MessageInput 结构

```typescript
import React, { useState, useRef, useEffect } from 'react';
import type { ProviderConfig } from '@/shared/types';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { cn } from '../utils';

interface Props {
  onSend: (text: string) => void;
  onAbort: () => void;
  disabled: boolean;
  isRunning: boolean;
  providers: ProviderConfig[];
}

export function MessageInput({ onSend, onAbort, disabled, isRunning, providers }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { voiceState, errorMessage, voiceAvailable, startRecording, stopRecording, clearError } =
    useVoiceInput({
      providers,
      onTranscribed: (transcribedText: string) => {
        setText((prev) => {
          const separator = prev.trim() ? ' ' : '';
          return prev + separator + transcribedText;
        });
      },
    });

  const handleSend = () => { /* 不变 */ };
  const handleKeyDown = (e: React.KeyboardEvent) => { /* 不变 */ };

  useEffect(() => { /* textarea 自适应高度，不变 */ }, [text]);

  const renderMicButton = () => { /* 上述 switch 逻辑 */ };

  return (
    <div className="border-t border-hairline bg-canvas px-4 py-3">
      <div className="flex items-end gap-3">
        {renderMicButton()}
        <textarea
          ref={textareaRef}
          data-testid="message-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Agent 运行中...' : '输入消息... (Enter 发送, Shift+Enter 换行)'}
          rows={1}
          className={cn(/* 不变 */)}
        />
        {isRunning ? (
          <button type="button" data-testid="abort-button" onClick={onAbort}
            className="px-5 py-2 rounded-full bg-danger text-on-primary text-sm font-medium hover:bg-danger-hover shrink-0">
            中止
          </button>
        ) : (
          <button type="button" data-testid="send-button" onClick={handleSend}
            disabled={!text.trim() || disabled}
            className={cn(/* 不变 */)}>
            发送
          </button>
        )}
      </div>
    </div>
  );
}
```

### 3.2 App.tsx 改造

**文件：** `src/entrypoints/sidepanel/App.tsx`

仅需一处修改：在 `MessageInput` 的 JSX 调用处增加 `providers` prop。

**当前代码（第 179-184 行）：**
```tsx
<MessageInput
  onSend={handleSend}
  onAbort={agent.abort}
  disabled={agent.status !== 'idle'}
  isRunning={agent.status !== 'idle'}
/>
```

**变更后：**
```tsx
<MessageInput
  onSend={handleSend}
  onAbort={agent.abort}
  disabled={agent.status !== 'idle'}
  isRunning={agent.status !== 'idle'}
  providers={providers}
/>
```

`providers` 变量已在 `ChatLayout` 组件中通过 `useState<ProviderConfig[]>([])` 定义，并在 `useEffect` 中从 storage 加载，无需额外声明。

## 4. 接口/契约

### 4.1 依赖接口（由 T4 提供）

```typescript
// 从 useVoiceInput hook 导入
export type VoiceState = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error';

export interface UseVoiceInputReturn {
  voiceState: VoiceState;
  errorMessage: string | null;
  voiceAvailable: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  clearError: () => void;
}

export function useVoiceInput(options: {
  providers: ProviderConfig[];
  onTranscribed: (text: string) => void;
}): UseVoiceInputReturn;
```

### 4.2 本任务修改的接口

**MessageInput Props（扩展）：**
```typescript
interface Props {
  onSend: (text: string) => void;         // 不变
  onAbort: () => void;                     // 不变
  disabled: boolean;                       // 不变
  isRunning: boolean;                      // 不变
  providers: ProviderConfig[];             // 新增
}
```

### 4.3 数据模型变更

无。本任务不涉及持久化数据模型变更。

## 5. 测试指引

### 5.1 现有测试兼容性

T5 修改了 `MessageInput` 的 Props 签名（新增 `providers`），**所有现有测试都需要更新调用处**。

### 5.2 单元测试

**文件：** `src/entrypoints/sidepanel/__tests__/MessageInput.test.tsx`

#### 5.2.1 mock useVoiceInput hook

在测试文件顶部 mock `useVoiceInput`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageInput } from '../components/MessageInput';
import type { UseVoiceInputReturn } from '../hooks/useVoiceInput';

// Mock useVoiceInput hook
const mockUseVoiceInput = vi.fn<[], Partial<UseVoiceInputReturn>>();

vi.mock('../hooks/useVoiceInput', () => ({
  useVoiceInput: (options: { providers: unknown[]; onTranscribed: (text: string) => void }) => {
    // 将 onTranscribed 回调和 providers 保存下来，供测试手动触发
    const currentMock = mockUseVoiceInput();
    // 如果是函数调用模式，将 options 保存到 mock 结果上
    (currentMock as any).__options = options;
    return currentMock;
  },
}));

// 默认 mock 返回值（idle 状态，voiceAvailable = true）
function defaultMock(): UseVoiceInputReturn {
  return {
    voiceState: 'idle',
    errorMessage: null,
    voiceAvailable: true,
    startRecording: vi.fn().mockResolvedValue(undefined),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
    clearError: vi.fn(),
  };
}
```

#### 5.2.2 测试用例

**1. 现有测试适配 — providers prop**
```typescript
const baseProps = {
  onSend: vi.fn(),
  onAbort: vi.fn(),
  disabled: false,
  isRunning: false,
  providers: [],
};
```

**2. voiceAvailable === false 时不渲染麦克风按钮**
```typescript
it('hides mic button when voiceAvailable is false', () => {
  mockUseVoiceInput.mockReturnValue({ ...defaultMock(), voiceAvailable: false });
  render(<MessageInput {...baseProps} />);
  expect(screen.queryByTestId('mic-button')).toBeNull();
});
```

**3. voiceState === 'idle' 时显示麦克风按钮，点击调用 startRecording**
```typescript
it('shows mic button in idle state and calls startRecording on click', async () => {
  const startRecording = vi.fn().mockResolvedValue(undefined);
  mockUseVoiceInput.mockReturnValue({ ...defaultMock(), startRecording });
  render(<MessageInput {...baseProps} />);
  
  const micBtn = screen.getByTestId('mic-button');
  expect(micBtn).toBeDefined();
  await userEvent.click(micBtn);
  expect(startRecording).toHaveBeenCalledOnce();
});
```

**4. voiceState === 'recording' 时显示红色脉冲指示，点击调用 stopRecording**
```typescript
it('shows recording indicator and calls stopRecording on click', async () => {
  const stopRecording = vi.fn();
  mockUseVoiceInput.mockReturnValue({
    ...defaultMock(),
    voiceState: 'recording' as const,
    stopRecording,
  });
  render(<MessageInput {...baseProps} />);
  
  const micBtn = screen.getByTestId('mic-button');
  await userEvent.click(micBtn);
  expect(stopRecording).toHaveBeenCalledOnce();
});
```

**5. voiceState === 'transcribing' 时按钮不可交互**
```typescript
it('shows loading spinner and disables interaction when transcribing', () => {
  mockUseVoiceInput.mockReturnValue({
    ...defaultMock(),
    voiceState: 'transcribing' as const,
  });
  render(<MessageInput {...baseProps} />);
  
  const micBtn = screen.getByTestId('mic-button');
  // 在 transcribing 状态下渲染为 <span>，不是 <button>
  expect(micBtn.tagName).toBe('SPAN');
});
```

**6. voiceState === 'error' 时显示警告图标，点击调用 clearError**
```typescript
it('shows error icon and calls clearError on click', async () => {
  const clearError = vi.fn();
  mockUseVoiceInput.mockReturnValue({
    ...defaultMock(),
    voiceState: 'error' as const,
    errorMessage: '权限被拒绝',
    clearError,
  });
  render(<MessageInput {...baseProps} />);
  
  const micBtn = screen.getByTestId('mic-button');
  expect(micBtn.getAttribute('title')).toContain('权限被拒绝');
  await userEvent.click(micBtn);
  expect(clearError).toHaveBeenCalledOnce();
});
```

**7. 转写成功后文本追加到 textarea**
```typescript
it('appends transcribed text to textarea', async () => {
  let capturedOnTranscribed: ((text: string) => void) | undefined;
  
  mockUseVoiceInput.mockImplementation(() => {
    const mock = defaultMock();
    return mock;
  });
  
  // 我们需要捕获 useVoiceInput 的 onTranscribed 回调
  // 通过读取 mock 上的 __options 属性
  render(<MessageInput {...baseProps} />);
  
  const textarea = screen.getByTestId('message-input') as HTMLTextAreaElement;
  await userEvent.type(textarea, 'hello');
  expect(textarea.value).toBe('hello');
  
  // 手动触发 onTranscribed（模拟 hook 内部调用）
  const mockCall = mockUseVoiceInput.mock.results[0]?.value as any;
  const onTranscribed = mockCall?.__options?.onTranscribed;
  expect(onTranscribed).toBeDefined();
  
  // 模拟转写回调
  // 由于 mock 的特殊性，这里需要用 act 包裹状态更新
  await act(async () => {
    onTranscribed(' world');
  });
  
  expect(textarea.value).toContain('hello');
  expect(textarea.value).toContain('world');
});
```

> **注意：** 测试用例 7 的 mock 策略可能需要根据实际 `useVoiceInput` hook 实现调整。若 `onTranscribed` 的触发方式不同，测试也应相应调整。

**8. disabled 为 true 时麦克风按钮也 disabled**
```typescript
it('disables mic button when disabled prop is true and voiceState is idle', () => {
  mockUseVoiceInput.mockReturnValue(defaultMock());
  render(<MessageInput {...baseProps} disabled={true} />);
  
  const micBtn = screen.getByTestId('mic-button') as HTMLButtonElement;
  expect(micBtn.disabled).toBe(true);
});
```

**9. voiceState === 'requesting' 时显示加载状态**
```typescript
it('shows spinner when requesting microphone permission', () => {
  mockUseVoiceInput.mockReturnValue({
    ...defaultMock(),
    voiceState: 'requesting' as const,
  });
  render(<MessageInput {...baseProps} />);
  
  const micBtn = screen.getByTestId('mic-button');
  expect(micBtn.tagName).toBe('SPAN');
});
```

### 5.3 集成验证

运行全部测试：
```bash
npx vitest run
```

预期结果：
- 现有 6 个 MessageInput 测试 + 新增 9 个测试全部通过
- 其他模块测试不受影响

## 6. 验收标准

- [ ] `MessageInput` Props 新增 `providers: ProviderConfig[]`
- [ ] `voiceAvailable === false` 时不渲染麦克风按钮
- [ ] `voiceState === 'idle'` 时显示麦克风图标，点击调用 `startRecording()`
- [ ] `voiceState === 'requesting'` 时显示加载动画（spinner）
- [ ] `voiceState === 'recording'` 时显示红色脉冲圆点，点击调用 `stopRecording()`
- [ ] `voiceState === 'transcribing'` 时显示转圈动画，按钮不可交互
- [ ] `voiceState === 'error'` 时显示 ⚠️ 图标，hover 显示 `errorMessage`，点击调用 `clearError()`
- [ ] 转写成功后文本自动追加到 textarea（以空格分隔追加）
- [ ] 录音/转录过程中 textarea 保持可编辑（不禁用）
- [ ] 发送按钮行为不受麦克风按钮影响
- [ ] `App.tsx` 中 `MessageInput` 正确传递 `providers={providers}`
- [ ] 单元测试覆盖所有 5 种 `voiceState` 的渲染和交互
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部通过

## 7. 注意事项

### 7.1 依赖链风险

- T5 依赖 T4（`useVoiceInput` hook），若 T4 的接口签名与本方案假设不一致，需要调整。
- T4 又依赖 T2（`SttClient`）和 T1（类型扩展）。建议在 T1 完成后即可开始 T5 的 mock 测试编写（mock `useVoiceInput`），待 T4 完成后联调。

### 7.2 麦克风按钮的 disabled 逻辑

- `voiceState === 'idle'` 且 `disabled === true`（Agent 运行中）时，麦克风按钮应禁用。虽然录音过程中 textarea 不禁用，但 Agent 运行中启动录音没有意义（无法发送消息），因此麦克风按钮跟随全局 `disabled` 状态。
- `voiceState === 'recording'` 时，即使用户正在录音，Agent 运行中也不应阻止录音（用户可能想先录好等 Agent 空闲再发送）。

### 7.3 转写文本追加策略

采用**追加模式**（非替换）：在现有 textarea 文本末尾追加转写结果，以空格分隔。这允许用户：
1. 先手打一部分文字
2. 再语音输入补充内容
3. 两部分自动拼接

### 7.4 SVG 图标

方案中使用内联 SVG 绘制麦克风、加载、警告图标，避免引入额外图标库依赖。这些 SVG 来自 Feather Icons 风格（24×24 viewBox，stroke 模式）。

### 7.5 错误恢复

`voiceState === 'error'` 时点击麦克风按钮调用 `clearError()` 回到 `idle` 状态，用户可以重新尝试录音。不自动恢复，给用户明确的控制权。

### 7.6 现有测试兼容性

现有 6 个 MessageInput 测试的 `render(<MessageInput ... />)` 调用缺少 `providers` prop，必须全部补充 `providers={[]}` 才能通过 TypeScript 编译。

### 7.7 录音过程中文本编辑

录音过程中 textarea **不禁用**，用户可以继续手动输入。这符合设计文档中的可用性要求："录音/转录过程中 textarea 不禁用，用户可继续手动输入"。
