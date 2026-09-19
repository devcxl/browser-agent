# ADR: 自研 Agent 管线迁移到 AI SDK v7

- **日期**: 2026-07-17
- **状态**: Implemented（Task 5.1 / 5.2 于 2026-09-19 完成，见「后续行动」）
- **决策者**: Felix
- **相关**: [技术方案](../dev/specs/ai-sdk-migration.md)

---

## 背景

当前项目 `browser-agent-extension` 拥有 ~2300 行自研代码用于 Agent 循环、Guardrail、STT、Chat UI 和 Provider 适配。这些模块在 AI SDK v3 时代因 SDK 能力不足而自行实现。AI SDK 已迭代到 v7（`ai@^7.0.29`），内置了等效能力：

| 自研模块 | 行数 | AI SDK v7 对应能力 |
|----------|------|-------------------|
| `AgentLoop` | 508 | `ToolLoopAgent` + `streamText()` |
| `ContextBuilder` | 321 | `prepareStep` + `pruneMessages` |
| `Guardrail`（确认流程部分）| ~60 | `toolApproval` 回调 |
| `SttClient` + `audio-utils` | 185 | `transcribe()` |
| `ProviderClientFactory`（格式化部分）| ~200 | AI SDK 原生 `LanguageModelV1` |
| `useAgent` + Chat UI | ~540 | `useChat` + `DirectChatTransport` |
| **合计** | **~1900+** | **AI SDK 原生** |

此外，当前自研的消息格式适配层（`mapMessagesToPrompt`、`mapOpenAITools`）与 AI SDK 核心类型不兼容，每次 SDK 升级都需维护这层胶水代码。

## 决策

**逐步将自研 Agent 管线迁移到 AI SDK v7 原生能力**，分 5 个 Phase 执行，通过 Feature Flag 控制并行运行和回滚。

### 核心决策点

1. **使用 `ToolLoopAgent` 替代 `AgentLoop`**
   - AI SDK 原生管理 tool call 循环、stopWhen 条件、错误重试
   - 自定义 `prepareStep` 保留上下文管理逻辑
   - 通过 `toolApproval` 回调接入 Guardrail 风险控制

2. **保留 Guardrail 策略引擎，丢弃确认流程控制**
   - Guardrail 保留 `evaluateRisk` 和 `filterResultForRemote`
   - 删除 `requiresConfirmation` 字段和确认流程逻辑
   - 确认流程由 `toolApproval` 回调驱动

3. **工具定义保持 JSON Schema，通过转换器适配 Zod**
   - 40+ 现有工具不动，通过 `jsonSchemaToZod()` 转换为 AI SDK 的 `tool()` 参数
   - 依赖 `json-schema-to-zod`（~5KB min+gz）或手动实现精简版

4. **使用 `useChat` + `DirectChatTransport` 替代自定义 Chat UI**
   - 服务端无关传输层（浏览器环境无 Node.js 后端）
   - AI SDK 原生管理消息类型（text/tool-call/tool-result/reasoning）

5. **使用 `transcribe()` 替代自研 `SttClient`**
   - 消除 185 行 WAV 编码和手动 fetch 逻辑
   - 通过 AI SDK 的 provider 抽象获得多提供者转录支持

6. **Provider 层精简为目录查询**
   - 删除消息格式适配层（`mapMessagesToPrompt`、`mapOpenAITools`）
   - 删除流式响应适配逻辑
   - 保留 `ProviderCatalog` 用于模型列表查询

7. **暂不引入 `@ai-sdk/policy-opa`**
   - WASM 体积 ~500KB，对浏览器扩展包体积影响大
   - 现有 Guardrail 规则覆盖充分
   - 未来评估：待 AI SDK 稳定后考虑替代 Guardrail 的 `evaluateRisk`

## 替代方案

### 方案 A: 全量激进迁移（不采用）
一次移除所有自研代码，直接切换到 AI SDK v7。

**优点**: 最快消除维护负担  
**缺点**: 高风险，任何 bug 都会阻塞所有用户；无回滚路径；破坏现有测试

### 方案 B: 保持现状（不采用）
不迁移，继续维护自研管线。

**优点**: 零风险  
**缺点**: 持续维护 ~2300 行胶水代码；每次 AI SDK 升级需适配消息格式；落后于生态发展

### 方案 C: 选择性迁移（不采用）
仅迁移 STT 和 Provider，保留 AgentLoop 和 Guardrail。

**优点**: 风险最低  
**缺点**: 消除代码量有限（~400 行）；核心复杂度仍在 AgentLoop 和 UI；两个子系统互不兼容

### 方案 D: 逐步 Feature Flag 迁移（✅ 采用）
分 5 Phase，Phase 间可独立回滚，旧代码与 AI SDK 并行运行 2 周后移除。

**优点**: 可控风险、可回滚、可 A/B 验证、渐进式交付  
**缺点**: 迁移周期较长（5-7 工作日）；短期存在新旧两套代码并行维护

## 影响

### 代码层面
- **删除**: `AgentLoop`、`ContextBuilder`、`SttClient`、`audio-utils`、`ProviderClientFactory` 消息适配部分
- **修改**: `Guardrail`（精简）、`useAgent`（重写为 ToolLoopAdapter 桥接）、Chat UI 组件
- **新增**: `ToolLoopAdapter`、`jsonSchemaToZod`、`DirectChatTransport`、`ProviderRegistry`
- **不变**: 所有 `src/tools/` 工具定义、`ConversationManager`、JSON-RPC 客户端、Storage、Skill 系统

