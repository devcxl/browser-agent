import type {
  AgentConfig,
  AgentRunInput,
  AgentRunOutput,
  ToolCallRecord,
  IAgentRuntime,
} from '@/shared/types/agent';
import type { Skill } from '@/shared/types/skill';
import type { IToolRegistry } from '@/registry/types';
import type { IGuardrail, GuardrailContext } from '@/shared/types/guardrail';
import type { IConversationManager } from '@/shared/types/conversation';
import type { ProviderConfig, ILlmClient, ChatMessage, ChatCompletionResponse, StreamChunk } from '@/shared/types/llm';
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
    let totalPrompt = 0;
    let totalCompletion = 0;

    const allSkills: Skill[] = input.skills ?? [];
    const activeSkillNames = new Set<string>();

    try {
      // 1. Store user message
      await this.conversationManager.addMessage(input.conversationId, {
        id: crypto.randomUUID(),
        role: 'user',
        content: input.userMessage,
        timestamp: Date.now(),
      });

      const llmClient = this.llmClientFactory(input.providerConfig);

      // 2. Agent loop
      let round = 0;
      let invalidRetries = 0;

      while (round < this.config.maxToolRounds) {
        if (this.abortController.signal.aborted) {
          finalMessage = '操作已被中止。';
          break;
        }

        // 每轮重建 messages，确保 skill 激活后下一轮 prompt 生效
        let messages = await this.contextBuilder.build(
          input.conversationId,
          input.browserContext,
          [...activeSkillNames],
          allSkills,
        );

        const tools = this.toolRegistry.toOpenAISchema();

        // ── 流式调用 LLM ──
        let streamingContent = '';
        let finishReason: 'stop' | 'tool_calls' | 'length' | null = null;

        // 累积流式 tool_calls delta（按 index 分组）
        const toolCallDeltas = new Map<
          number,
          {
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }
        >();

        const streamChunkHandler = (chunk: StreamChunk) => {
          const choice = chunk.choices?.[0];
          if (!choice) return;

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }

          const delta = choice.delta;
          if (delta.content) {
            streamingContent += delta.content;
            this.hooks?.onStreamChunk?.(delta.content);
          }

          if (delta.reasoning_content && this.hooks?.onReasoningChunk) {
            this.hooks.onReasoningChunk(delta.reasoning_content);
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = toolCallDeltas.get(tc.index) ?? {};
              toolCallDeltas.set(tc.index, {
                id: tc.id ?? existing.id,
                type: tc.type ?? existing.type,
                function: {
                  name: tc.function?.name ?? existing.function?.name ?? '',
                  arguments:
                    (existing.function?.arguments ?? '') +
                    (tc.function?.arguments ?? ''),
                },
              });
            }
          }

          // 流式响应的最后 chunk 可能包含 usage
          if (chunk.usage) {
            totalPrompt += chunk.usage.prompt_tokens;
            totalCompletion += chunk.usage.completion_tokens;
          }
        };

        try {
          await llmClient.chatStream(
            {
              model: input.providerConfig.model,
              messages,
              tools,
              reasoning_effort: this.config.reasoningEffort,
            },
            streamChunkHandler,
            this.abortController.signal,
            (reasoning: string) => {
              this.hooks?.onReasoningChunk?.(reasoning);
            },
          );
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            finalMessage = '操作已被中止。';
            break;
          }
          throw err;
        }

        if (!finishReason) {
          finalMessage = 'LLM 未返回有效响应。';
          break;
        }

        if (finishReason === 'tool_calls' && toolCallDeltas.size > 0) {
          // 流式构建 tool_calls
          const streamToolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];
          for (const [, delta] of toolCallDeltas) {
            if (delta.id && delta.function?.name && delta.function.arguments) {
              streamToolCalls.push({
                id: delta.id,
                type: 'function',
                function: {
                  name: delta.function.name,
                  arguments: delta.function.arguments,
                },
              });
            }
          }

          const assistantMsg = {
            role: 'assistant' as const,
            content: streamingContent || null,
            tool_calls: streamToolCalls,
          };
          messages.push(assistantMsg);
          // 持久化中间 assistant(tool_calls) 消息，确保刷新后 ContextBuilder 能重建完整序列
          await this.conversationManager.addMessage(input.conversationId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: streamingContent ?? '',
            toolCalls: streamToolCalls.map((tc) => {
              let parsedParams: Record<string, unknown>;
              try {
                parsedParams = JSON.parse(tc.function.arguments);
              } catch {
                parsedParams = { __raw: tc.function.arguments };
              }
              return {
                id: tc.id,
                name: tc.function.name,
                params: parsedParams,
                result: 'pending',
              };
            }),
            timestamp: Date.now(),
          });

          for (const tc of streamToolCalls) {
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

            // ── Skill tool call interception ──
            if (tc.function.name === 'skill') {
              const skillName = params.name as string | undefined;
              const matchedSkill = allSkills.find((s) => s.name === skillName);
              if (matchedSkill) {
                activeSkillNames.add(matchedSkill.name);
                const toolMsg = {
                  role: 'tool' as const,
                  tool_call_id: tc.id,
                  content: JSON.stringify({ success: true, data: { skill: matchedSkill.name } }),
                };
                messages.push(toolMsg);
                await this.conversationManager.addMessage(input.conversationId, {
                  id: crypto.randomUUID(),
                  role: 'tool',
                  content: toolMsg.content,
                  toolCallId: tc.id,
                  timestamp: Date.now(),
                });
                invalidRetries = 0;
                continue;
              } else {
                const toolMsg = {
                  role: 'tool' as const,
                  tool_call_id: tc.id,
                  content: JSON.stringify({
                    success: false,
                    error: `未找到技能 "${skillName}"，可用技能：${allSkills.map((s) => s.name).join(', ') ?? '无'}`,
                  }),
                };
                toolCalls.push({
                  toolName: tc.function.name,
                  params,
                  result: { success: false, error: `未找到技能 "${skillName}"` },
                  riskLevel: 'low',
                  confirmed: false,
                  timestamp: Date.now(),
                  toolCallId: tc.id,
                });
                messages.push(toolMsg);
                await this.conversationManager.addMessage(input.conversationId, {
                  id: crypto.randomUUID(),
                  role: 'tool',
                  content: toolMsg.content,
                  toolCallId: tc.id,
                  timestamp: Date.now(),
                });
                invalidRetries = 0;
                continue;
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

            let affectedObjects: Array<{ type: string; title?: string; url?: string; reason?: string }> = [];
            let warnings: string[] = [];
            if (check.requiresPreflight && tool.preflight) {
              const preflightResult = await tool.preflight(params);
              affectedObjects = preflightResult.affectedObjects ?? [];
              warnings = preflightResult.warnings ?? [];
            }

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

            let result: import('@/shared/types').ToolResult;
            try {
              result = await tool.execute(params);
            } catch (err) {
              toolCalls.push({
                toolName: tc.function.name,
                params,
                result: { success: false, error: (err as Error).message },
                riskLevel: check.riskLevel,
                confirmed: check.requiresConfirmation,
                timestamp: Date.now(),
                toolCallId: tc.id,
              });
              const errorMsg = {
                role: 'tool' as const,
                tool_call_id: tc.id,
                content: `错误: ${(err as Error).message}`,
              };
              messages.push(errorMsg);
              await this.conversationManager.addMessage(input.conversationId, {
                id: crypto.randomUUID(),
                role: 'tool',
                content: errorMsg.content,
                toolCallId: tc.id,
                timestamp: Date.now(),
              });
              this.hooks?.onToolCall?.(toolCalls[toolCalls.length - 1]);
              invalidRetries = 0;
              continue;
            }
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
          finalMessage = streamingContent;
          break;
        }
      }

      if (round >= this.config.maxToolRounds && !finalMessage) {
        finalMessage = '操作步骤过多，已达到最大执行轮次。';
      }

      // 4. Store assistant response（toolCalls 已在中间消息持久化，此处只存最终文本）
      await this.conversationManager.addMessage(input.conversationId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: finalMessage,
        timestamp: Date.now(),
      });

      // 5. Check if summary needed
      await this.summaryManager.checkAndSummarize(input.conversationId, llmClient);

      return { finalMessage, toolCalls, tokenUsage: { prompt: totalPrompt, completion: totalCompletion } };
    } finally {
      this.abortController = null;
    }
  }
}
