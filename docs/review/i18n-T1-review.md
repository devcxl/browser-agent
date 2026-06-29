## 审查报告 — PR #119: T1 创建类型定义 + 中英文语言包

### 变更概述
- **分支**: `feat/create-i18n-types-and-locales` → `dev`
- **Issue**: #106
- **修改文件数**: 3（全部新增）
- **新增文件**:
  - `src/entrypoints/sidepanel/i18n/types.ts` — 类型定义
  - `src/entrypoints/sidepanel/locales/zh-CN.json` — 中文语言包
  - `src/entrypoints/sidepanel/locales/en.json` — 英文语言包
- **风险等级**: 中（存在需修复的 HIGH 问题）

### 自动化验证结果

| 检查项 | 结果 |
|--------|------|
| `npx tsc --noEmit` | ✅ 通过，无类型错误 |
| zh-CN leaf keys | ✅ 138 个 |
| en leaf keys | ✅ 138 个 |
| 中英文 key 一致性 | ✅ 一一对应，无遗漏 |
| 模板变量一致性 | ✅ 所有 `{{varName}}` 中英文一致 |
| JSON 格式有效性 | ✅ 两个文件均为合法 JSON |

---

### 发现问题

#### [HIGH] voice 命名空间消息与源码严重不符

**问题**: 6 个 voice 消息中，4 个与 `useVoiceInput.ts` 源码硬编码文本有实质性差异，丢失关键用户引导信息和错误详情。

**源码对照** (`src/entrypoints/sidepanel/hooks/useVoiceInput.ts`):

| Key | 源码实际文本 | PR zh-CN.json | 差异 |
|-----|------------|--------------|------|
| `voice.noSttModel` | `未配置语音模型，请在设置中为 Provider 添加 sttModel` | `未配置语音识别模型` | 丢失 "请在设置中为 Provider 添加 sttModel" 引导 |
| `voice.micDenied` | `麦克风权限被拒绝，请在浏览器设置中允许访问麦克风` | `麦克风权限被拒绝` | 丢失 "请在浏览器设置中允许访问麦克风" 引导 |
| `voice.startFailed` | `` 无法启动录音: ${error.message} `` | `录音启动失败` | 丢失 `{{message}}` 模板变量，用户无法看到具体错误原因 |
| `voice.transcribeFailed` | `` 语音识别失败: ${(err as Error).message} `` | `语音识别失败` | 丢失 `{{message}}` 模板变量 |

**英文对照同样存在问题**:
| Key | 源码预期英文 | PR en.json |
|-----|------------|-----------|
| `voice.noSttModel` | `No voice model configured. Please add sttModel in Provider settings.` | `No STT model configured` |
| `voice.micDenied` | `Microphone access denied. Please allow microphone access in browser settings.` | `Microphone permission denied` |
| `voice.startFailed` | `Failed to start recording: {{message}}` | `Failed to start recording` |
| `voice.transcribeFailed` | `Transcription failed: {{message}}` | `Speech recognition failed` |

**影响**: 当 i18n 系统替换硬编码字符串后，错误提示将失去可操作性——用户无法知道应该去设置中配置 STT 模型、去浏览器设置中允许麦克风权限、或查看具体错误原因。

**修复建议**:
```json
// zh-CN.json — 修复 voice 消息
"voice": {
  "noSttModel": "未配置语音模型，请在设置中为 Provider 添加 sttModel",
  "micDenied": "麦克风权限被拒绝，请在浏览器设置中允许访问麦克风",
  "noMic": "未检测到麦克风设备",
  "startFailed": "无法启动录音: {{message}}",
  "providerLost": "Provider 配置丢失",
  "transcribeFailed": "语音识别失败: {{message}}"
}

// en.json — 对应修复
"voice": {
  "noSttModel": "No voice model configured. Please add sttModel in Provider settings.",
  "micDenied": "Microphone access denied. Please allow microphone access in browser settings.",
  "noMic": "No microphone device detected",
  "startFailed": "Failed to start recording: {{message}}",
  "providerLost": "Provider configuration lost",
  "transcribeFailed": "Transcription failed: {{message}}"
}
```

**注意**: 修复后需同步更新 `types.ts` 中 `MessageSchema` 的 voice 部分（当前已是 `string` 类型，模板变量不改变类型，无需修改 types.ts）。

---

#### [HIGH] `settings.skills.noSubscriptions` 无法同时匹配 SkillPanel 和 SettingsPanel 的两种不同文本

**文件**: `src/entrypoints/sidepanel/locales/zh-CN.json:130`

**问题**: 源码中存在两个**不同的**硬编码文本，但只有一个 language key：

| 源文件 | 行号 | 实际硬编码文本 |
|--------|------|---------------|
| `SkillPanel.tsx` | 210 | `暂无订阅，输入 GitHub 仓库地址添加` |
| `SettingsPanel.tsx` | 566 | `暂无订阅和技能，输入 GitHub 仓库地址添加` |

PR 中 `settings.skills.noSubscriptions` = `"暂无订阅，输入 GitHub 仓库地址添加"`，仅匹配 SkillPanel 版本。SettingsPanel 的 "和技能" 部分会在 i18n 后丢失。

