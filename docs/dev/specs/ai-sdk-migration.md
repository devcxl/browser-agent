# AI SDK v7 迁移技术方案

> 状态：Proposed  
> 日期：2026-07-17  
> 目标：将自研 Agent Loop / Guardrail / STT / Chat UI / Provider Factory 迁移到 AI SDK v7 原生能力，减少自研代码 ~1400 行，同时保持向后兼容。

---

## 1. 迁移总体架构

### 1.1 当前架构（迁移前）

```
┌─────────────────────────────────────────────────────────────────┐
│  Side Panel (React)                                             │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐ │
│  │  Chat UI 组件     │  │  useAgent.ts (338行)                  │ │
│  │  ~200 行          │  │  - 手动调用 AgentLoop.run()           │ │
│  │  - 消息渲染       │  │  - onStreamChunk → UIMessage 转换     │ │
│  │  - 确认弹窗       │  │  - onToolCall → ToolCallDisplay       │ │
│  │  - 语音输入       │  │  - onConfirm → waitForUserConfirm     │ │
│  └──────────────────┘  │  - abort() 控制                        │ │
│                        └──────────────────────────────────────┘ │
│                                    │                             │
│                                    ▼                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  AgentLoop (508行)                                           ││
│  │  while(true) {                                               ││
│  │    messages = ContextBuilder.build(...)                      ││
│  │    llmClient.chatStream(messages, tools, onChunk)            ││
│  │    if finishReason !== 'tool_calls' → break                  ││
│  │    for each tool_call:                                       ││
│  │      guardrail.check(tool, params) → preflight → confirm     ││
│  │      tool.execute(params) → guardrail.filterResult()         ││
│  │      messages.push(tool_result)                              ││
│  │  }                                                           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                    │                             │
│              ┌─────────────────────┼─────────────────────┐       │
│              ▼                     ▼                     ▼       │
│  ContextBuilder (321行)   Guardrail (138行)     SttClient (112行)│
│  - token预算截断          - risk评估(gate)      - fetch API调用  │
│  - 微压缩                 - preflight检查       - WAV编码转换    │
│  - 序列修复               - 确认窗控制          - 超时处理       │
│                           - 敏感数据过滤                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ProviderClientFactory (342行)                                   │
│  - 14个提供者 → 统一 doGenerate/doStream                        │
│  - 消息格式适配（ChatMessage ↔ AI SDK prompt格式）              │
│  - reasoning_effort 映射                                        │
│  - tool schema 映射 (OpenAIToolSchema → inputSchema)            │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 目标架构（迁移后）

```
┌─────────────────────────────────────────────────────────────────┐
│  Side Panel (React)                                             │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  useChat() (AI SDK v7 原生)                                  ││
│  │  - messages, sendMessage, status, error, stop                ││
│  │  - 自动管理 UIMessage 流                                     ││
│  │  - DirectChatTransport → 无服务端                            ││
│  └──────────────────────────────────────────────────────────────┘│
│                                    │                             │
│                                    ▼                             │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  ToolLoopAgent (AI SDK v7 原生)                              ││
│  │  - streamText({ tools, maxSteps, stopWhen, prepareStep })    ││
│  │  - toolApproval 回调 → 替代 Guardrail                        ││
│  │  - prepareStep → 替代 ContextBuilder                         ││
│  │  - 自动 tool 执行 + 结果注入循环                              ││
│  └──────────────────────────────────────────────────────────────┘│
│                                    │                             │
│              ┌─────────────────────┼─────────────────────┐       │
│              ▼                     ▼                     ▼       │
│  Guardrail(保留)        transcribe()          ProviderCatalog    │
│  - 仅做 risk 映射       (AI SDK v7 原生)     (精简为目录查询)    │
│  - toolApproval 适配器  - 多提供者转录       - 直接用 AI SDK     │
│                         - 消除自研 STT        createXxx()        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 关键变化对照表