### 依赖变化
- **无新增 npm 依赖**：AI SDK v7 已依赖 Zod；`json-schema-to-zod` 可选（可自实现精简版）
- **移除依赖待定**：`@ai-sdk/anthropic`、`@ai-sdk/cohere` 等 provider 包可等到所有用户迁移完后移除（当前 AgentLoop 仍通过 `ProviderClientFactory` 使用它们）

### 向后兼容
- `ProviderConfig` 类型不变
- `AgentSettings` (AgentConfig) 类型增加可选字段，旧字段保持
- `IToolRegistry` 接口不变（`toOpenAISchema()` 保留，新增 `toAISdkTools()`）
- `IGuardrail` 接口精简（删除 `requiresConfirmation` 但从 `evaluateRisk` 返回时仍可计算），通过 `toolApproval` 回调替代
- Session 存储格式不变（ConversationManager 不变）

### 风险
1. **AI SDK v7 API 不稳定**：锁定版本，延迟更新直到社区验证
2. **JSON Schema → Zod 转换覆盖不全**：先验证所有 40+ 工具 schema 可转换
3. **toolApproval 确认流程行为差异**：A/B 并行运行验证
4. **包体积增长**：测量增量，如 `json-schema-to-zod` 过大则手写精简版

---

## 后续行动

1. [x] T0.1: 实现 `jsonSchemaToZod` 转换器并验证所有工具 schema
2. [x] T1.1: 实现 `ToolLoopAdapter` 并通过 Feature Flag 并行运行
3. [ ] 测量 AI SDK v7 迁移后的包体积增量
4. [ ] 评估 `@ai-sdk/policy-opa` 在未来版本中替代 Guardrail 的可行性
5. [x] 全部 Phase 完成后，移除旧代码和 Feature Flag

### Task 5.1 / 5.2 完成记录（2026-09-19）

**交付**：

- 删除旧 Agent 管线：`ContextBuilder`、`SummaryManager`、`@/agent` barrel；
  上下文裁剪与摘要由 `prepareStep` + `pruneMessages` 与 `compactConversation`
  （AI SDK `generateText`）承担。
- 删除随之孤立的 `ConversationManager.generateSummary` / `needsSummary`。
- 移除 `FEATURE_FLAGS` 全部三个开关，改为直连（三者已恒为 true）。
- STT 收敛到 AI SDK `transcribe()`，删除 `audio-utils` 与手动 fetch/WAV 路径；
  移除从未启用的 `useSDKTranscribe`。
- 新增 `src/provider/language-model.ts` 承载 provider 路由，`ToolLoopAdapter`
  与 `LlmClient` 共用；删除 `ProviderClientFactory` 与其 Chat Completions
  适配层（`mapMessagesToPrompt` / `mapOpenAITools` / chatStream chunk 适配）。
- 删除未使用的 `@ai-sdk/react` 依赖；`toOpenAISchema` / `OpenAIToolSchema` 一并移除。

**顺带修复**：

- `ToolLoopAdapter.createModel` 此前硬编码 `createOpenAICompatible` 并忽略
  `ProviderConfig.npm`，导致向导中选择的 Anthropic / Google / Cohere 在聊天中
  不可用；现按 `npm` 路由。
- STT 旧 fetch 路径把 catalog 中已含 `/v1` 的 endpoint 再拼 `/v1/audio/transcriptions`，
  产生 `/v1/v1/...`；SDK 路径与 chat 路径 baseURL 语义一致。

**验证**：`tsc` 0 错误、`eslint` 0 error、`vitest` 1431 通过、覆盖率 99.76%、
`build:all` Chrome / Firefox 双构建成功；CI（Lint + Test）与 Build (Package)
两个 workflow 在 master 上均为 success。

### 遗留项清理（2026-09-19 后续提交）

上述「未纳入本次」的四项已处理：

- 删除 `SkillPanel` / `TokenPanel` / `BrowserStatePanel` / `ToolCallCard` 及
  其测试，连带孤立的 `useBrowserState` 与 `ChatContext.browserState`。
  `SkillPanel` 的功能已在 `a47fe83` 迁入 `SettingsPanel` 的 Skills tab
  （并已从手工创建重构为 GitHub 订阅制）。
- 修复浮动按钮真实缺陷：`.panel-container` 与 `.float-btn` 的 z-index 均为
  2147483647 且面板全高，面板打开后覆盖按钮区域，使「再点按钮关闭面板」
  不可达（违反 spec §7.3）。现面板为 2147483646、按钮为 2147483647，
  并新增断言从 CSS 源校验二者相对关系。
- 修复 e2e 运行链路（此前完全无法运行且未接入 CI）：ESM `__dirname`、
  `channel: 'chromium'`（headless shell 不支持 `--load-extension`）、
  穿透 closed shadow root 的 CDP 断言方案、`page.frames()` 替代受 sandbox
  限制的 `window.frames`、SSE 格式的 LLM mock（Agent 走
  `ToolLoopAgent.stream()`，普通 JSON 无法解析）、i18n 迁移后的文案与
  provider seed 数据；删除无断言的 `chat-flow.spec.ts` 与已失效的
  `skill-system` E2E-1..4。
- e2e 接入 CI（新增 `e2e` job），避免再次静默腐烂。

**验证**：`eslint` 0 error、`vitest` 1408 通过、覆盖率 99.76%；
CI 三个 job（lint / test / e2e）与 Build (Package) 均为 success。
