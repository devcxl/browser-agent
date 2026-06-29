# 开发文档: T1 - 创建类型定义 + 中英文语言包

**Project:** i18n-国际化支持
**Task ID:** T1
**Slug:** create-i18n-types-and-locales
**Issue:** #106
**类型:** frontend
**Batch:** 1
**依赖:** 无

## 1. 目标

创建 i18n 核心类型定义 (`types.ts`) 和完整的中/英文语言包 JSON 文件，覆盖所有组件现有的硬编码中文文本。

## 2. 前置条件

- 无外部依赖
- 需要了解项目现有目录结构：`src/entrypoints/sidepanel/`
- 需要阅读 `docs/design/i18n-国际化支持.md` 中的 `MessageSchema` 完整定义

## 3. 实现步骤

### 3.1 创建 `i18n/types.ts`

- **文件：** `src/entrypoints/sidepanel/i18n/types.ts`

关键逻辑：
- 定义 `Locale` 类型：`'zh-CN' | 'en'`
- 定义 `MessageSchema` 接口（完整定义见设计文档 4.1 节），包含以下命名空间：
  - `common` — 通用按钮/标签（发送、取消、确认、删除、保存、编辑等）
  - `app` — App 级别文本（标题、加载中、加载失败）
  - `sidebar` — 侧栏（会话列表、状态标签等）
  - `chat` — 聊天（输入框、消息气泡）
  - `settings` — 设置面板（Provider/Agent/Expert/Skills 四个 Tab）
  - `dialog` — 确认对话框
  - `browser` — 浏览器状态面板
  - `token` — Token 用量面板
  - `error` — 错误边界
  - `markdown` — Markdown 预览（独立入口用）
  - `voice` — 语音输入错误消息
- 定义 `I18nContextValue` 接口：
  ```typescript
  export interface I18nContextValue {
    locale: Locale;
    t: (key: string, vars?: Record<string, string | number>) => string;
    setLanguage: (lang: Locale) => Promise<void>;
  }
  ```

### 3.2 创建 `locales/zh-CN.json`

- **文件：** `src/entrypoints/sidepanel/locales/zh-CN.json`

关键逻辑：从下列组件中提取所有硬编码中文文本，按 `MessageSchema` 结构组织。

**文本提取清单（按命名空间）：**

