---
parent_issue: 135
phase: 5
dependencies: ["Phase 1.3"]
status: done
estimated_lines: -200
---

# Task 5.1: 删除 ProviderClientFactory 冗余逻辑

## 目标
将 `ProviderClientFactory`（342 行）精简为 `ProviderRegistry`（目录查询 + 模型创建），删除消息格式适配层。

## 实现要点
1. 新建 `src/provider/provider-registry.ts`
2. 保留：提供者路由（npm 包名 → 模块加载）、模型列表查询
3. 删除的方法：
   - `mapMessagesToPrompt()` — AI SDK 直接接收 `CoreMessage`
   - `mapOpenAITools()` — AI SDK 直接接收 `tool()` 对象
   - `mapReasoningEffort()` — `LanguageModelV1` 原生支持
   - 流式 chunk 适配逻辑 — `streamText()` 原生流式
4. 实现 `createModel(config, modelId)` 方法：
   ```typescript
   switch (moduleName) {
     case '@ai-sdk/openai': return createOpenAI(config).chat(modelId);
     case '@ai-sdk/anthropic': return createAnthropic(config).chat(modelId);
     default: return createOpenAICompatible(config).chat(modelId);
   }
   ```
5. 保留 `getModels()` 用于模型列表查询

## 验收标准
- [x] `ProviderRegistry.createModel()` 支持所有 14 个 Provider
      实现落在 `src/provider/language-model.ts`（`createLanguageModel`），
      `ToolLoopAdapter` 与 `LlmClient` 共用。
- [x] `getModels()` 返回正确的模型列表（并入 `ProviderCatalog.getModels`）
- [x] 消息格式适配代码完全删除
- [x] 单元测试：所有 Provider 创建模型正确
      （`src/provider/__tests__/language-model.test.ts`）
- [ ] 集成测试：跨 Provider 工具调用正常
      未覆盖：需要真实第三方 provider 凭据，当前无可用环境。

## 完成记录（2026-09-19）

- 新增 `src/provider/language-model.ts`：npm → AI SDK 模块路由，统一 baseURL /
  apiKey / headers 语义。方法名统一用 `languageModel()`——运行时探测确认仅
  `openai-compatible` 提供 `chatModel`。
- `ToolLoopAdapter.createModel` 改为委托，修复了此前忽略 `ProviderConfig.npm`、
  导致 Anthropic / Google / Cohere 在聊天中不可用的缺陷。
- 删除 `ProviderClientFactory`（344 行）与 `provider-client-factory.test.ts`；
  `LlmClient` 改为基于 `generateText`，`ILlmClient` 收敛为单个 `chat`。