| 模块 | 迁移前 | 迁移后 | 代码量变化 |
|------|--------|--------|-----------|
| Agent 循环 | `AgentLoop` (508行) 手动循环 | `ToolLoopAgent` (AI SDK) | **-508** |
| 上下文管理 | `ContextBuilder` (321行) | `prepareStep` + `pruneMessages` | **-321** |
| Guardrail | 独立 Guardrail + useAgent 确认流程 | Guardrail 保留风险映射，`toolApproval` 回调接管 | ~保留 80 行 |
| STT | `SttClient` (112行) + `audio-utils` (73行) | `transcribe()` (AI SDK) | **-185** |
| Provider 工厂 | `ProviderClientFactory` (342行) 含消息适配 | 直接用 `createXxx()`，精简为目录查询 | **-200** (保留目录查询) |
| Chat UI | 自定义 React hooks (338行) + ~200行 UI | `useChat` + `DirectChatTransport` | **-400** |
| 会话摘要 | `ConversationManager` (229行) 保持不变 | 不变 | 0 |
| **合计** | **~2300 行自研** | **~400 行胶水** + AI SDK 原生 | **~-1900** |

---

## 2. 各模块迁移策略

### 2.1 整体迁移顺序（DAG 依赖）

```
Phase 0 (前置): 类型适配层 + 测试基础设施
     │
     ├── Task 0.1: 建立 ToolLoopAgent 适配器类型定义
     └── Task 0.2: 建立 useChat + DirectChatTransport 的 transport 抽象
           │
     ┌─────┴─────┐
     ▼           ▼
Phase 1 (核心): ToolLoopAgent 替代 AgentLoop
     │
     ├── Task 1.1: 实现 ToolLoopAgent 包装器
     ├── Task 1.2: 工具注册表适配（toOpenAISchema → AI SDK tool 格式）
     ├── Task 1.3: prepareStep 上下文构建（替代 ContextBuilder）
     └── Task 1.4: useAgent 集成 ToolLoopAgent
           │
     ┌─────┴─────┐
     ▼           ▼
Phase 2 (安全): toolApproval 替代 Guardrail 确认流程
     │
     ├── Task 2.1: Guardrail 风险映射为 toolApproval 回调
     ├── Task 2.2: 确认弹窗从 useAgent 迁移到 toolApproval
     └── Task 2.3: 敏感数据过滤保留并适配
           │
Phase 3 (UI): useChat 替代自定义 Chat UI
     │
     ├── Task 3.1: 实现 DirectChatTransport
     ├── Task 3.2: useChat 集成到 Side Panel
     └── Task 3.3: 迁移确认弹窗、工具调用气泡到 useChat 消息类型
           │
Phase 4 (辅助): STT + Provider 简化
     │
     ├── Task 4.1: transcribe() 替代 SttClient
     └── Task 4.2: ProviderClientFactory 精简为 ProviderCatalog
           │
Phase 5 (清理): 移除旧代码 + 回归测试
     │
     ├── Task 5.1: 移除 AgentLoop、ContextBuilder、SttClient
     └── Task 5.2: 全量回归测试 + E2E 验证
```

### 2.2 并行化策略

- Phase 0.1 和 0.2 可并行
- Phase 1 全部串行（强依赖）
- Phase 2 依赖 Phase 1 完成
- Phase 3 可与 Phase 2 并行（UI 层独立，共享 toolApproval 接口）
- Phase 4 依赖 Phase 2（STT 的 useVoiceInput hook 需要新的 chat transport）
- Phase 5 最后串行清理

---

## 3. ToolLoopAgent 集成方案

### 3.1 包装器设计

