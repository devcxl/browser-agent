## PR #103 审查报告

**审查时间**：2026-06-24
**审查人**：@reviewer (OpenCode)
**PR 标题**：T5: MessageInput 集成麦克风按钮 + App 传参 (closes #98)

---

### 变更摘要

在 MessageInput 组件中集成语音输入麦克风按钮，调用 useVoiceInput hook 管理录音→转写生命周期。App.tsx 传递 providers 给 MessageInput。

- **修改文件数**：3
- **变更行数**：+256 / -10
- **涉及文件**：
  - `src/entrypoints/sidepanel/components/MessageInput.tsx` — 集成 useVoiceInput + 5 种状态的麦克风按钮渲染
  - `src/entrypoints/sidepanel/App.tsx` — 传递 `providers={providers}`
  - `src/entrypoints/sidepanel/__tests__/MessageInput.test.tsx` — mock useVoiceInput，新增 8 个语音相关测试

---

### 验收标准对照

| # | 验收标准 | 状态 | 说明 |
|---|---------|------|------|
| 1 | MessageInput Props 新增 `providers: ProviderConfig[]` | ✅ | Props 接口已新增，App.tsx 正确传递 |
| 2 | `voiceAvailable === false` 时不渲染麦克风按钮 | ✅ | `renderMicButton()` 首行 `if (!voiceAvailable) return null`，测试覆盖 |
| 3 | `voiceState === 'idle'` 时显示麦克风图标，点击调用 `startRecording()` | ✅ | SVG 麦克风图标，onClick → startRecording()，测试覆盖 |
| 4 | `voiceState === 'requesting'` 时显示加载动画 spinner | ✅ | `<span>` + animate-spin SVG，不可交互，测试覆盖 |
| 5 | `voiceState === 'recording'` 时显示红色脉冲圆点，点击调用 `stopRecording()` | ✅ | `animate-pulse` 红色圆点，onClick → stopRecording()，测试覆盖 |
| 6 | `voiceState === 'transcribing'` 时显示转圈动画，按钮不可交互 | ✅ | `<span>` + animate-spin SVG，测试覆盖 |
| 7 | `voiceState === 'error'` 时显示 ⚠️ 图标，hover 显示 `errorMessage`，点击调用 `clearError()` | ✅ | 三角形警告 SVG，title 属性为 errorMessage，测试覆盖 |
| 8 | 转写成功后文本自动追加到 textarea | ✅ | `onTranscribed` 回调中 `setText(prev + separator + transcribedText)`，测试覆盖 |
| 9 | 录音/转录过程中 textarea 保持可编辑 | ✅ | textarea 的 `disabled` 属性只由 `disabled` prop 控制，与 voiceState 无关 |
| 10 | 发送按钮行为不受麦克风按钮影响 | ✅ | 发送按钮逻辑未修改，`handleSend` 保持不变 |
| 11 | App.tsx 中 MessageInput 正确传递 `providers={providers}` | ✅ | 第 184 行 `providers={providers}` |
| 12 | 单元测试覆盖所有 5 种 voiceState 的渲染和交互 | ✅ | 15 个测试全部通过（7 旧 + 8 新），覆盖 idle/requesting/recording/transcribing/error |
| 13 | `npx vitest run` 全部通过 | ✅ | 15/15 passed，耗时 1.56s |

---

### 问题列表

#### [MEDIUM] onTranscribed 回调未包装在 useCallback 中，每次渲染都创建新引用，导致 useVoiceInput 内部的 useEffect 不必要执行

- **文件**：`src/entrypoints/sidepanel/components/MessageInput.tsx:21-26`
- **问题**：`onTranscribed` 作为内联箭头函数传递给 `useVoiceInput`，每次 MessageInput 渲染时都会创建新引用。虽然 `useVoiceInput` 内部通过 `useEffect` 用 ref 保存了最新引用（useVoiceInput.ts:168-170），所以**功能上没问题**，但这是一个容易引入 bug 的模式。
- **修复建议**：将回调包装在 `useCallback` 中，消除不必要的 ref 更新副作用：

```tsx
const handleTranscribed = useCallback((transcribedText: string) => {
  setText((prev) => {
    const separator = prev.trim() ? ' ' : '';
    return prev + separator + transcribedText;
  });
}, []);

const { voiceState, errorMessage, voiceAvailable, startRecording, stopRecording, clearError } =
  useVoiceInput({ providers, onTranscribed: handleTranscribed });
```

> 注：当前 `useVoiceInput` 已有 ref 兜底，功能正确。此条为防御性建议。

#### [MEDIUM] requesting 和 transcribing 状态的 spinner SVG 完全重复，可抽取常量

- **文件**：`src/entrypoints/sidepanel/components/MessageInput.tsx:83-88` 和 `:105-110`
- **问题**：两处使用完全相同的 spinner SVG（24x24 圆弧动画），违反了 DRY 原则。
- **修复建议**：抽取为组件或常量：

```tsx
const SpinnerIcon = (
  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
    <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="2" opacity="0.75" />
  </svg>
);
```

#### [MEDIUM] 未覆盖 "发送按钮行为不受麦克风按钮影响" 的显式测试

- **文件**：`src/entrypoints/sidepanel/__tests__/MessageInput.test.tsx`
- **问题**：验收标准第 10 条"发送按钮行为不受麦克风按钮影响"缺少专门的测试用例。虽然有隐式验证（现有 7 个测试在 `providers={EMPTY_PROVIDERS}` 下全部通过），但缺少**录音中/转录中点击发送按钮**的显式场景。
- **修复建议**：补充一个测试：

```tsx
it('录音中点击发送按钮仍可正常发送', async () => {
  const onSend = vi.fn();
  mockUseVoiceInput.mockReturnValue({ ...defaultMock(), voiceState: 'recording' });

  render(
    <MessageInput onSend={onSend} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
  );

  const input = screen.getByTestId('message-input');
  await userEvent.type(input, 'hello during recording');
  await userEvent.click(screen.getByTestId('send-button'));

  expect(onSend).toHaveBeenCalledWith('hello during recording');
});
```

#### [LOW] `cancelRecording` 未在 MessageInput 中使用

- **文件**：`src/entrypoints/sidepanel/components/MessageInput.tsx:18`
- **问题**：`useVoiceInput` hook 返回了 `cancelRecording`，但 MessageInput 只解构了 `voiceState, errorMessage, voiceAvailable, startRecording, stopRecording, clearError`，未使用 `cancelRecording`。当前没有"取消录音"的 UI 入口（设计文档中 `cancelRecording` 定义为"取消录音（不转录）"）。
- **说明**：这是设计上的取舍，当前 UI 不提供取消按钮。属于已知的未实现功能，不影响功能完整性。后续可考虑在 recording 状态下增加取消按钮。

#### [LOW] 类型安全：mock 中使用 `as any` 和 `unknown[]`

- **文件**：`src/entrypoints/sidepanel/__tests__/MessageInput.test.tsx:12,14,37`
- **问题**：
  - `(result as any).__onTranscribed` — 使用 `any` 绕过类型检查
  - `EMPTY_PROVIDERS: any[]` — 应为 `ProviderConfig[]`
- **修复建议**：

```tsx
// 替代 any 类型断言
interface MockResult extends UseVoiceInputReturn {
  __onTranscribed: (text: string) => void;
}

function getLatestMockReturn(): MockResult {
  return mockUseVoiceInput.mock.results[mockUseVoiceInput.mock.results.length - 1].value as MockResult;
}

const EMPTY_PROVIDERS: ProviderConfig[] = [];
```

---

### 代码质量评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 安全性 | ✅ 通过 | 无硬编码密钥、无注入风险、无路径遍历 |
| 正确性 | ✅ 通过 | 所有验收标准满足，测试全部通过 |
| 性能 | ✅ 通过 | 无不必要的重渲染、无内存泄漏（useVoiceInput 有 cleanup） |
| 可维护性 | ⚠️ 良好 | 少量重复代码（spinner SVG），但不影响功能 |
| 测试覆盖 | ✅ 良好 | 15 个测试覆盖核心路径，缺少取消录音和边界场景 |
| 代码规范 | ✅ 通过 | 命名清晰、TypeScript 类型完整、符合项目风格 |

---

### 设计文档对照

与 `docs/design/voice-input-mode.md` 对照：

- ✅ MessageInput Props 扩展 `providers: ProviderConfig[]` — 一致
- ✅ 5 种状态渲染 — 一致（idle/requesting/recording/transcribing/error）
- ✅ textarea 不禁用 — 一致（"录音/转录过程中 textarea 不禁用"）
- ⚠️ 设计文档中提到"未配置 sttModel 时：按钮显示灰色禁用态，hover 提示'请先在设置中配置 STT 模型'" — 当前实现是**直接不渲染**麦克风按钮（`return null`），与设计文档略有差异。两种方案各有优劣：不渲染更干净，禁用态能引导用户去设置。**当前实现可接受**，但建议与产品确认。

---

### 测试建议

建议补充以下测试用例（非阻塞）：

1. **发送按钮 + 录音共存场景**：录音中/转录中输入文本并点击发送，验证不受影响
2. **空文本转写**：onTranscribed 接收空字符串，验证 textarea 不会多出多余空格
3. **快速切换状态**：idle → requesting → recording → 再快速切回 idle，验证无异常
4. **default case 覆盖**：voiceState 为未知值时 renderMicButton 返回 null
5. **providers 变化**：providers 从有 sttModel 变为无 sttModel 时 voiceAvailable 更新

---

### 审查结论

**✅ 通过（Approve）**

无 Critical 或 High 级别问题。3 个 Medium 问题均为非阻塞性改进建议（回调优化、代码复用、测试补充），4 个 Low 问题为代码风格和已知未实现功能说明。

所有 13 条验收标准均满足，15 个测试全部通过，变更范围控制在 3 个文件内，无越界修改。

---

### 审查检查清单

- [x] 变更范围与 Issue #98 匹配
- [x] 无硬编码密钥/密码/token
- [x] 无 SQL 注入风险
- [x] 无路径遍历风险
- [x] 错误状态有恰当处理
- [x] 空值/null 情况已处理
- [x] 函数体长度合理（renderMicButton 约 80 行，可接受）
- [x] 文件大小合理（MessageInput.tsx: 184 行）
- [x] 嵌套深度合理（最深 3 层）
- [x] 无修改方案允许范围外的文件
- [x] 现有测试无回归
- [x] TypeScript 类型完整
