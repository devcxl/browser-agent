## 审查报告 — PR #126: T7 ChatView / MessageBubble / ToolCallCard 国际化

### 变更概述
- **分支**: `feat/i18n-chat-view` → `dev`
- **Issue**: #113
- **修改文件数**: 3
  - `src/entrypoints/sidepanel/components/ChatView.tsx` — 空状态文本国际化
  - `src/entrypoints/sidepanel/components/MessageBubble.tsx` — 推理过程相关文本国际化
  - `src/entrypoints/sidepanel/components/ToolCallCard.tsx` — 参数/结果标签国际化
- **风险等级**: 低 — 无 Critical/High 问题

---

### 审查要点逐项分析

#### 1. 硬编码中文文本替换

| 文件 | 原文本 | 替换为 | 验证 |
|------|--------|--------|------|
| ChatView.tsx | `开始对话，发送消息给 Browser Agent` | `t('chat.emptyState')` | ✅ |
| MessageBubble.tsx | `查看思考过程` | `t('chat.message.showReasoning')` | ✅ |
| MessageBubble.tsx | `收起思考过程` | `t('chat.message.hideReasoning')` | ✅ |
| MessageBubble.tsx | `思考中...` | `t('chat.message.thinking')` | ✅ |
| ToolCallCard.tsx | `参数: ` | `{t('chat.message.params')}: ` | ✅ |
| ToolCallCard.tsx | `结果: ` | `{t('chat.message.result')}: ` | ✅ |

共 6 处硬编码中文全部替换。注意 `参数: ` / `结果: ` 的冒号和空格在 `t()` 调用外部，与翻译值分离，设计正确。

#### 2. i18n key 定义检查

所有 key 均存在于 `MessageSchema` (types.ts) 和两个 JSON 语言包中：

| Key | zh-CN | en |
|-----|-------|----|
| `chat.emptyState` | "开始对话，发送消息给 Browser Agent" | "Start a conversation..." |
| `chat.message.showReasoning` | "查看思考过程" | "Show reasoning" |
| `chat.message.hideReasoning` | "收起思考过程" | "Hide reasoning" |
| `chat.message.thinking` | "思考中..." | "Thinking..." |
| `chat.message.params` | "参数" | "Parameters" |
| `chat.message.result` | "结果" | "Result" |

全部 ✅

#### 3. Props / 逻辑 / 样式变更检查

- 3 个组件均仅新增 `const { t } = useI18n()` 调用，Props 未变更 ✅
- 无逻辑变更（仅文本替换） ✅
- 样式无变更 ✅
- `ChatView.tsx` 缩进有微小变化（新增 1 空格），纯 cosmetic，不影响渲染 ✅

---

### 发现问题

无 Critical、High、Medium 问题。

---

### 测试建议

现有测试需要更新 mock 以包含 `I18nProvider`，否则 `useI18n()` 调用会抛出错误。建议在测试 setup 中统一处理。

---

### 审查结论

- [x] **通过** — 无问题

**备注**: 变更最小化、干净。3 个组件的文本替换正确，冒号和标点处理规范。