```typescript
// src/agent/tool-loop-adapter.ts

import { ToolLoopAgent, streamText, tool } from 'ai';
import type { ToolCallRecord, AgentRunInput, AgentRunOutput } from '@/shared/types/agent';
import type { IToolRegistry } from '@/registry/types';

interface ToolLoopAdapterConfig {
  toolRegistry: IToolRegistry;
  guardrail: IGuardrail;
  conversationManager: IConversationManager;
}

export class ToolLoopAdapter implements IAgentRuntime {
  private abortController: AbortController | null = null;

  constructor(private config: ToolLoopAdapterConfig) {}

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    this.abortController = new AbortController();
    const toolCalls: ToolCallRecord[] = [];
    let finalMessage = '';

    // 1. 构建 AI SDK tools 对象
    const tools = this.buildTools();

    // 2. 构建初始 messages
    const messages = await this.buildInitialMessages(input);

    // 3. AI SDK streamText + ToolLoopAgent
    const agent = new ToolLoopAgent({
      model: this.createModel(input),
      tools,
      system: input.browserContext ? this.buildSystemPrompt(input) : undefined,
      messages: messages as any, // AI SDK CoreMessage[]
      maxSteps: input.maxToolRounds ?? 15,
      stopWhen: ({ steps }) => steps.length >= (input.maxToolRounds ?? 15),
      prepareStep: async ({ messages: stepMessages, stepNumber }) => {
        // 替代 ContextBuilder 的上下文管理
        return this.prepareStepContext(input, stepMessages, stepNumber);
      },
      toolApproval: async (approval) => {
        // 替代 Guardrail 的确认流程
        return this.handleToolApproval(input, approval);
      },
      onStepFinish: ({ text, toolCalls: stepToolCalls, usage }) => {
        if (text) finalMessage = text;
        if (stepToolCalls) {
          for (const tc of stepToolCalls) {
            toolCalls.push(this.recordFromToolCall(tc));
          }
        }
      },
      abortSignal: this.abortController.signal,
    });

    const result = await agent.run();
    // ... 处理结果
  }

  abort(): void {
    this.abortController?.abort();
  }
}
```

### 3.2 工具转换：`ToolDefinition` → AI SDK `tool()`

```typescript
// 现有 ToolDefinition:
// { name, description, schema (JSON Schema), execute, preflight?,
//   riskLevel, category, resultSensitivity, expertOnly?, expertSwitch? }

// AI SDK tool:
// tool({ description, parameters: z.ZodSchema, execute: async (input) => {...} })

private buildTools(): Record<string, Tool> {
  const tools: Record<string, Tool> = {};
  for (const def of this.config.toolRegistry.getAllTools()) {
    tools[def.name] = tool({
      description: def.description,
      parameters: jsonSchemaToZod(def.schema),  // 需要实现转换器
      execute: async (input: any) => {
        // 工具执行不变 — 复用现有 tool.execute()
        return await def.execute(input);
      },
    });
  }
  return tools;
}
```

**关键决策：Zod Schema 转换**  
现有工具定义使用 JSON Schema（通过 `ToolRegistry.toOpenAISchema()` 输出）。AI SDK v7 的 `tool()` 接受 Zod schema。有两种方案：

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| A. 实现 JSON Schema → Zod 转换器 | 不改工具定义，向后兼容 | 转换器复杂，需处理 `$ref`、`oneOf` 等 | **选定** |
| B. 改造所有工具为 Zod | 原生支持，类型安全 | 改动 40+ 工具，风险大 | 不选 |

方案 A 的 `jsonSchemaToZod()` 实现基于 `json-schema-to-zod`（约 5KB min+gz），或手动实现精简版（仅支持本项目 JSON Schema 子集：`type`、`properties`、`required`、`enum`、`items`、`description`）。

### 3.3 prepareStep 上下文管理（替代 ContextBuilder）

AI SDK v7 的 `prepareStep` 在每个 step 前调用，可修改 messages。替代 ContextBuilder 的核心逻辑：

```typescript
private async prepareStepContext(
  input: AgentRunInput,
  messages: CoreMessage[],
  stepNumber: number,
): Promise<{ messages: CoreMessage[] }> {
  // 1. Token 预算截断（替代 trimToTokenBudget）
  const pruned = pruneMessages({
    messages,
    maxTokens: input.contextWindowTokens - input.tokenBudgetMargin,
  });

  // 2. 工具结果微压缩（替代 microcompact）
  //    注意：AI SDK 的 pruneMessages 不处理内容压缩，需要自定义
  const compacted = this.microcompactToolResults(
    pruned,
    input.microcompactKeepRecent,
    input.microcompactMinChars,
    input.microcompactExcludeTools,
  );

  // 3. 序列修复（替代 repairToolCallSequence）
  //    AI SDK 内部保证 tool_call 序列完整性，但仍需处理历史消息
  return { messages: compacted };
}
```

**注意**：`pruneMessages` 是 AI SDK v7 实验性 API，需要确认版本可用性。如果没有，保留自定义 `trimToTokenBudget` 逻辑。

---

## 4. toolApproval 替代 Guardrail 方案

### 4.1 riskLevel → toolApproval 映射

