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
  onToolCall?: (record: ToolCallRecord) => void;
  onConfirm?: (request: {
    toolName: string;
    params: Record<string, unknown>;
    affectedObjects: Array<{ type: string; title?: string; url?: string; reason?: string }>;
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
      messages.push({ role: 'user', content: input.userMessage });

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
            { model: input.providerConfig.model, messages, tools },
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

        if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
          for (const tc of choice.message.tool_calls) {
            let params: Record<string, unknown>;
            try {
              params = JSON.parse(tc.function.arguments);
            } catch {
              if (invalidRetries < MAX_INVALID_TOOL_RETRIES) {
                messages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: `Error: Invalid JSON: ${tc.function.arguments}`,
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
                messages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: `Error: Unknown tool "${tc.function.name}"`,
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
              });
              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: `Blocked: ${check.reason}`,
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
                });
                messages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: '用户取消确认，跳过执行。',
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
            });

            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(filteredResult),
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
          name: tc.toolName,
          params: tc.params,
          result: tc.result.success ? 'success' : tc.result.error,
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
