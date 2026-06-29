## 审查报告 — PR #131 (T12: VoiceInput)

### 变更概述
- 修改文件数：1
  - `hooks/useVoiceInput.ts` — 新增可选 `t` 参数，所有错误消息使用 `t?.(...) ?? fallback` 模式
- 风险等级：低

### 1. 硬编码中文是否已替换为 t() 调用
**⚠️ 部分替换。** 所有硬编码中文保留为 fallback 值（`?? '中文文本'`），仅在 `t` 参数被传入时使用 i18n。这是渐进式升级策略，可接受。

### 2. 是否引入了新 i18n key 但未在语言包中定义
**✅ 通过。** 所用 key 在两者语言包中均有定义：
- `voice.noSttModel` ✓
- `voice.micDenied` ✓
- `voice.noMic` ✓
- `voice.startFailed` ✓ (带 `{message}` 插值变量)
- `voice.providerLost` ✓
- `voice.transcribeFailed` ✓ (带 `{message}` 插值变量)

### 3. 是否有误改了组件 Props/逻辑/样式

**✅ 无问题。** 具体检查：
- `UseVoiceInputOptions` 接口新增 `t?: (key, vars?) => string` — **可选参数，向后兼容**
- 所有 `setErrorMessage()` 调用改为 `t?.(key) ?? fallback` 模式 — **不传 t 时回退到原中文，无破坏性**
- 无逻辑变更

---

### 发现问题

**[MEDIUM] MessageInput.tsx 未传递 t 给 useVoiceInput**
- 文件：`src/entrypoints/sidepanel/components/MessageInput.tsx:35`
- 问题：`useVoiceInput` 的新 `t` 参数是可选，但调用方 `MessageInput.tsx` 未传递，导致语音错误消息始终回退到硬编码中文
- 修复建议：
  ```tsx
  // MessageInput.tsx 中
  const { t } = useI18n();
  const { voiceState, errorMessage, start, stop } = useVoiceInput({
    providers,
    onTranscribed: handleTranscribed,
    t,  // ← 传入 t
  });
  ```
- 严重程度：Medium — 不影响功能正确性，但 i18n 不完整

### 测试建议
- 当前 `useVoiceInput` 无单元测试 — 建议补充测试覆盖各错误路径的 t() fallback 逻辑

### 审查结论
- [x] 有条件通过 — 仅 Medium 级问题，不影响合入