```typescript
// 现有 Guardrail.riskLevel → 确认行为:
// low    → 直接执行
// medium → 直接执行（记录日志）
// high   → 非 localTrusted 需确认，isLocalTrusted 跳过
// critical → Expert Mode + 确认（无论 localTrusted）

// AI SDK toolApproval 回调:
toolApproval: async (approval: ToolApprovalRequest) => {
  const { toolCall } = approval;
  const riskCheck = await this.guardrail.check(
    toolCall.toolName,
    toolCall.input,
    guardrailContext,
  );

  if (!riskCheck.allowed) {
    return { action: 'deny', reason: riskCheck.reason };
  }

  // 映射风险级别到 toolApproval 动作
  switch (riskCheck.riskLevel) {
    case 'low':
    case 'medium':
      return { action: 'approve' };

    case 'high':
      if (guardrailContext.isLocalTrusted) {
        return { action: 'approve' };
      }
      // 通知 UI 层显示确认弹窗
      return { action: 'require_approval', metadata: riskCheck };

    case 'critical':
      if (!guardrailContext.expertModeEnabled) {
        return { action: 'deny', reason: '需要 Expert Mode' };
      }
      return { action: 'require_approval', metadata: riskCheck };

    default:
      return { action: 'approve' };
  }
}
```

### 4.2 确认弹窗流程

AI SDK v7 的 `toolApproval` 返回 `{ action: 'require_approval' }` 时会暂停执行，等待用户通过某种机制批准。当前确认弹窗通过 `useAgent` 的 `onConfirm` hook + `confirmResolveRef` Promise 实现。

迁移方案：
1. **Guardrail 类保留**，但仅保留 `evaluateRisk` 和 `filterResultForRemote` 方法
2. 删除 Guardrail 中的确认弹窗控制逻辑（`requiresConfirmation` 字段不再由 Guardrail 自身消费）
3. `toolApproval` 回调中调用 `guardrail.check()` 获取 riskLevel
4. 当需要确认时，通过 UI 层回调（`onRequestApproval`）暂停 Agent 执行
5. 用户确认后，继续执行

**关键接口变更**：

```typescript
// 变更前 (Guardrail 自包含):
interface GuardrailCheck {
  allowed: boolean;
  riskLevel: RiskLevel;
  requiresPreflight: boolean;
  requiresConfirmation: boolean;   // ← 删除
  reason: string;
  dataSensitivity: SensitivityLevel;
}

// 变更后 (Guardrail 仅做风险评估):
interface GuardrailCheck {
  allowed: boolean;
  riskLevel: RiskLevel;
  requiresPreflight: boolean;
  reason: string;
  dataSensitivity: SensitivityLevel;
}
```

`requiresConfirmation` 逻辑上移到 `toolApproval` 回调判断。

### 4.3 敏感数据过滤保留

`Guardrail.filterResultForRemote()` 逻辑完全保留，在 tool 执行后调用：

```typescript
// ToolLoopAgent 的 execute 包装器中：
const rawResult = await def.execute(input);
const filtered = this.guardrail.filterResultForRemote(def, rawResult, context);
return filtered;
```

### 4.4 @ai-sdk/policy-opa 延期

`@ai-sdk/policy-opa` 当前不在迁移范围。理由：
- 新增 WASM 依赖显著增加包体积（~500KB+）
- 现有 Guardrail 规则覆盖充分（40+ 工具手动标注 riskLevel）
- 浏览器环境运行 OPA 策略引擎开销高

**未来评估**：待 AI SDK 稳定后，评估使用 `@ai-sdk/policy-opa` 替代 Guardrail 的 `evaluateRisk` 逻辑。当前保留自研 Guardrail 作为策略引擎。

---

## 5. transcribe() 替代 STT 方案

### 5.1 当前 STT 实现

`SttClient` 使用 `fetch` 直接调用 OpenAI 兼容的 `/v1/audio/transcriptions` 端点，手动处理 FormData、WAV 转换、超时。

### 5.2 AI SDK transcribe() 方案

