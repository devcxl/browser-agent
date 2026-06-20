import type {
  AgentConfig,
  AgentRunInput,
  AgentRunOutput,
  ToolCallRecord,
  IAgentRuntime,
} from '@/shared/types/agent';
import type { IToolRegistry } from '@/registry/types';
import type { IGuardrail, GuardrailContext } from '@/shared/types/guardrail';
import type { IConversationManager } from '@/shared/types/conversation';
import type { ProviderConfig, ILlmClient, ChatMessage, ChatCompletionResponse } from '@/shared/types/llm';
import { ContextBuilder } from './context-builder';
import { SummaryManager } from './summary-manager';

const MAX_INVALID_TOOL_RETRIES = 3;

export interface AgentLoopHooks {
  onStreamChunk?: (chunk: string) => void;
  onReasoningChunk?: (chunk: string) => void;
  onToolCall?: (record: ToolCallRecord) => void;
  onConfirm?: (request: {
    toolName: string;
    params: Record<string, unknown>;
    affectedObjects: Array<{ type: string; id?: string; title?: string; url?: string; reason?: string }>;
    warnings: string[];
  }) => Promise<boolean>;
}

export class AgentLoop implements IAgentRuntime {
  private abortController: AbortController | null = null;
  private contextBuilder: ContextBuilder;
  private summaryManager: SummaryManager;

  constructor(
    private config: AgentConfig,
    private toolRegistry: IToolRegistry,
    private guardrail: IGuardrail,
    private conversationManager: IConversationManager,
    private llmClientFactory: (config: ProviderConfig) => ILlmClient,
    private hooks?: AgentLoopHooks,
  ) {
    this.contextBuilder = new ContextBuilder(config, toolRegistry, conversationManager);
    this.summaryManager = new SummaryManager(conversationManager);
  }

  abort(): void {
    this.abortController?.abort();
  }

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    this.abortController = new AbortController();
    const toolCalls: ToolCallRecord[] = [];
    let finalMessage = '';

