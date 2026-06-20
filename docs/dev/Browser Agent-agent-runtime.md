# 开发文档: T15 - Agent Runtime

**Project:** Browser Agent
**Task ID:** T15
**Slug:** agent-runtime
**Issue:** #15
**类型:** backend
**Batch:** 6
**依赖:** T2 (define-types), T6 (tool-registry), T9 (tabs-tools), T10 (windows-tools), T11 (tabgroups-tools), T12 (guardrail-impl), T13 (llm-client), T14 (conversation-mgr)

## 1. 目标

实现 `IAgentRuntime` 接口，构建完整的 Agent 循环：ContextBuilder 组装上下文 → LLM 推理 → tool_calls 解析与校验 → Guardrail 风险检查 → Preflight/用户确认 → 工具执行 → 结果注入 → 循环（最多 15 轮）→ 最终文本回复。同时实现 SummaryManager 在每轮后检查是否需要触发摘要。

## 2. 前置条件

- [x] T2: `shared/types/agent.ts` 中的 `AgentConfig`、`AgentRunInput`、`AgentRunOutput`、`IAgentRuntime` 类型已定义
- [x] T6: `IToolRegistry` 可查询工具、执行工具、导出 OpenAI Schema
- [x] T9/T10/T11: Tabs/Windows/TabGroups 工具已注册到 Registry
- [x] T12: `IGuardrail.check()` 可判断执行策略
- [x] T13: `ILlmClient.chat()` 可调用 LLM
- [x] T14: `IConversationManager` 可读写消息、检查摘要阈值、生成摘要

## 3. 实现步骤

### 3.1 类型定义复用

T2 中已定义的接口（来自技术方案 4.2.3）：

```ts
// 以下类型已存在于 src/shared/types/agent.ts

interface AgentConfig {
  maxToolRounds: number;       // 默认 15
  systemPrompt: string;
  maxContextMessages: number;  // 默认 20
  summaryThreshold: {
    messageCount: number;      // 默认 30
    estimatedTokens: number;   // 默认 12000
    toolCallCount: number;     // 默认 50
  };
}

interface AgentRunInput {
  conversationId: string;
  userMessage: string;
  providerConfig: ProviderConfig;
  browserContext: LowSensitivityContext;
  abortSignal?: AbortSignal;
}

interface AgentRunOutput {
  finalMessage: string;
  toolCalls: ToolCallRecord[];
  tokenUsage?: { prompt: number; completion: number };
}

interface ToolCallRecord {
  toolName: string;
  params: Record<string, unknown>;
  result: ToolResult;
  riskLevel: RiskLevel;
  confirmed: boolean;
  timestamp: number;
}

interface IAgentRuntime {
  run(input: AgentRunInput): Promise<AgentRunOutput>;
  abort(): void;
}
```

### 3.2 默认配置常量

**文件:** `src/agent/system-prompt.ts`

```ts
// src/agent/system-prompt.ts

export const DEFAULT_SYSTEM_PROMPT = `You are a browser assistant. You have access to tools that can manage the user's browser tabs, windows, tab groups, bookmarks, history, downloads, page content, and more.

Your capabilities:
- Query, create, close, move, and group browser tabs
- Manage browser windows
- Read page content and selected text
- Search and manage bookmarks, history, and downloads
- Read and write clipboard content
- Save and restore tab sessions

Guidelines:
1. Be concise. Execute tools efficiently.
2. Before closing tabs or windows, always confirm with the user.
3. When reading page content, summarize it unless the user asks for full text.
4. For sensitive operations (history, bookmarks, downloads, cookies), confirm before sending data to the LLM.
5. If a tool fails, explain the error and suggest alternatives.
6. Do not fabricate browser state. Always use tools to query current state.

Current browser context will be provided at the start of each conversation.`;

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxToolRounds: 15,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  maxContextMessages: 20,
  summaryThreshold: {
    messageCount: 30,
    estimatedTokens: 12000,
    toolCallCount: 50,
  },
};
```

### 3.3 ContextBuilder 实现

**文件:** `src/agent/context-builder.ts`

**职责：** 组装完整的 LLM messages 数组，包含：
1. System prompt（含工具说明）
2. 会话摘要（如有）
3. 低敏浏览器上下文
4. 最近 N 条消息