**修复建议**:
- **方案 A（推荐）**: 统一两个组件的空状态文案。SettingsPanel 的 Skills Tab 已同时展示订阅和本地技能，保留 `"暂无订阅，输入 GitHub 仓库地址添加"` 作为空状态文案仍然成立（因为下方还有本地技能区域）。只需修改 `SettingsPanel.tsx:566` 的硬编码文本与此一致。
- **方案 B**: 增加独立 key `settings.skills.noSubscriptionsOrSkills` 以区分两种场景。

如果选择方案 A（最小改动），本期无需修改 JSON，但需要在开发文档中标注此决策。

---

#### [MEDIUM] `sidebar.status.idle` 英文翻译与开发文档不一致

**文件**: `src/entrypoints/sidepanel/locales/en.json:28`

| 源文件 | zh-CN 源码 | PR zh-CN | PR en | 开发文档预期 en |
|--------|-----------|---------|-------|----------------|
| `ConversationSidebar.tsx:32` | `就绪` | `就绪` ✅ | `Idle` | `Ready` |

开发文档明确要求 `sidebar.status.idle` 英文为 `"Ready"`。`"Idle"` 在技术语境中更常见（如 CPU idle），但在状态标签场景下 `"Ready"` 对终端用户更友好。

**修复建议**: 将 `en.json` 中 `sidebar.status.idle` 改为 `"Ready"`，或与团队确认后保留 `"Idle"`（需更新开发文档）。

---

#### [MEDIUM] `settings.provider.audioFormat` 值与开发文档不同

**文件**: `src/entrypoints/sidepanel/locales/zh-CN.json:66`

| | 开发文档 | PR |
|--|---------|-----|
| zh-CN | `输出` | `输出格式` |
| en | `Output` | `Output Format` |

PR 选择 `"输出格式"` / `"Output Format"` 更准确地描述了表单字段的用途（选择音频输出格式）。但开发文档记录的是 `"输出"`。

**建议**: 确认此差异是有意修正（推荐保留 PR 值并更新开发文档），还是疏忽（改回开发文档值）。

---

#### [MEDIUM] `sidebar.newChat` 英文与开发文档不同

**文件**: `src/entrypoints/sidepanel/locales/en.json:17`

| 开发文档 | PR |
|---------|-----|
| `+ New` | `+ New Chat` |

`"+ New Chat"` 在语义上更完整。确认是否为有意修正。

---

#### [MEDIUM] 新增 key 不在开发文档提取清单中

以下 key 存在于 PR 中但开发文档的"文本提取清单"未列出（均为合理的源码提取，开发文档遗漏）：

| Key | zh-CN | 源码位置 |
|-----|-------|---------|
| `settings.language` | `界面语言` | (语言选择器，新增) |
| `settings.skills.panelTitle` | `技能管理` | `SkillPanel.tsx:142` |
| `settings.skills.subscriptions` | `订阅` | `SkillPanel.tsx:156` |
| `chat.emptyState` | `开始对话，发送消息给 Browser Agent` | `ChatView.tsx:64` |

**建议**: 更新开发文档的文本提取清单，补充以上 4 个 key 的完整信息。

---

#### [LOW] `markdown.previewTitle` 翻译简化

| | 开发文档 | PR |
|--|---------|-----|
| zh-CN | `Markdown Preview` | `预览` |
| en | `Markdown Preview` | `Preview` |

PR 的中译 `"预览"` 更符合中文 UI 习惯，英文 `"Preview"` 更简洁。确认是否为有意修正。

---

#### [LOW] `voice.providerLost` 文本差异

| 源码 | 开发文档 | PR zh-CN |
|------|---------|---------|
| `Provider 配置丢失` | `Provider 配置丢失` | `Provider 配置已变更或丢失` |

PR 增加 "已变更或" 丰富了错误提示。若为有意优化则保留，否则改回源码文本。

---

### 类型定义审查

**`types.ts` 质量评估: ✅ 通过**

- `Locale` 类型正确定义为 `'zh-CN' | 'en'`
- `MessageSchema` 接口结构与 JSON 文件完全一致
- `settings.provider.audioFormats: Record<string, string>` 类型与 JSON 中 `"auto"`, `"webm_opus"` 等 key 匹配
- `I18nContextValue` 接口定义完整：`locale`, `t()`, `setLanguage()`
- 无循环引用、无 `any` 类型滥用
- 无安全风险（无密钥、凭证硬编码）

---

### 测试建议

1. **voice 消息模板变量回归**: 修复 voice 消息后，确认 `{{message}}` 在两个语言包中变量名一致（当前已验证，修复后需重新验证）
2. **SettingsPanel noSubscriptions 空状态**: 修复后应验证 SettingsPanel 的 Skills Tab 空状态文案与 SkillPanel 一致或按方案 B 正确区分
3. **TypeScript 类型守卫测试**: 建议后续 T2/T3 编写测试验证 `MessageSchema` 类型与 JSON 实际结构的 assignability

---

### 审查结论

- [ ] 通过 — 无 Critical/High 问题
- [x] **有条件通过 — 存在 2 个 HIGH 问题需修复**
- [ ] 不通过

**必须修复（HIGH）**:
1. voice 命名空间全部消息需与源码 `useVoiceInput.ts` 硬编码文本对齐
2. `settings.skills.noSubscriptions` 需处理两个组件文本不一致的问题

**建议修复（MEDIUM/LOW）**:
- `sidebar.status.idle` 英文翻译确认
- `settings.provider.audioFormat` 值确认
- 开发文档提取清单补充遗漏 key

修复后重新请求审查。