    try {
      // 1. Store user message
      await this.conversationManager.addMessage(input.conversationId, {
        id: crypto.randomUUID(),
        role: 'user',
        content: input.userMessage,
        timestamp: Date.now(),
      });

      const llmClient = this.llmClientFactory(input.providerConfig);

      // 2. Build context messages
      let messages = await this.contextBuilder.build(
        input.conversationId,
        input.browserContext,
      );

      // 3. Agent loop
      let round = 0;
      let invalidRetries = 0;

      while (round < this.config.maxToolRounds) {
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
              reasoning_effort: this.config.reasoningEffort,
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

        // 提取 reasoning_content（非流式响应中有些模型也会返回）
        const reasoning = choice.message.reasoning_content;
        if (reasoning && this.hooks?.onReasoningChunk) {
          this.hooks.onReasoningChunk(reasoning);
        }

        if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
          // 按 OpenAI 协议：tool(result) 消息前必须有对应的 assistant(tool_calls) 消息
          messages.push({
            role: 'assistant',
            content: choice.message.content ?? null,
            tool_calls: choice.message.tool_calls,
          });

          for (const tc of choice.message.tool_calls) {
            let params: Record<string, unknown>;
            try {
              params = JSON.parse(tc.function.arguments);
            } catch {
              if (invalidRetries < MAX_INVALID_TOOL_RETRIES) {
                const errMsg = {
                  role: 'tool' as const,
                  tool_call_id: tc.id,
                  content: `Error: Invalid JSON: ${tc.function.arguments}`,
                };
                messages.push(errMsg);
                await this.conversationManager.addMessage(input.conversationId, {
                  id: crypto.randomUUID(),
                  role: 'tool',
                  content: errMsg.content,
                  toolCallId: tc.id,
                  timestamp: Date.now(),
                });
                invalidRetries++;
                continue;
              } else {
                finalMessage = '工具参数持续错误。';
                break;
              }
            }

            const tool = this.toolRegistry.getTool(tc.function.name);
            if (!tool) {
              if (invalidRetries < MAX_INVALID_TOOL_RETRIES) {
                const errMsg = {
                  role: 'tool' as const,
                  tool_call_id: tc.id,
                  content: `Error: Unknown tool "${tc.function.name}"`,
                };
                messages.push(errMsg);
                await this.conversationManager.addMessage(input.conversationId, {
                  id: crypto.randomUUID(),
                  role: 'tool',
                  content: errMsg.content,
                  toolCallId: tc.id,
                  timestamp: Date.now(),
                });
                invalidRetries++;
                continue;
              } else {
                finalMessage = 'LLM 持续调用不存在的工具。';
                break;
              }
            }

            const guardrailContext: GuardrailContext = {
              isLocalTrusted: input.providerConfig.isLocalTrusted,
              expertModeEnabled: false,
              expertSwitches: {},
              sessionGrants: { sensitiveDataAllowed: false },
            };

            const check = await this.guardrail.check(
              tc.function.name,
              params,
              guardrailContext,
            );

            if (!check.allowed) {
              toolCalls.push({
                toolName: tc.function.name,
                params,
                result: { success: false, error: check.reason },
                riskLevel: check.riskLevel,
                confirmed: false,
                timestamp: Date.now(),
                toolCallId: tc.id,
              });
              const toolMsg = {
                role: 'tool' as const,
                tool_call_id: tc.id,
                content: `Blocked: ${check.reason}`,
              };
              messages.push(toolMsg);
              await this.conversationManager.addMessage(input.conversationId, {
                id: crypto.randomUUID(),
                role: 'tool',
                content: toolMsg.content,
                toolCallId: tc.id,
                timestamp: Date.now(),
              });
              this.hooks?.onToolCall?.(toolCalls[toolCalls.length - 1]);
              continue;
            }

            // Run preflight before confirmation check to gather affected objects
            let affectedObjects: Array<{ type: string; title?: string; url?: string; reason?: string }> = [];
            let warnings: string[] = [];
            if (check.requiresPreflight && tool.preflight) {
              const preflightResult = await tool.preflight(params);
              affectedObjects = preflightResult.affectedObjects ?? [];
              warnings = preflightResult.warnings ?? [];
            }

            // User confirmation for high-risk operations
            if (check.requiresConfirmation && this.hooks?.onConfirm) {
              const confirmed = await this.hooks.onConfirm({
                toolName: tc.function.name,
                params,
                affectedObjects,
                warnings,
              });
              if (!confirmed) {
                toolCalls.push({
                  toolName: tc.function.name,
                  params,
                  result: { success: false, error: '用户取消确认' },
                  riskLevel: check.riskLevel,
                  confirmed: false,
                  timestamp: Date.now(),
                  toolCallId: tc.id,
                });
                const cancelMsg = {
                  role: 'tool' as const,
                  tool_call_id: tc.id,
                  content: '用户取消确认，跳过执行。',
                };
                messages.push(cancelMsg);
                await this.conversationManager.addMessage(input.conversationId, {
                  id: crypto.randomUUID(),
                  role: 'tool',
                  content: cancelMsg.content,
                  toolCallId: tc.id,
                  timestamp: Date.now(),
                });
                this.hooks?.onToolCall?.(toolCalls[toolCalls.length - 1]);
                continue;
              }
            }

            const result = await tool.execute(params);
            const filteredResult = this.guardrail.filterResultForRemote(
              tool,
              result,
              guardrailContext,
            );

            toolCalls.push({
              toolName: tc.function.name,
              params,
              result: filteredResult,
              riskLevel: check.riskLevel,
              confirmed: check.requiresConfirmation,
              timestamp: Date.now(),
              toolCallId: tc.id,
            });

            const toolMsg = {
              role: 'tool' as const,
              tool_call_id: tc.id,
              content: JSON.stringify(filteredResult),
            };
            messages.push(toolMsg);
            await this.conversationManager.addMessage(input.conversationId, {
              id: crypto.randomUUID(),
              role: 'tool',
              content: toolMsg.content,
              toolCallId: tc.id,
              timestamp: Date.now(),
            });

            this.hooks?.onToolCall?.(toolCalls[toolCalls.length - 1]);
            invalidRetries = 0;
          }

          if (finalMessage) break;
          round++;
        } else {
          finalMessage = choice.message.content ?? '';
          // Emit stream chunks for stop responses
          if (finalMessage && this.hooks?.onStreamChunk) {
            this.emitStreamChunks(finalMessage);
          }
          break;
        }
      }

      if (round >= this.config.maxToolRounds && !finalMessage) {
        finalMessage = '操作步骤过多，已达到最大执行轮次。';
      }

      // 4. Store assistant response
      await this.conversationManager.addMessage(input.conversationId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: finalMessage,
        toolCalls: toolCalls.map((tc) => ({
          id: tc.toolCallId ?? `call_${crypto.randomUUID()}`,
          name: tc.toolName,
          params: tc.params,
          result: tc.result.success ? 'success' : (tc.result.error ?? 'unknown error'),
        })),
        timestamp: Date.now(),
      });

      // 5. Check if summary needed
      await this.summaryManager.checkAndSummarize(input.conversationId, llmClient);

      return { finalMessage, toolCalls };
    } finally {
      this.abortController = null;
    }
  }

  private emitStreamChunks(text: string): void {
    const chunkSize = 15;
    let i = 0;
    while (i < text.length) {
      const chunk = text.slice(i, i + chunkSize);
      this.hooks?.onStreamChunk?.(chunk);
      i += chunkSize;
    }
  }
}