```ts
// src/agent/context-builder.ts

import type { AgentConfig } from '../shared/types/agent';
import type { ChatMessage } from '../shared/types/llm';
import type { LowSensitivityContext } from '../shared/types/browser';
import type { IConversationManager, StoredMessage } from '../shared/types/conversation';
import type { IToolRegistry } from '../registry/types';

export class ContextBuilder {
  constructor(
    private config: AgentConfig,
    private toolRegistry: IToolRegistry,
    private conversationManager: IConversationManager,
  ) {}

  async build(
    conversationId: string,
    currentBrowserContext: LowSensitivityContext,
  ): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];

    // 1. System prompt（含工具列表）
    const toolsDescription = this.buildToolsDescription();
    messages.push({
      role: 'system',
      content: `${this.config.systemPrompt}\n\n## Available Tools\n${toolsDescription}`,
    });

    // 2. 会话摘要
    const conversation = await this.conversationManager.get(conversationId);
    if (conversation?.summary) {
      messages.push({
        role: 'system',
        content: `## Conversation Summary\n${conversation.summary}`,
      });
    }

    // 3. 低敏浏览器上下文
    messages.push({
      role: 'system',
      content: `## Current Browser Context\n${JSON.stringify(currentBrowserContext, null, 2)}`,
    });

    // 4. 最近消息
    const recentMessages = await this.conversationManager.getRecentMessages(
      conversationId,
      this.config.maxContextMessages,
    );

    for (const msg of recentMessages) {
      messages.push(this.convertToChatMessage(msg));
    }

    return messages;
  }

  private buildToolsDescription(): string {
    const tools = this.toolRegistry.getAllTools();
    return tools
      .map(t => `- **${t.name}**: ${t.description}`)
      .join('\n');
  }

  private convertToChatMessage(msg: StoredMessage): ChatMessage {
    const base: ChatMessage = {
      role: msg.role,
      content: msg.content,
    };

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      base.tool_calls = msg.toolCalls.map(tc => ({
        id: `call_${msg.id}`,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.params),
        },
      }));
    }

    return base;
  }
}
```

### 3.4 AgentLoop 核心实现

**文件:** `src/agent/agent-loop.ts`

**核心流程：**

```
run(input)
  ├─ 1. 将用户消息存入 ConversationManager
  ├─ 2. ContextBuilder.build() → messages[]
  ├─ 3. LlmClient.chat(messages, tools) → LLM 响应
  ├─ 4. 解析响应：
  │     ├─ 有 tool_calls → 进入工具执行循环（最多 15 轮）
  │     │   ├─ 校验 tool name 存在
  │     │   ├─ Guardrail.check()
  │     │   ├─ 如需 preflight → 执行 preflight
  │     │   ├─ 如需确认 → 触发用户确认（通过回调）
  │     │   ├─ ToolRegistry.execute()
  │     │   ├─ Guardrail.filterResultForRemote() → 过滤敏感数据
  │     │   ├─ 结果注入 messages
  │     │   └─ 继续循环调用 LLM
  │     └─ 无 tool_calls → 最终文本回复
  ├─ 5. 将助手最终回复存入 ConversationManager
  └─ 6. SummaryManager.checkAndSummarize()
```

**实现伪代码：**

```ts
// src/agent/agent-loop.ts

import type {
  AgentConfig,
  AgentRunInput,
  AgentRunOutput,
  ToolCallRecord,
  IAgentRuntime,
} from '../shared/types/agent';
import type { ChatMessage, ChatCompletionResponse } from '../shared/types/llm';
import type { IToolRegistry } from '../registry/types';
import type { IGuardrail } from '../shared/types/guardrail';
import type { ILlmClient } from '../shared/types/llm';
import type { IConversationManager, StoredMessage } from '../shared/types/conversation';
import { ContextBuilder } from './context-builder';
import { SummaryManager } from './summary-manager';
import { Guardrail } from '../guardrail/guardrail';

const MAX_INVALID_TOOL_RETRIES = 3;

export class AgentLoop implements IAgentRuntime {
  private abortController: AbortController | null = null;
  private contextBuilder: ContextBuilder;
  private summaryManager: SummaryManager;