```typescript
// 迁移前:
const client = new SttClient(providerConfig);
const text = await client.transcribe(audioBlob);

// 迁移后:
import { transcribe } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const provider = createOpenAI({
  apiKey: providerConfig.apiKey,
  baseURL: providerConfig.endpoint,
});
const result = await transcribe({
  model: provider.transcription(providerConfig.sttModel ?? 'whisper-1'),
  audio: audioBlob,  // 支持 Blob/File，自动处理格式
});
const text = result.text;
```

### 5.3 关键变化

| 项 | 自研 SttClient | AI SDK transcribe() |
|---|---|---|
| 音频格式 | 手动 WAV 转换（73行 audio-utils） | SDK 自动处理 |
| 超时 | 手动 AbortController | SDK 内置 |
| 提供者 | 仅 OpenAI 兼容端点 | OpenAI / Google / Anthropic / 更多 |
| 代码量 | 185 行 | ~15 行 |

### 5.4 兼容性处理

`ProviderConfig.sttModel` 和 `ProviderConfig.audioFormat` 字段保留，用于 AI SDK 的参数映射。`useVoiceInput` hook 的接口不变（仍返回 `(audioBlob) => Promise<string>`），仅替换内部实现。

---

## 6. useChat + DirectChatTransport 方案

### 6.1 当前 Chat UI 实现

```
useAgent hook (338行) → 手动管理:
  - messages: UIMessage[] (user/assistant/tool 三态)
  - streamingContent 增量拼接
  - toolCallDisplay 气泡转换
  - onConfirm → waitForConfirmation 状态机
  - abort 控制

Chat UI 组件 (~200行):
  - 消息列表渲染 (MarkdownViewer)
  - 工具调用气泡
  - 确认弹窗
  - 语音输入按钮
```

### 6.2 目标：useChat + DirectChatTransport

```typescript
// 迁移后:
import { useChat } from '@ai-sdk/react';
import { DirectChatTransport } from './direct-chat-transport';

function ChatPanel() {
  const transport = useMemo(() => new DirectChatTransport({
    onSendMessage: async (messages) => {
      // 调用 ToolLoopAdapter.run() → 转为 stream
      return await agentAdapter.runStream(input);
    },
  }), []);

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
    onToolCall: ({ toolCall }) => {
      // tool 气泡渲染（AI SDK 原生支持）
    },
  });

  // messages 类型由 AI SDK 管理，包含 text/tool_call/tool_result
  // 无需手动管理 streamingContent、toolCallDisplay 等
}
```

### 6.3 关键实现细节

#### DirectChatTransport 实现

```typescript
// src/chat/direct-chat-transport.ts

import { ChatTransport, JSONValue, UIMessage } from '@ai-sdk/ui-utils';

interface DirectTransportConfig {
  onSend: (messages: UIMessage[]) => AsyncGenerator<StreamPart>;
  onAbort?: () => void;
}

class DirectChatTransport implements ChatTransport {
  config: DirectTransportConfig;

  constructor(config: DirectTransportConfig) {
    this.config = config;
  }

  async sendMessages(messages: UIMessage[]): Promise<AsyncGenerator<StreamPart>> {
    return this.config.onSend(messages);
  }
}
```

#### 消息类型映射

```typescript
// UIMessage (现有) → AI SDK UIMessage (useChat 原生)
// 现有三态: user | assistant | tool
// AI SDK 多态: 通过 parts[] 表达 text | tool-call | tool-result | reasoning

// 迁移时不需要转换 — 直接使用 AI SDK 的 UIMessage 类型
// 确认弹窗通过 toolApproval 回调处理，不走 UIMessage 通道
```

### 6.4 兼容性风险

- **MarkdownViewer**：现有 UI 组件 `MarkdownViewer` 和 `ToolCallBubble` 需要适配 AI SDK 的 `UIMessage` 类型
- **确认弹窗**：需要独立的 React 状态管理（不通过消息流）
- **语音输入**：`useVoiceInput` hook 保持不变，`sendMessage` 接口不变

---

## 7. Provider 层简化方案

### 7.1 当前 ProviderClientFactory 职责

1. **提供者路由**：`providerConfig.providerId` → npm 包名 → 模块加载
2. **消息格式适配**：`ChatMessage[]` → AI SDK `prompt[]`（`mapMessagesToPrompt`）
3. **工具 schema 适配**：`OpenAIToolSchema[]` → AI SDK `inputSchema[]`
4. **推理强度映射**：`reasoning_effort` 字符串映射
5. **流式响应适配**：AI SDK stream events → `StreamChunk`