| 命名空间.key | 中文文本 | 源文件 |
|---|---|---|
| `common.send` | 发送 | MessageInput.tsx |
| `common.cancel` | 取消 | ConfirmDialog.tsx, SettingsPanel.tsx |
| `common.confirm` | 确认 | ConfirmDialog.tsx |
| `common.delete` | 删除 | ConversationSidebar.tsx, SettingsPanel.tsx, SkillPanel.tsx |
| `common.save` | 保存 | SettingsPanel.tsx |
| `common.edit` | 编辑 | SettingsPanel.tsx |
| `common.add` | 添加 | SettingsPanel.tsx, SkillPanel.tsx |
| `common.close` | 关闭 | (通用) |
| `common.loading` | 加载中... | ConversationSidebar.tsx, BrowserStatePanel.tsx |
| `common.error` | 错误 | BrowserStatePanel.tsx |
| `common.noData` | 无数据 | BrowserStatePanel.tsx |
| `common.enabled` | 启用 | SkillPanel.tsx, SettingsPanel.tsx |
| `common.retry` | 重试 | (预留) |
| `app.title` | BrowserAgent | App.tsx header |
| `app.loadingMessages` | 加载消息中... | App.tsx |
| `app.loadFailed` | 加载失败 | App.tsx |
| `sidebar.title` | 会话 | ConversationSidebar.tsx |
| `sidebar.newChat` | + 新建 | ConversationSidebar.tsx |
| `sidebar.collapse` | 收起侧栏 | ConversationSidebar.tsx |
| `sidebar.expand` | 展开侧栏 | ConversationSidebar.tsx |
| `sidebar.settings` | 设置 | ConversationSidebar.tsx |
| `sidebar.noConversations` | 暂无会话 | ConversationSidebar.tsx |
| `sidebar.rename` | 重命名 | ConversationSidebar.tsx |
| `sidebar.delete` | 删除 | ConversationSidebar.tsx |
| `sidebar.input` | 输入 | ConversationSidebar.tsx |
| `sidebar.output` | 输出 | ConversationSidebar.tsx |
| `sidebar.total` | 总计 | ConversationSidebar.tsx |
| `sidebar.status.idle` | 就绪 | ConversationSidebar.tsx |
| `sidebar.status.running` | 运行中... | ConversationSidebar.tsx |
| `sidebar.status.streaming` | 输出中... | ConversationSidebar.tsx |
| `sidebar.status.waitingConfirmation` | 等待确认 | ConversationSidebar.tsx |
| `chat.input.placeholder` | 输入消息... (Enter 发送, Shift+Enter 换行) | MessageInput.tsx |
| `chat.input.disabledPlaceholder` | Agent 运行中... | MessageInput.tsx |
| `chat.input.abort` | 中止 | MessageInput.tsx |
| `chat.input.send` | 发送 | MessageInput.tsx |
| `chat.input.voiceInput` | 语音输入 | MessageInput.tsx title |
| `chat.input.requestingMic` | 正在请求麦克风权限... | MessageInput.tsx title |
| `chat.input.stopRecording` | 点击停止录音 | MessageInput.tsx title |
| `chat.input.transcribing` | 正在识别语音... | MessageInput.tsx title |
| `chat.input.voiceError` | 语音识别出错 | MessageInput.tsx title |
| `chat.message.showReasoning` | 查看思考过程 | MessageBubble.tsx |
| `chat.message.hideReasoning` | 收起思考过程 | MessageBubble.tsx |
| `chat.message.thinking` | 思考中... | MessageBubble.tsx |
| `chat.message.params` | 参数 | ToolCallCard.tsx / MessageBubble.tsx |
| `chat.message.result` | 结果 | ToolCallCard.tsx / MessageBubble.tsx |
| `settings.title` | 设置 | SettingsPanel.tsx |
| `settings.tabs.provider` | Provider | SettingsPanel.tsx |
| `settings.tabs.agent` | Agent | SettingsPanel.tsx |
| `settings.tabs.expert` | Expert Mode | SettingsPanel.tsx |
| `settings.tabs.skills` | Skills | SettingsPanel.tsx |
| `settings.provider.noProviders` | 暂无 Provider 配置 | SettingsPanel.tsx |
| `settings.provider.add` | + 添加 Provider | SettingsPanel.tsx |
| `settings.provider.test` | 测试 | SettingsPanel.tsx |
| `settings.provider.testing` | 测试中... | SettingsPanel.tsx |
| `settings.provider.trusted` | Trusted | SettingsPanel.tsx |
| `settings.provider.voiceModel` | 语音模型 | SettingsPanel.tsx |
| `settings.provider.audioFormat` | 输出 | SettingsPanel.tsx |
| `settings.provider.audioFormatHint` | 录音后统一转为指定格式再发送，留空则自动转 WAV | SettingsPanel.tsx |
| `settings.provider.trustedLabel` | Local Trusted Provider（标记为本地可信，可发送敏感数据） | SettingsPanel.tsx |
| `settings.provider.save` | 保存 | SettingsPanel.tsx |
| `settings.provider.cancel` | 取消 | SettingsPanel.tsx |
| `settings.provider.edit` | 编辑 | SettingsPanel.tsx |
| `settings.provider.delete` | 删除 | SettingsPanel.tsx |
| `settings.provider.placeholder.name` | 名称 | SettingsPanel.tsx |
| `settings.provider.placeholder.endpoint` | Endpoint (e.g. https://api.openai.com/v1) | SettingsPanel.tsx |
| `settings.provider.placeholder.apiKey` | API Key | SettingsPanel.tsx |
| `settings.provider.placeholder.model` | 模型 (e.g. gpt-4o) | SettingsPanel.tsx |
| `settings.provider.placeholder.sttModel` | 语音模型 (e.g. whisper-1) | SettingsPanel.tsx |
| `settings.provider.audioFormats` | (record: 各音频格式的 label) | SettingsPanel.tsx AUDIO_FORMATS |
| `settings.agent.maxToolRounds` | 最大工具调用轮次 | SettingsPanel.tsx |
| `settings.agent.maxContextMessages` | 上下文最大消息数 | SettingsPanel.tsx |
| `settings.agent.reasoningEffort` | 思考强度 | SettingsPanel.tsx |
| `settings.agent.reasoningEffortHint` | 控制 LLM 推理深度，越高越慢但越深入。仅支持 DeepSeek、OpenAI o1/o3 等推理模型。 | SettingsPanel.tsx |
| `settings.agent.systemPrompt` | 系统提示词 | SettingsPanel.tsx |
| `settings.agent.reasoningOptions.low` | Low（低） | SettingsPanel.tsx |
| `settings.agent.reasoningOptions.medium` | Medium（中） | SettingsPanel.tsx |
| `settings.agent.reasoningOptions.high` | High（高） | SettingsPanel.tsx |
| `settings.agent.reasoningOptions.max` | Max（最大） | SettingsPanel.tsx |
| `settings.expert.title` | Expert Mode | SettingsPanel.tsx |
| `settings.expert.subSwitchHint` | 子开关配置（功能灰度控制） | SettingsPanel.tsx |
| `settings.expert.addSwitch` | + 添加子开关 | SettingsPanel.tsx |
| `settings.skills.placeholder` | 输入 GitHub 仓库，如 owner/repo | SettingsPanel.tsx / SkillPanel.tsx |
| `settings.skills.add` | 添加 | SettingsPanel.tsx / SkillPanel.tsx |
| `settings.skills.configToken` | 配置 GitHub Token（选填，提高 API 限流） | SettingsPanel.tsx / SkillPanel.tsx |
| `settings.skills.hideToken` | 隐藏 Token | SettingsPanel.tsx / SkillPanel.tsx |
| `settings.skills.tokenPlaceholder` | ghp_xxx 或 github_pat_xxx | SettingsPanel.tsx / SkillPanel.tsx |
| `settings.skills.noSubscriptions` | 暂无订阅和技能，输入 GitHub 仓库地址添加 | SettingsPanel.tsx |
| `settings.skills.sync` | 同步 | SettingsPanel.tsx / SkillPanel.tsx |
| `settings.skills.syncing` | 同步中... | SettingsPanel.tsx / SkillPanel.tsx |
| `settings.skills.delete` | 删除 | SettingsPanel.tsx / SkillPanel.tsx |
| `settings.skills.skillsCount` | {{count}} 个技能 | SettingsPanel.tsx / SkillPanel.tsx |
| `settings.skills.localSkills` | 本地技能 | SkillPanel.tsx |
| `settings.skills.enabled` | 启用 | SkillPanel.tsx / SettingsPanel.tsx |
| `settings.skills.syncComplete` | 同步完成，共 {{count}} 个技能 | SettingsPanel.tsx / SkillPanel.tsx |
| `settings.skills.syncFailed` | 同步失败: {{error}} | SettingsPanel.tsx / SkillPanel.tsx |
| `settings.skills.subscriptionExists` | 该订阅已存在 | SettingsPanel.tsx / SkillPanel.tsx |
| `dialog.confirmTitle` | 确认操作 | ConfirmDialog.tsx |
| `dialog.tool` | 工具 | ConfirmDialog.tsx |
| `dialog.affectedObjects` | 影响对象 | ConfirmDialog.tsx |
| `dialog.type` | 类型 | ConfirmDialog.tsx |
| `dialog.title` | 标题 | ConfirmDialog.tsx |
| `dialog.reason` | 原因 | ConfirmDialog.tsx |
| `dialog.warnings` | 警告 | ConfirmDialog.tsx |
| `dialog.confirm` | 确认 | ConfirmDialog.tsx |
| `dialog.cancel` | 取消 | ConfirmDialog.tsx |
| `browser.title` | 浏览器状态 | BrowserStatePanel.tsx |
| `browser.loading` | 加载中... | BrowserStatePanel.tsx |
| `browser.error` | 错误 | BrowserStatePanel.tsx |
| `browser.noData` | 无数据 | BrowserStatePanel.tsx |
| `browser.windows` | 窗口 | BrowserStatePanel.tsx |
| `browser.tabs` | 标签页 | BrowserStatePanel.tsx |
| `browser.active` | 活跃 | BrowserStatePanel.tsx |
| `browser.windowLabel` | 窗口 | BrowserStatePanel.tsx |
| `token.title` | Token 用量 | TokenPanel.tsx |
| `token.input` | 输入 | TokenPanel.tsx |
| `token.output` | 输出 | TokenPanel.tsx |
| `token.total` | 总计 | TokenPanel.tsx |
| `token.noData` | -- | TokenPanel.tsx |
| `error.renderError` | 渲染出错 | ErrorBoundary.tsx |
| `markdown.invalidLink` | 无效链接 | markdown-viewer/index.ts |
| `markdown.contentExpired` | 内容已过期或不存在 | markdown-viewer/index.ts |
| `markdown.previewTitle` | Markdown Preview | markdown-viewer/index.ts |
| `voice.noSttModel` | 未配置语音模型，请在设置中为 Provider 添加 sttModel | useVoiceInput.ts |
| `voice.micDenied` | 麦克风权限被拒绝，请在浏览器设置中允许访问麦克风 | useVoiceInput.ts |
| `voice.noMic` | 未检测到麦克风设备 | useVoiceInput.ts |
| `voice.startFailed` | 无法启动录音: {{message}} | useVoiceInput.ts |
| `voice.providerLost` | Provider 配置丢失 | useVoiceInput.ts |
| `voice.transcribeFailed` | 语音识别失败: {{message}} | useVoiceInput.ts |

**模板变量说明：**
- `{{varName}}` 双大括号语法
- `settings.skills.skillsCount`：`"{{count}} 个技能"`
- `settings.skills.syncComplete`：`"同步完成，共 {{count}} 个技能"`
- `settings.skills.syncFailed`：`"同步失败: {{error}}"`
- `voice.startFailed`：`"无法启动录音: {{message}}"`
- `voice.transcribeFailed`：`"语音识别失败: {{message}}"`

### 3.3 创建 `locales/en.json`

- **文件：** `src/entrypoints/sidepanel/locales/en.json`
- Key 结构与 `zh-CN.json` 完全相同
- 提供英文翻译，参考对照：

| Key | 英文 |
|---|---|
| `common.send` | Send |
| `common.cancel` | Cancel |
| `common.confirm` | Confirm |
| `common.delete` | Delete |
| `common.save` | Save |
| `common.edit` | Edit |
| `common.add` | Add |
| `common.close` | Close |
| `common.loading` | Loading... |
| `common.error` | Error |
| `common.noData` | No Data |
| `common.enabled` | Enabled |
| `common.retry` | Retry |
| `app.title` | BrowserAgent |
| `app.loadingMessages` | Loading messages... |
| `app.loadFailed` | Load failed |
| `sidebar.title` | Conversations |
| `sidebar.newChat` | + New |
| `sidebar.collapse` | Collapse sidebar |
| `sidebar.expand` | Expand sidebar |
| `sidebar.settings` | Settings |
| `sidebar.noConversations` | No conversations |
| `sidebar.rename` | Rename |
| `sidebar.delete` | Delete |
| `sidebar.input` | Input |
| `sidebar.output` | Output |
| `sidebar.total` | Total |
| `sidebar.status.idle` | Ready |
| `sidebar.status.running` | Running... |
| `sidebar.status.streaming` | Streaming... |
| `sidebar.status.waitingConfirmation` | Awaiting confirmation |
| `chat.input.placeholder` | Type a message... (Enter to send, Shift+Enter for new line) |
| `chat.input.disabledPlaceholder` | Agent is running... |
| `chat.input.abort` | Abort |
| `chat.input.send` | Send |
| `chat.input.voiceInput` | Voice input |
| `chat.input.requestingMic` | Requesting microphone access... |
| `chat.input.stopRecording` | Click to stop recording |
| `chat.input.transcribing` | Transcribing... |
| `chat.input.voiceError` | Voice recognition error |
| `chat.message.showReasoning` | Show reasoning |
| `chat.message.hideReasoning` | Hide reasoning |
| `chat.message.thinking` | Thinking... |
| `chat.message.params` | Parameters |
| `chat.message.result` | Result |
| `settings.title` | Settings |
| `settings.tabs.provider` | Provider |
| `settings.tabs.agent` | Agent |
| `settings.tabs.expert` | Expert Mode |
| `settings.tabs.skills` | Skills |
| `settings.provider.noProviders` | No provider configured |
| `settings.provider.add` | + Add Provider |
| `settings.provider.test` | Test |
| `settings.provider.testing` | Testing... |
| `settings.provider.trusted` | Trusted |
| `settings.provider.voiceModel` | Voice Model |
| `settings.provider.audioFormat` | Output |
| `settings.provider.audioFormatHint` | Convert recording to specified format before sending. Leave empty to auto-convert to WAV. |
| `settings.provider.trustedLabel` | Local Trusted Provider (marked as trusted, may send sensitive data) |
| `settings.provider.save` | Save |
| `settings.provider.cancel` | Cancel |
| `settings.provider.edit` | Edit |
| `settings.provider.delete` | Delete |
| `settings.provider.placeholder.name` | Name |
| `settings.provider.placeholder.endpoint` | Endpoint (e.g. https://api.openai.com/v1) |
| `settings.provider.placeholder.apiKey` | API Key |
| `settings.provider.placeholder.model` | Model (e.g. gpt-4o) |
| `settings.provider.placeholder.sttModel` | Voice model (e.g. whisper-1) |
| `settings.provider.audioFormats` | (audio format labels — mostly codec names, keep as-is) |
| `settings.agent.maxToolRounds` | Max Tool Rounds |
| `settings.agent.maxContextMessages` | Max Context Messages |
| `settings.agent.reasoningEffort` | Reasoning Effort |
| `settings.agent.reasoningEffortHint` | Controls LLM reasoning depth. Higher is slower but more thorough. Only supported by DeepSeek, OpenAI o1/o3 and similar models. |
| `settings.agent.systemPrompt` | System Prompt |
| `settings.agent.reasoningOptions.low` | Low |
| `settings.agent.reasoningOptions.medium` | Medium |
| `settings.agent.reasoningOptions.high` | High |
| `settings.agent.reasoningOptions.max` | Max |
| `settings.expert.title` | Expert Mode |
| `settings.expert.subSwitchHint` | Sub-switch configuration (feature flags) |
| `settings.expert.addSwitch` | + Add switch |
| `settings.skills.placeholder` | Enter GitHub repo, e.g. owner/repo |
| `settings.skills.add` | Add |
| `settings.skills.configToken` | Configure GitHub Token (optional, increases API rate limit) |
| `settings.skills.hideToken` | Hide Token |
| `settings.skills.tokenPlaceholder` | ghp_xxx or github_pat_xxx |
| `settings.skills.noSubscriptions` | No subscriptions or skills. Enter a GitHub repo to add. |
| `settings.skills.sync` | Sync |
| `settings.skills.syncing` | Syncing... |
| `settings.skills.delete` | Delete |
| `settings.skills.skillsCount` | {{count}} skills |
| `settings.skills.localSkills` | Local Skills |
| `settings.skills.enabled` | Enabled |
| `settings.skills.syncComplete` | Sync complete, {{count}} skills |
| `settings.skills.syncFailed` | Sync failed: {{error}} |
| `settings.skills.subscriptionExists` | This subscription already exists |
| `dialog.confirmTitle` | Confirm Action |
| `dialog.tool` | Tool |
| `dialog.affectedObjects` | Affected Objects |
| `dialog.type` | Type |
| `dialog.title` | Title |
| `dialog.reason` | Reason |
| `dialog.warnings` | Warnings |
| `dialog.confirm` | Confirm |
| `dialog.cancel` | Cancel |
| `browser.title` | Browser State |
| `browser.loading` | Loading... |
| `browser.error` | Error |
| `browser.noData` | No data |
| `browser.windows` | Windows |
| `browser.tabs` | Tabs |
| `browser.active` | Active |
| `browser.windowLabel` | Window |
| `token.title` | Token Usage |
| `token.input` | Input |
| `token.output` | Output |
| `token.total` | Total |
| `token.noData` | -- |
| `error.renderError` | Render Error |
| `markdown.invalidLink` | Invalid link |
| `markdown.contentExpired` | Content expired or does not exist |
| `markdown.previewTitle` | Markdown Preview |
| `voice.noSttModel` | No voice model configured. Please add sttModel in Provider settings. |
| `voice.micDenied` | Microphone access denied. Please allow microphone access in browser settings. |
| `voice.noMic` | No microphone detected. |
| `voice.startFailed` | Failed to start recording: {{message}} |
| `voice.providerLost` | Provider configuration lost |
| `voice.transcribeFailed` | Transcription failed: {{message}} |

**注意：** `settings.provider.audioFormats` 是一个 Record 对象，其 key 是 MIME type 字符串，value 是显示文本。英文翻译中大部分格式名保持原样（如 "WebM Opus"），但 `"自动（推荐）— 统一转为 WAV 发送"` 需翻译为 `"Auto (recommended) — convert to WAV"`。

## 4. 接口/契约

### 4.1 新增接口

无 API 接口。仅类型定义和静态 JSON 文件。

### 4.2 数据模型变更

无数据库变更。

## 5. 测试指引

### 5.1 类型检查
- 运行 `npx tsc --noEmit`
- 预期结果：无类型错误，`MessageSchema` 类型定义与两个 JSON 文件结构一致

### 5.2 JSON 结构验证
- 编写脚本或手动检查 `zh-CN.json` 和 `en.json` 的顶层 key 完全一致
- 预期结果：所有 key 一一对应，无遗漏或多出
- 检查模板变量 `{{varName}}` 在两个语言包中保持一致（字符串内容不同但变量名相同）
- 预期结果：所有含 `{{` 的字符串在两个语言包中使用相同的变量名

### 5.3 文本覆盖检查
- 对照第 3.2 节的文本提取清单，确认 `zh-CN.json` 覆盖了所有源文件中的硬编码中文文本
- 预期结果：grep 所有 `.tsx` 和 `.ts` 文件查找中文字符，除 `zh-CN.json` 本身外应无其他硬编码中文（注释除外）

## 6. 验收标准

- [ ] `src/entrypoints/sidepanel/i18n/types.ts` 创建并通过 TypeScript 编译（`npx tsc --noEmit`）
- [ ] `src/entrypoints/sidepanel/locales/zh-CN.json` 覆盖所有组件的现有硬编码文本（见清单）
- [ ] `src/entrypoints/sidepanel/locales/en.json` 所有 key 与 `zh-CN.json` 完全对应，英文翻译正确
- [ ] 两个 JSON 文件不包含任何硬编码中文（除纯技术术语如 Provider、API Key 等外）
- [ ] 模板变量 key 在两个语言包中一致

## 7. 注意事项

- **`settings.provider.audioFormats` 是 Record 类型**：key 为 MIME type 字符串，不是嵌套对象。确保 JSON 结构和 TypeScript 类型匹配。
- **SkillPanel 和 SettingsPanel 中的 Skills Tab 有大量重复文本**：在语言包中只定义一份 `settings.skills.*`，两个组件共享使用。
- **`formatNum` 局部函数**：`ConversationSidebar.tsx` 和 `TokenPanel.tsx` 中各自定义了局部的 `formatNum` 函数，这个在 T4（utils 改造）中会统一到 `utils.ts`，本次无需处理。
- **ConversationSidebar 底部的 token 文本**：`输入 {{prompt}} / 输出 {{completion}} / 总计 {{total}}` 使用了模板变量 `prompt`、`completion`、`total`。由于 MessageSchema 中 `sidebar.input/output/total` 是简单字符串，这里应当使用 `sidebar.input`、`sidebar.output`、`sidebar.total` 组合拼接而不是在 JSON 中定义新的 key。
- **中英文字符长度差异**：英文翻译通常比中文长（例如 "同步完成，共 5 个技能" vs "Sync complete, 5 skills"），但 UI 布局应该不会破裂（使用了 `truncate` 和 flex 布局）。