  constructor(
    private config: AgentConfig,
    private toolRegistry: IToolRegistry,
    private guardrail: Guardrail,
    private conversationManager: IConversationManager,
    private llmClientFactory: (providerConfig: AgentRunInput['providerConfig']) => ILlmClient,
  ) {
    this.contextBuilder = new ContextBuilder(config, toolRegistry, conversationManager);
    this.summaryManager = new SummaryManager(conversationManager);
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    this.abortController = new AbortController();
    const toolCalls: ToolCallRecord[] = [];
    let finalMessage = '';

    try {
      // 1. 存储用户消息
      const userMsgId = crypto.randomUUID();
      await this.conversationManager.addMessage(input.conversationId, {
        id: userMsgId,
        role: 'user',
        content: input.userMessage,
        timestamp: Date.now(),
      });

      // 2. 构建初始上下文
      const llmClient = this.llmClientFactory(input.providerConfig);
      let messages = await this.contextBuilder.build(
        input.conversationId,
        input.browserContext,
      );

      // 将用户消息追加到 messages（ContextBuilder 可能已包含）
      messages.push({ role: 'user', content: input.userMessage });

      // 3. Agent 主循环
      let round = 0;
      let invalidToolRetries = 0;

      while (round < this.config.maxToolRounds) {
        // 检查中止信号
        if (this.abortController.signal.aborted) {
          finalMessage = '操作已被中止。';
          break;
        }

        const tools = this.toolRegistry.toOpenAISchema();

        let response: ChatCompletionResponse;
        try {
          response = await llmClient.chat(
            {
              model: input.providerConfig.model,
              messages,
              tools,
            },
            this.abortController.signal,
          );
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            finalMessage = '操作已被中止。';
            break;
          }
          throw err;
        }

        const choice = response.choices[0];
        if (!choice) {
          finalMessage = 'LLM 未返回有效响应。';
          break;
        }

        // 4. 判断是否有 tool_calls
        if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
          // 处理工具调用
          for (const tc of choice.message.tool_calls) {
            const toolName = tc.function.name;
            let params: Record<string, unknown>;

            try {
              params = JSON.parse(tc.function.arguments);
            } catch {
              // 参数解析失败 → 反馈错误并重试
              if (invalidToolRetries < MAX_INVALID_TOOL_RETRIES) {
                messages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: `Error: Invalid JSON arguments: ${tc.function.arguments}`,
                });
                invalidToolRetries++;
                continue; // 跳过当前 tool，让 LLM 重试
              } else {
                finalMessage = '工具调用参数格式持续错误，操作中止。';
                break;
              }
            }

            // 校验 tool 存在
            const tool = this.toolRegistry.getTool(toolName);
            if (!tool) {
              if (invalidToolRetries < MAX_INVALID_TOOL_RETRIES) {
                messages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: `Error: Unknown tool "${toolName}". Available tools: ${this.toolRegistry.getAllTools().map(t => t.name).join(', ')}`,
                });
                invalidToolRetries++;
                continue;
              } else {
                finalMessage = 'LLM 持续调用不存在的工具，操作中止。';
                break;
              }
            }

            // Guardrail 检查
            const guardrailContext = {
              isLocalTrusted: input.providerConfig.isLocalTrusted,
              expertModeEnabled: false, // 从 ConfigStore 读取
              expertSwitches: {},
              sessionGrants: {
                sensitiveDataAllowed: false, // 从会话读取
              },
            };

            const check = await this.guardrail.check(toolName, params, guardrailContext);

            if (!check.allowed) {
              toolCalls.push({
                toolName,
                params,
                result: { success: false, error: check.reason },
                riskLevel: check.riskLevel,
                confirmed: false,
                timestamp: Date.now(),
              });

              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: `Blocked by guardrail: ${check.reason}`,
              });
              continue;
            }

            // Preflight（如需要）
            if (check.requiresPreflight && tool.preflight) {
              const preflightResult = await tool.preflight(params);

              // TODO: 触发用户确认 UI（通过回调或事件）
              // 在 MVP 中，高风险操作的确认在 Agent Loop 外部通过 Chat UI 处理
              // Agent Loop 在此处暂停，等待用户确认
              // 简化处理：假设自动确认（单元测试中），生产环境通过回调
            }

            // 执行工具
            const result = await tool.execute(params);

            // 敏感数据过滤（针对远程 Provider）
            const filteredResult = this.guardrail.filterResultForRemote(
              tool,
              result,
              guardrailContext,
            );

            // 记录 tool call
            toolCalls.push({
              toolName,
              params,
              result: filteredResult,
              riskLevel: check.riskLevel,
              confirmed: check.requiresConfirmation, // 简化
              timestamp: Date.now(),
            });

            // 结果注入上下文
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(filteredResult),
            });

            // 重置重试计数（有效的 tool call）
            invalidToolRetries = 0;
          }

          round++;
        } else {
          // 无 tool_calls：最终文本回复
          finalMessage = choice.message.content ?? '';
          break;
        }
      }

      // 达到最大轮次
      if (round >= this.config.maxToolRounds && !finalMessage) {
        finalMessage = '操作步骤过多，已达到最大执行轮次。已完成的操作已生效。';
      }

      // 5. 存储助手最终回复
      const assistantMsgId = crypto.randomUUID();
      await this.conversationManager.addMessage(input.conversationId, {
        id: assistantMsgId,
        role: 'assistant',
        content: finalMessage,
        toolCalls: toolCalls.map(tc => ({
          name: tc.toolName,
          params: tc.params,
          result: tc.result.success ? 'success' : tc.result.error,
        })),
        timestamp: Date.now(),
      });

      // 6. 检查是否需要摘要
      await this.summaryManager.checkAndSummarize(
        input.conversationId,
        llmClient,
      );

      return {
        finalMessage,
        toolCalls,
        tokenUsage: undefined, // 从最后一个 response 获取
      };
    } finally {
      this.abortController = null;
    }
  }
}
```

### 3.5 SummaryManager 实现

**文件:** `src/agent/summary-manager.ts`

```ts
// src/agent/summary-manager.ts