### 7.2 简化方案

迁移后不再需要消息格式适配层（`mapMessagesToPrompt`）和流式适配层，因为 AI SDK 的 `ToolLoopAgent` 直接使用原生格式。

保留部分：

```typescript
// src/provider/provider-registry.ts （精简为目录查询 + 模型加载）

export class ProviderRegistry {
  async createModel(config: ProviderConfig, modelId: string): Promise<LanguageModelV1> {
    const catalog = await ProviderCatalog.getInstance().getCatalog();
    const info = catalog[config.providerId];
    const moduleName = NPM_TO_MODULE[info?.npm ?? '@ai-sdk/openai-compatible'];

    switch (moduleName) {
      case '@ai-sdk/openai':
        return createOpenAI({ apiKey: config.apiKey, baseURL: config.endpoint }).chat(modelId);
      case '@ai-sdk/anthropic':
        return createAnthropic({ apiKey: config.apiKey, baseURL: config.endpoint }).chat(modelId);
      // ... 其他
      default:
        return createOpenAICompatible({
          name: config.name,
          baseURL: config.endpoint,
          headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
        }).chat(modelId);
    }
  }

  async getModels(config: ProviderConfig): Promise<CatalogModel[]> {
    // 保持不变
  }
}
```

**删除的代码**：
- `mapMessagesToPrompt()` — ToolLoopAgent 直接接收 CoreMessage
- `mapOpenAITools()` — ToolLoopAgent 直接接收 AI SDK tool 对象
- `mapReasoningEffort()` — AI SDK `LanguageModelV1` 原生支持
- 流式 chunk 适配逻辑 — AI SDK `streamText()` 原生流式

---

## 8. 风险点和回滚方案

### 8.1 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| AI SDK v7 API 不稳定（实验性功能） | 中 | 高 | 锁定版本 `ai@^7.0.29`；避免使用 `experimental_` API |
| Zod 转换 bug（JSON Schema → Zod） | 中 | 中 | 仅实现支持项目 Schema 子集；P0 工具优先测试 |
| `pruneMessages` 不可用或行为不符 | 中 | 中 | 保留 ContextBuilder.trimToTokenBudget 作为 fallback |
| useChat UIMessage 类型不兼容 | 低 | 中 | 渐进式迁移：先保留现有 UI，仅替换底层 |
| 包体积增长（Zod + AI SDK） | 中 | 低 | AI SDK 已依赖 Zod；测量增量，按需精简 |
| toolApproval 确认流程行为差异 | 中 | 高 | 保留现有 onConfirm Promise 模式并行运行验证 |

### 8.2 回滚方案

**Phase 级回滚**：每个 Phase 独立可回滚，通过 Feature Flag 控制。

```typescript
// src/shared/feature-flags.ts
export const FEATURE_FLAGS = {
  useToolLoopAgent: false,    // Phase 1 开关
  useToolApproval: false,     // Phase 2 开关
  useSDKChat: false,          // Phase 3 开关
  useSDKTranscribe: false,    // Phase 4 开关
};
```

每个 Phase 上线后在 Flag 关闭时回退到旧代码。验证 2 周稳定后移除 Flag 和旧代码。

### 8.3 渐进式迁移路径

避免大爆炸式切换：

1. **Phase 1 到位后**：Flag 默认关闭，仅内部测试启用 ToolLoopAgent
2. **Phase 2 到位后**：两个版本的 Guardrail 流程并行运行（A/B 对比）
3. **Phase 3 到位后**：新 UI 先作为 alternate view 共存
4. **全部验证通过后**：逐个 Flag 设为默认开启，旧代码保留 2 周后移除

---

## 9. 测试策略

### 9.1 单元测试

| 模块 | 测试内容 | 关键用例 |
|------|---------|----------|
| `jsonSchemaToZod` | JSON Schema → Zod 转换 | 所有工具 schema 能正确转换，参数校验行为一致 |
| `ToolLoopAdapter` | 生命周期、abort、错误处理 | 正常完成、提前终止、maxSteps 限制、无效工具处理 |
| `toolApproval` 适配 | 风险映射、确认流程 | low/medium/high/critical 四种级别正确映射 |
| `DirectChatTransport` | sendMessages、abort | 消息发送、流式中断 |
| `ProviderRegistry` | 模型加载 | 所有 14 个提供者能正确创建模型 |

