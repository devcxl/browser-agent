# PRD: Voice Input Mode

**日期:** 2026-06-24
**状态:** Draft

## 1. 概述

### 1.1 问题陈述

当前 Browser Agent 插件仅支持文本输入与 Agent 交互。用户在浏览网页时需要手动打字输入指令，操作效率低，尤其是在多标签页管理、快速语音命令等场景下，缺少一种更自然、更快捷的输入方式。

### 1.2 目标用户

- 使用 Browser Agent 插件进行标签页管理的用户
- 希望通过语音快速下达指令的用户
- 文本输入不便时（如手持设备、触屏设备）需要替代输入方式的用户

### 1.3 成功指标

- 用户可通过麦克风按钮点击录音，再次点击停止并获取转录文本
- 转录文本自动填入消息输入框，用户确认后发送
- 支持 Chrome 和 Firefox 两个浏览器平台
- 使用 OpenAI 兼容的 `/v1/audio/transcriptions` 端点进行语音识别

## 2. 功能需求

### 2.1 核心功能（MVP）

- [ ] F1: 在 MessageInput 组件中添加麦克风按钮，点击开始录音，再次点击停止录音
- [ ] F2: 录音过程中显示录音状态指示（如波纹动画/计时器）
- [ ] F3: 停止录音后将音频发送到 OpenAI 兼容的 `/v1/audio/transcriptions` 端点进行转录
- [ ] F4: 转录成功后将文本填入消息输入框，由用户确认编辑后发送
- [ ] F5: ProviderConfig 扩展可选 `sttModel` 字段，复用现有 Provider 的 endpoint/apiKey
- [ ] F6: Settings 面板中 Provider 编辑表单新增 STT 模型字段
- [ ] F7: 转录失败时给出错误提示并恢复可录音状态

### 2.2 扩展功能（后续迭代）

- [ ] E1: 录音时长上限提示（避免过长录音）
- [ ] E2: 语音活动检测（VAD），自动停止录音
- [ ] E3: 多语言转录支持（language 参数配置）

### 2.3 非功能需求

- 性能：录音到转录完成应在 5 秒内（含网络传输，不含用户说话时长）
- 安全：API Key 不暴露到前端日志；音频数据仅在内存中暂存，不持久化
- 可用性：录音状态清晰可见；录音/转录过程中输入框不被禁用
- 兼容性：Chrome MV3 + Firefox MV3 双端支持
- 隐私：仅在用户主动点击录音时采集麦克风音频，不后台监听

## 3. 用户故事

### US-1: 语音输入消息

**作为** Browser Agent 用户
**我想要** 点击麦克风按钮录音，再次点击停止并自动转录为文字
**以便** 快速通过语音向 Agent 下达指令，免去手动打字

**验收标准：**
- [ ] MessageInput 中有可见的麦克风按钮
- [ ] 点击麦克风按钮开始录音，按钮状态切换为"录音中"
- [ ] 录音中再次点击麦克风按钮停止录音
- [ ] 停止录音后自动调用 STT API 转录
- [ ] 转录成功后文本填入输入框，光标聚焦输入框
- [ ] 录音中可随时点击取消（中止录音不转录）

### US-2: STT Provider 配置

**作为** 配置了 OpenAI 兼容 Provider 的用户
**我想要** 为 Provider 配置 STT 模型
**以便** 复用同一 Provider 的 endpoint/apiKey 进行语音转录

**验收标准：**
- [ ] Settings → Provider 编辑表单中新增"STT 模型"输入框
- [ ] STT 模型字段可选，留空时不可用语音功能
- [ ] 已配置的 Provider 编辑时可填写 sttModel
- [ ] sttModel 持久化到 chrome.storage.local

### US-3: 转录错误处理

**作为** 使用语音输入的用户
**我想要** 在转录失败时收到清晰的错误提示
**以便** 了解失败原因并重试

**验收标准：**
- [ ] 网络错误、API 鉴权失败、音频格式不支持等场景显示对应错误消息
- [ ] 错误提示在输入框附近展示，不阻塞后续操作
- [ ] 出错后麦克风按钮恢复为可点击状态

## 4. 约束与假设

### 4.1 技术约束

- 使用浏览器原生 `MediaRecorder` API 采集音频
- 使用 `getUserMedia` 请求麦克风权限（sidepanel 在普通标签页中打开，`getUserMedia` 可用）
- 音频格式优先使用 `audio/webm`（Chrome/Firefox 均支持），OpenAI transcription API 支持 webm
- STT 请求使用 `multipart/form-data`，发送 `File` 对象
- 不引入额外的音频处理库

### 4.2 业务约束

- STT 功能依赖用户已配置至少一个 Provider 且填写了 sttModel
- 若未配置 sttModel，麦克风按钮显示禁用态并提示用户去设置

### 4.3 假设

- 用户使用的 OpenAI 兼容端点支持 `/v1/audio/transcriptions` 接口
- 用户的浏览器支持 `MediaRecorder` API（Chrome 47+, Firefox 88+ 均满足）
- 录音时长合理（用户手动控制开始/停止，无需自动截断）

## 5. 不在范围内

- TTS（文字转语音）— 不做
- 语音活动检测（VAD）自动停止 — 后续迭代
- 后台持续监听 / 唤醒词触发 — 不做
- 多语言转录 language 参数配置 — 后续迭代
- 录音文件持久化存储 — 不做

## 6. 附录

- OpenAI Audio API 文档: https://platform.openai.com/docs/api-reference/audio/createTranscription
- MediaRecorder API: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- 当前 ProviderConfig 定义: `src/shared/types/llm.ts`
- 当前 MessageInput 组件: `src/entrypoints/sidepanel/components/MessageInput.tsx`
- 当前 SettingsPanel 组件: `src/entrypoints/sidepanel/components/SettingsPanel.tsx`
- 当前 LlmClient 实现: `src/provider/llm-client.ts`