import type { IConversationManager } from '../shared/types/conversation';
import type { ILlmClient } from '../shared/types/llm';

export class SummaryManager {
  constructor(private conversationManager: IConversationManager) {}

  async checkAndSummarize(
    conversationId: string,
    llmClient: ILlmClient,
  ): Promise<void> {
    const needsSummary = await this.conversationManager.needsSummary(conversationId);
    if (needsSummary) {
      await this.conversationManager.generateSummary(conversationId, llmClient);
    }
  }
}
```

### 3.6 导出

**文件:** `src/agent/index.ts`

```ts
export { AgentLoop } from './agent-loop';
export { ContextBuilder } from './context-builder';
export { SummaryManager } from './summary-manager';
export { DEFAULT_SYSTEM_PROMPT, DEFAULT_AGENT_CONFIG } from './system-prompt';
export type {
  AgentConfig,
  AgentRunInput,
  AgentRunOutput,
  ToolCallRecord,
  IAgentRuntime,
} from '../shared/types/agent';
```

## 4. 接口/契约

### 4.1 IAgentRuntime 接口

```ts
interface IAgentRuntime {
  run(input: AgentRunInput): Promise<AgentRunOutput>;
  abort(): void;
}
```

### 4.2 Agent Loop 状态机

```
IDLE → RUNNING → (每轮: LLM_CALL → PARSE → GUARDRAIL → [PREFLIGHT] → [CONFIRM] → EXECUTE → RESULT_INJECT)
                                              ↓ 无 tool_calls
                                          COMPLETED
                                              ↓ 中止
                                          ABORTED
                                              ↓ 超轮次
                                          MAX_ROUNDS