### 9.2 集成测试

| 测试 | 验证点 |
|------|--------|
| Agent 循环端到端 | 完整对话：用户消息 → 工具调用 → 结果 → 最终响应 |
| Guardrail gate | 高风险操作被正确阻止/要求确认 |
| Context 管理 | 长对话后 token 预算截断正确，tool_call 序列完整 |
| 提供者兼容 | 所有 14 个提供者均能正常进行工具调用 |
| STT | 语音输入 → 转录 → 发送消息 |

### 9.3 E2E 测试

- 完整用户流程：安装 → 配置 Provider → 对话 → 工具执行 → 确认弹窗 → 会话摘要
- 跨 Provider 测试（OpenAI、Anthropic、Google、自定义兼容端点）

### 9.4 回归测试

- 现有 `useAgent.test.ts`、`agent-loop.test.ts`、`context-builder.test.ts` 保留作为基线
- 新测试覆盖 ToolLoopAdapter，与旧 AgentLoop 测试并行运行
- 确认旧测试全部通过后，逐步移除旧代码

---

## 10. 任务分解（DAG）

```
Phase 0: 基础设施
├── T0.1 jsonSchemaToZod 转换器 ───────────────────────────── 3h
└── T0.2 DirectChatTransport 实现 ─────────────────────────── 2h

Phase 1: ToolLoopAgent 替代 AgentLoop
├── T1.1 ToolLoopAdapter 核心实现 ────────────────────────── 4h
├── T1.2 工具注册表适配（ToolDefinition → tool()）────────── 3h
├── T1.3 prepareStep 上下文管理 ──────────────────────────── 3h
└── T1.4 useAgent 集成 ToolLoopAdapter ────────────────────── 3h

Phase 2: toolApproval 替代 Guardrail
├── T2.1 Guardrail 精简 + risk→toolApproval 映射 ────────── 3h
├── T2.2 确认弹窗从 useAgent 迁移到 toolApproval ────────── 3h
└── T2.3 敏感数据过滤适配 ────────────────────────────────── 2h

Phase 3: useChat 替代自定义 Chat UI
├── T3.1 useChat 集成到 Side Panel ───────────────────────── 4h
├── T3.2 工具调用气泡迁移 ────────────────────────────────── 3h
└── T3.3 MarkdownViewer 适配 ─────────────────────────────── 2h

Phase 4: STT + Provider 简化
├── T4.1 transcribe() 替代 SttClient ─────────────────────── 2h
└── T4.2 ProviderClientFactory 精简 ───────────────────────── 3h

Phase 5: 清理 + 回归
├── T5.1 Feature Flag 全部开启 + 旧代码移除 ──────────────── 2h
└── T5.2 全量回归测试 ────────────────────────────────────── 3h
```

**总计**：约 42 小时（5-7 个工作日）

---

## 11. 假设和不确定性

1. **AI SDK v7 稳定假设**：假设 `ToolLoopAgent`、`pruneMessages`、`transcribe` API 在当前版本 (`ai@^7.0.29`) 中稳定可用。如发现实验性 API，需降级到稳定替代或等待更新。

2. **Zod 依赖**：AI SDK v7 已依赖 Zod，不会新增包体积。`jsonSchemaToZod` 转换器的正确性依赖于工具 schema 的规范程度 — 如果存在不规范 schema（如 `anyOf`、`allOf`、循环引用），转换可能失败。

3. **prepareStep 行为**：假设 `prepareStep` 返回的 messages 可被后续 step 修改。如果 AI SDK 内部做了 messages 不可变性保护，需调整策略。

4. **DirectChatTransport 类型**：假设 `ChatTransport` 接口在 `@ai-sdk/ui-utils` 中导出且类型稳定。如接口变更，需适配。

5. **包体积预算**：不引入 `@ai-sdk/policy-opa`，假设现有 Guardrail 逻辑可覆盖所有策略需求。未来如需接入 OPA，需评估 WASM 体积（~500KB）对扩展包的影响。