```

### 4.3 错误处理策略

| 错误类型 | 策略 | 重试次数 |
|----------|------|----------|
| LLM 返回不存在的 tool name | 反馈错误信息给 LLM，重试 | 最多 3 次 |
| LLM 返回无效 JSON 参数 | 反馈错误信息给 LLM，重试 | 最多 3 次 |
| Guardrail 拒绝执行 | 反馈拒绝原因给 LLM，继续下一轮 | 不重试（策略性拒绝） |
| 工具执行失败 | 反馈错误信息给 LLM | 不重试（由 LLM 决定替代方案） |
| AbortController 中止 | 立即停止循环，返回中止消息 | N/A |
| 达到 maxToolRounds | 强制终止，生成摘要回复 | N/A |
| LLM API 调用失败（网络/超时） | 向上抛出，由调用方处理 | N/A |

## 5. 测试指引

### 5.1 单元测试 — AgentLoop

**文件:** `src/agent/__tests__/agent-loop.test.ts`

**Mock 策略：**
- Mock `ILlmClient.chat()` — 返回预设的 `ChatCompletionResponse`
- Mock `IToolRegistry` — 提供查询/执行能力
- Mock `Guardrail.check()` — 返回预设的 `GuardrailCheck`
- Mock `IConversationManager` — 内存实现

**测试场景及预期：**

| # | 场景 | 预期结果 |
|---|------|----------|
| 1 | 单轮：用户消息 → LLM 无 tool_call → 文本回复 | `finalMessage` 为 LLM 文本，`toolCalls.length === 0` |
| 2 | 单轮：用户消息 → 1 个 tool_call → 执行成功 → 最终回复 | `toolCalls.length === 1`，工具结果正确，最终回复正确 |
| 3 | 多轮：2 个连续 tool_call 依次执行 | `toolCalls.length === 2`，执行顺序正确 |
| 4 | 无效 tool name（不存在） | LLM 收到错误反馈，重试后修正 |
| 5 | 无效 tool name 连续 3 次 | 循环终止，`finalMessage` 包含 "持续调用不存在的工具" |
| 6 | 无效 JSON 参数 | LLM 收到错误反馈，重试后修正 |
| 7 | 无效 JSON 参数连续 3 次 | 循环终止 |
| 8 | Guardrail 拒绝（`allowed: false`） | `toolCalls` 中该记录 `result.success === false` |
| 9 | 达到 maxToolRounds 上限 | 强制终止，`finalMessage` 包含 "已达到最大执行轮次" |
| 10 | AbortController 中止 | 循环立即停止，`finalMessage` 为 "操作已被中止" |
| 11 | LLM API 调用失败 | 错误向上抛出 |
| 12 | 工具执行失败 | 错误注入上下文，LLM 继续处理 |

### 5.2 单元测试 — ContextBuilder

**文件:** `src/agent/__tests__/context-builder.test.ts`

**测试场景及预期：**

| # | 场景 | 预期结果 |
|---|------|----------|
| 1 | 正常构建上下文 | messages[0] 为 system prompt 含工具列表 |
| 2 | 有会话摘要 | messages 中包含 summary 的 system 消息 |
| 3 | 有浏览器上下文 | messages 中包含浏览器状态的 system 消息 |
| 4 | 有历史消息 | messages 末尾包含最近 N 条消息 |
| 5 | 工具列表正确 | tools description 包含所有已注册工具名 |

## 6. 验收标准

- [ ] 单轮工具调用正常：用户消息 → tool_call → 执行 → 最终回复
- [ ] 多轮工具调用正常：连续多个 tool_call 依次执行
- [ ] LLM 返回无效 tool_call（名称不存在）时捕获错误，反馈给 LLM 重试（最多 3 次）
- [ ] LLM 返回无效 JSON 参数时捕获错误，反馈给 LLM 重试（最多 3 次）
- [ ] `maxToolRounds` 达到上限后强制终止，生成 "操作过于复杂" 的回复
- [ ] `AbortController` 中止时 Agent Loop 立即停止
- [ ] `ContextBuilder` 正确注入 system prompt + tools + history + summary + browser context
- [ ] `SummaryManager` 在超过阈值后自动触发摘要生成
- [ ] 用户消息和助手回复均存入 ConversationManager
- [ ] 单元测试 mock LLM 响应，覆盖正常/异常/超限/中止场景

## 7. 注意事项

1. **用户确认回调** — MVP 阶段 Agent Loop 通过 `AbortController` + Promise 挂起实现确认等待。具体方案：在需要确认时，Agent Loop 通过回调函数 `onConfirmRequired(preflightResult)` 通知 Chat UI，返回一个 Promise，Chat UI 展示确认弹窗后 resolve。本任务中先实现接口桩（`onConfirmRequired` 回调参数），具体 UI 对接在 T17 完成。

2. **GuardrailContext 读取** — `expertModeEnabled` 和 `expertSwitches` 需要从 ConfigStore 读取。当前实现中作为占位，实际应从 AgentLoop 构造函数注入或运行时读取。

3. **`filterResultForRemote` 调用时机** — 在工具结果注入 LLM 上下文前调用，而不是在存储消息时。本地存储可以保留原始结果供 UI 展示。

4. **tokenUsage 收集** — 从每次 LLM 响应的 `usage` 字段累加，在 `AgentRunOutput` 中返回总消耗。

5. **循环终止条件优先级** — AbortController 中止 > 达到 maxToolRounds > 无效工具重试耗尽 > LLM 返回文本回复。

6. **消息 ID 生成** — 使用 `crypto.randomUUID()` 确保唯一性。

7. **`llmClientFactory` 模式** — AgentLoop 不直接依赖 `ProviderConfig` 创建 `LlmClient`，而是通过工厂函数注入，方便测试时 mock。
