import type { IAgentRuntime, AgentRunInput, AgentRunOutput, AgentConfig, ToolCallRecord } from '@/shared/types/agent';
import type { IToolRegistry, ToolDefinition } from '@/registry/types';
import type { IGuardrail, GuardrailContext } from '@/shared/types/guardrail';
import type { IConversationManager, StoredMessage } from '@/shared/types/conversation';
import type { ProviderConfig } from '@/shared/types/llm';
import type { LowSensitivityContext } from '@/shared/types/browser';
import type { JevSettings } from '@/shared/types/storage';
import type { ToolResult, RiskLevel } from '@/shared/types/tool';
import { ToolLoopAgent, generateText, isLoopFinished, pruneMessages } from 'ai';
import type {
  ModelMessage,
  ToolModelMessage,
  Tool as AISdkTool,
  StepResult,
  LanguageModel,
  TypedToolCall,
  TypedToolResult,
} from 'ai';
import { createLanguageModel } from '@/provider/language-model';
import { jsonSchemaToZod } from '@/shared/json-schema-to-zod';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { estimateTokens } from '@/shared/token-estimate';
import {
  buildSummaryPrompt,
  calculateContextBudget,
  selectSummaryCutoff,
} from './conversation-compaction';
import { ToolClassifier } from './tool-classifier';
import { CircuitBreaker, formatInterruptionMessage } from './circuit-breaker';
import type { AgentRunInterruption } from './circuit-breaker';
import { TOOL_CATEGORY_DESCRIPTIONS } from '@/shared/tool-categories';
import type { ToolCategory } from '@/shared/types/tool';
import { reconstructToolProtocol } from '@/shared/tool-protocol';
import { DEFAULT_AGENT_CONFIG } from './agent-config';

/** 常驻类别：高频操作不参与懒加载过滤，分类失效时仍有核心能力可用 */
const CORE_TOOL_CATEGORIES: readonly ToolCategory[] = [
  'tabs',
  'windows',
  'tabGroups',
  'page',
];

/** 单个工具结果进入上下文的长度上限，超出即截断（保护长文本类工具） */
const MAX_TOOL_RESULT_CHARS = 8_000;

const RECENT_TURNS_TO_KEEP = 4;
const conversationCompactions = new Map<string, Promise<boolean>>();

function mapReasoningEffort(effort?: AgentConfig['reasoningEffort']): 'low' | 'medium' | 'high' | 'xhigh' | undefined {
  if (!effort) return undefined;
  return effort === 'max' ? 'xhigh' : effort;
}

/** Agent 接口所需的工具集类型 */
type AdapterTools = Record<string, AISdkTool>;

/** StepResult 中本模块使用的字段：工具调用/结果，以及识别 tool-error 所需的 content */
type StepToolData = {
  toolCalls?: Array<TypedToolCall<Record<string, AISdkTool>>>;
  toolResults?: Array<TypedToolResult<Record<string, AISdkTool>>>;
  content?: ReadonlyArray<{ type: string; toolCallId?: string; error?: unknown }>;
};

/** toolApproval 回调请求参数 */
export interface ToolApprovalRequest {
  toolName: string;
  params: Record<string, unknown>;
  reason: string;
  riskLevel: 'high' | 'critical';
  affectedObjects?: Array<{ type: string; id?: string; title?: string; url?: string; reason?: string }>;
}

/** toolApproval 用户确认回调签名 */
export type OnRequestApproval = (request: ToolApprovalRequest) => Promise<'approve' | 'deny'>;

export class ToolLoopAdapter implements IAgentRuntime {
  private abortController: AbortController | null = null;
  private _agent: ToolLoopAgent | null = null;
  private _tools: AdapterTools | null = null;
  private toolClassifier: ToolClassifier;
  /** 本次运行（run）的熔断状态；每次 run 前重置 */
  private circuitBreaker = new CircuitBreaker();
  private onRequestApproval?: OnRequestApproval;
  /** 缓存的 LanguageModel；provider 或模型变化时由调用方重建 adapter */
  private _model: Promise<LanguageModelV4> | null = null;
  /** 缓存的 guardrail 上下文，由 run() 入口构建，executeTool/filterResult 复用 */
  private guardrailContext: GuardrailContext = {
    isLocalTrusted: false,
    expertModeEnabled: false,
    expertSwitches: {},
    grantedPermissions: [],
    sessionGrants: { sensitiveDataAllowed: false },
  };
  /**
   * 本次 run 第 0 步确定的活跃工具子集，供后续步骤继承。
   * 不继承时 SDK 会在每个新步骤回退到全部工具，上下文随步数反复膨胀。
   */
  private lastActiveTools?: string[];

  constructor(
    private toolRegistry: IToolRegistry,
    private guardrail: IGuardrail,
    private conversationManager: IConversationManager,
    private providerConfig: ProviderConfig,
    private modelId: string,
    private agentConfig: AgentConfig = DEFAULT_AGENT_CONFIG as AgentConfig,
    onRequestApproval?: OnRequestApproval,
    private jevSettings: JevSettings = { enabled: false, apiKey: '' },
  ) {
    this.onRequestApproval = onRequestApproval;
    this.toolClassifier = new ToolClassifier();
  }

  private get tools(): AdapterTools {
    if (!this._tools) {
      this._tools = this.buildTools();
    }
    return this._tools;
  }

  // ─── IAgentRuntime 接口 ──────────────────────────────

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
    this._agent = null;
  }

  async run(input: AgentRunInput): Promise<AgentRunOutput & AgentRunInterruption> {
    console.debug('[ToolLoopAdapter] run() 开始', { conversationId: input.conversationId });
    this.abortController = new AbortController();
    this.circuitBreaker.reset();
    this.lastActiveTools = undefined;
    const toolCalls: ToolCallRecord[] = [];
    const persistenceTasks: Promise<void>[] = [];
    // 本次输入的唯一身份：用于重建历史时排除「已落库的本轮输入」，
    // 而不是按文本比较（相同文本的上一条用户消息必须保留）。
    const currentUserMessageId = crypto.randomUUID();
    // 步骤落库串行链：onStepFinish 可能连续触发且不等待返回的 Promise，
    // 必须保证前一步整批写完再写下一步，否则时间戳与步骤顺序会交错。
    let persistenceChain: Promise<void> = Promise.resolve();
    const persistStep = (stepResult: StepResult<Record<string, AISdkTool>>) => {
      const task = persistenceChain.then(
        () => this.persistStepMessages(input.conversationId, stepResult),
      );
      // 单独挂一个消费分支，避免失败在 await 之前变成未处理的 rejection；
      // persistenceTasks 保留原始 Promise，让 run() 最终感知失败。
      persistenceChain = task.catch(() => {});
      persistenceTasks.push(task);
    };

    try {
      console.debug('[ToolLoopAdapter] buildMessages 开始');
      let messages = await this.buildMessages(input, currentUserMessageId);
      const compacted = await this.compactConversationIfNeeded(input, messages);

      await this.conversationManager.addMessage(input.conversationId, {
        id: currentUserMessageId,
        role: 'user',
        content: input.userMessage,
      });
      if (compacted) {
        messages = await this.buildMessages(input, currentUserMessageId);
      }
      console.debug('[ToolLoopAdapter] buildMessages 完成, count:', messages.length);

      console.debug('[ToolLoopAdapter] ensureAgentCreated');
      await this.ensureAgentCreated(input);

      let accumulatedText = '';
      let accumulatedReasoning = '';

      console.debug('[ToolLoopAdapter] agent.stream() 开始');
      const result = await this._agent!.stream({
        messages,
        abortSignal: this.abortController.signal,
        onStepFinish: (stepResult: StepResult<Record<string, AISdkTool>>) => {
          console.debug('[ToolLoopAdapter] onStepFinish', {
            hasText: !!stepResult.text,
            reasoningLen: stepResult.reasoningText?.length ?? 0,
            toolCount: stepResult.toolCalls?.length ?? 0,
          });
          this.recordStepToolCalls(stepResult, toolCalls, input.callbacks?.onToolCall);
          persistStep(stepResult);
        },
      });

      console.debug('[ToolLoopAdapter] 消费 stream 事件...');
      for await (const part of result.stream) {
        if (part.type === 'text-delta') {
          accumulatedText += part.text;
          input.callbacks?.onStreamChunk?.(part.text);
        } else if (part.type === 'reasoning-delta') {
          accumulatedReasoning += part.text;
          input.callbacks?.onReasoningChunk?.(part.text);
        } else if (part.type === 'error') {
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        }
      }
      console.debug('[ToolLoopAdapter] stream 消费完成, text:', accumulatedText.length, 'reasoning:', accumulatedReasoning.length);

      const finalStep = await result.finalStep;
      // 注意：result.usage 是所有 step 的累计值（多步工具调用会把完整上下文
      // 反复发送，累计可达百万级），不能用于表示"当前上下文占用"。
      // 取最后一步的单步 usage —— 最后一步的 inputTokens 即最近一次请求
      // 发送给 LLM 的完整上下文（系统提示+历史+工具结果）。
      const usage = finalStep.usage ?? (await result.usage);
      // 熔断：loop 已由 stopWhen 提前结束，这里补齐面向用户的停止原因
      const interruption = this.circuitBreaker.tripReason;
      const assistantContent = interruption
        ? formatInterruptionMessage(interruption, finalStep.text || accumulatedText)
        : finalStep.text || accumulatedText;
      if (interruption) {
        input.callbacks?.onStreamChunk?.(accumulatedText ? `\n\n${interruption.message}` : interruption.message);
      }
      await Promise.all(persistenceTasks);
      console.debug('[ToolLoopAdapter] 执行完成', {
        toolCalls: toolCalls.length,
        usage,
        interrupted: interruption?.reason,
      });

      await this.conversationManager.addMessage(input.conversationId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantContent,
        reasoningContent: finalStep.reasoningText || accumulatedReasoning || undefined,
      });

      const output: AgentRunOutput & AgentRunInterruption = {
        finalMessage: interruption ? assistantContent : finalStep.text,
        toolCalls,
        tokenUsage: usage
          ? { prompt: usage.inputTokens ?? 0, completion: usage.outputTokens ?? 0 }
          : undefined,
      };
      if (interruption) {
        output.stopReason = 'interrupted';
        output.interruption = interruption;
      }
      return output;
    } catch (err) {
      await Promise.allSettled(persistenceTasks);
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ToolLoopAdapter] run() 异常', {
        errorType: err instanceof Error ? err.name : typeof err,
      });
      await this.conversationManager.addMessage(input.conversationId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: message.startsWith('Error:') ? message : `Error: ${message}`,
      });
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  // ─── 私有方法 ──────────────────────────────────────────

  /** 为 run() 路径创建 agent（带 run() 特有的 onStepFinish 和正确的 guardrail 上下文） */
  private async ensureAgentCreated(input: AgentRunInput): Promise<void> {
    if (this._agent) {
      this._agent = null;
    }
    // 构建并缓存 guardrail 上下文，供 createToolApproval / executeTool / filterResult 共用
    this.guardrailContext = {
      isLocalTrusted: this.providerConfig.isLocalTrusted,
      expertModeEnabled: input.expertModeSettings?.enabled ?? false,
      expertSwitches: input.expertModeSettings?.switches ?? ({} as Record<string, boolean>),
      grantedPermissions: input.grantedPermissions ?? ([] as string[]),
      sessionGrants: { sensitiveDataAllowed: false },
    };
    const toolCalls: ToolCallRecord[] = [];
    this.abortController = new AbortController();
    this._agent = new ToolLoopAgent({
      model: await this.createModel(),
      maxOutputTokens: this.getModelConfig()?.defaults?.maxOutputTokens,
      temperature: this.getModelConfig()?.defaults?.temperature,
      reasoning: mapReasoningEffort(this.agentConfig.reasoningEffort),
      tools: this.tools,
      allowSystemInMessages: true,
      stopWhen: [
        // 不设固定步数上限：循环何时结束由模型是否继续调用工具决定。
        // isLoopFinished() 永不返回 true，显式声明「让循环自然收敛」——
        // 省略 stopWhen 时 ToolLoopAgent 会默认在 20 步后停止。
        isLoopFinished(),
        // 熔断条件：重扫全部 steps，CircuitBreaker 按 toolCallId 去重不会重复计数
        ({ steps }) => {
          for (const step of steps) {
            this.circuitBreaker.recordStep({
              toolCalls: step.toolCalls,
              toolResults: step.toolResults,
              toolErrors: step.content.flatMap((part) => (
                part.type === 'tool-error' ? [{ toolCallId: part.toolCallId }] : []
              )),
            });
          }
          const trip = this.circuitBreaker.tripReason;
          if (trip) {
            console.warn('[ToolLoopAdapter] 熔断触发', { reason: trip.reason, toolName: trip.toolName });
          }
          return trip !== null;
        },
      ],
      toolApproval: this.createToolApproval(),
      prepareStep: async ({ messages, stepNumber, model }) => {
        console.debug('[ToolLoopAdapter] prepareStep step:', stepNumber, 'totalTools:', Object.keys(this.tools).length);
        const toolFilter = await this.classifyAndFilterTools(messages, stepNumber, model);
        const prunedMessages = this.pruneContextIfNeeded(
          messages,
          input.modelConfig?.defaults?.maxOutputTokens,
        );
        const result = { ...(prunedMessages ? { messages: prunedMessages } : {}), ...toolFilter };
        console.debug('[ToolLoopAdapter] prepareStep result:', {
          activeTools: result.activeTools?.length ?? 'all',
          contextManaged: !!prunedMessages,
        });
        return result;
      },
      onStepFinish: (stepResult: StepResult<Record<string, AISdkTool>>) => {
        this.recordStepToolCalls(stepResult, toolCalls);
      },
    });
  }

  /** 创建 toolApproval 函数 */
  private createToolApproval() {
    return async ({ toolCall }: { toolCall: { toolName: string; input: unknown } }) => {
      const guardrailCtx = this.guardrailContext;

      const check = await this.guardrail.check(
        toolCall.toolName,
        toolCall.input as Record<string, unknown>,
        guardrailCtx,
      );

      if (!check.allowed) {
        return { type: 'denied' as const, reason: check.reason };
      }

      switch (check.riskLevel) {
        case 'low':
        case 'medium':
          return { type: 'approved' as const };
        case 'high': {
          if (guardrailCtx.isLocalTrusted) return { type: 'approved' as const };
          if (this.onRequestApproval) {
            // 在确认前执行 preflight，获取受影响对象清单
            let affectedObjects: ToolApprovalRequest['affectedObjects'];
            const tool = this.toolRegistry.getTool(toolCall.toolName);
            if (check.requiresPreflight && tool?.preflight) {
              try {
                const preflightResult = await tool.preflight(toolCall.input as Record<string, unknown>);
                affectedObjects = preflightResult.affectedObjects;
              } catch {
                // preflight 失败不阻止确认流程
              }
            }
            const decision = await this.onRequestApproval({
              toolName: toolCall.toolName,
              params: toolCall.input as Record<string, unknown>,
              reason: check.reason,
              riskLevel: 'high',
              affectedObjects,
            });
            return decision === 'approve'
              ? { type: 'approved' as const }
              : { type: 'denied' as const, reason: check.reason };
          }
          return { type: 'user-approval' as const };
        }
        case 'critical': {
          if (!guardrailCtx.expertModeEnabled) return { type: 'denied' as const, reason: '需要 Expert Mode' };
          if (this.onRequestApproval) {
            let affectedObjects: ToolApprovalRequest['affectedObjects'];
            const tool = this.toolRegistry.getTool(toolCall.toolName);
            if (check.requiresPreflight && tool?.preflight) {
              try {
                const preflightResult = await tool.preflight(toolCall.input as Record<string, unknown>);
                affectedObjects = preflightResult.affectedObjects;
              } catch {
                // preflight 失败不阻止确认流程
              }
            }
            const decision = await this.onRequestApproval({
              toolName: toolCall.toolName,
              params: toolCall.input as Record<string, unknown>,
              reason: check.reason,
              riskLevel: 'critical',
              affectedObjects,
            });
            return decision === 'approve'
              ? { type: 'approved' as const }
              : { type: 'denied' as const, reason: check.reason };
          }
          return { type: 'user-approval' as const };
        }
        default:
          return { type: 'approved' as const };
      }
    };
  }

  /** LLM 预分类用户意图，返回匹配的工具名列表作为 activeTools */
  private async classifyAndFilterTools(
    messages: ModelMessage[],
    stepNumber: number,
    model: LanguageModel,
  ): Promise<{ activeTools?: string[] }> {
    // 后续步骤沿用第 0 步确定的子集；返回 {} 会让 SDK 回退到全部工具
    if (stepNumber !== 0) {
      return { activeTools: this.lastActiveTools ?? this.getAvailableToolNames() };
    }

    const lastUserMsg = [...messages].reverse().find(
      (m): m is { role: 'user'; content: string } =>
        m.role === 'user' && typeof m.content === 'string',
    );
    if (!lastUserMsg) {
      console.debug('[ToolLoopAdapter] classify: 未找到用户消息');
      return this.fallbackToAvailableTools();
    }

    try {
      const jevEnabled = this.jevSettings.enabled && this.jevSettings.apiKey.trim().length > 0;
      console.debug('[ToolLoopAdapter] classify: 开始分类', { usingJev: jevEnabled });
      const categories = jevEnabled
        ? await this.toolClassifier.classify(lastUserMsg.content, model, {
          jevSettings: this.jevSettings,
          abortSignal: this.abortController?.signal,
        })
        : await this.toolClassifier.classify(lastUserMsg.content, model);
      console.debug('[ToolLoopAdapter] classify: 返回 categories:', categories);

      if (categories.length === 0) {
        console.debug('[ToolLoopAdapter] classify: 无匹配类别, 降级到可用工具');
        return this.fallbackToAvailableTools();
      }

      const baseTools = this.getBaseTools();
      const activeTools = baseTools
        .filter((t) => CORE_TOOL_CATEGORIES.includes(t.category) || categories.includes(t.category))
        .map((t) => t.name);

      console.debug('[ToolLoopAdapter] classify: 过滤结果', {
        totalTools: baseTools.length,
        matchedCategories: categories,
        coreCategories: CORE_TOOL_CATEGORIES,
        activeTools,
      });

      this.lastActiveTools = activeTools.length > 0 ? activeTools : baseTools.map((t) => t.name);
      return { activeTools: this.lastActiveTools };
    } catch (err) {
      console.warn('[ToolLoopAdapter] classify: 分类失败, 降级到可用工具', {
        errorType: err instanceof Error ? err.name : typeof err,
      });
      return this.fallbackToAvailableTools();
    }
  }

  /** 本次运行可用的工具：非 Expert Mode 下排除 expertOnly 与 expert 类别工具 */
  private getBaseTools(): ToolDefinition[] {
    return this.toolRegistry.getAllTools().filter(
      (t) => (!t.expertOnly && t.category !== 'expert') || this.guardrailContext.expertModeEnabled,
    );
  }

  private getAvailableToolNames(): string[] {
    return this.getBaseTools().map((t) => t.name);
  }

  /** 分类不可用时的降级：保留可用工具集合并记录，供后续步骤继承 */
  private fallbackToAvailableTools(): { activeTools: string[] } {
    this.lastActiveTools = this.getAvailableToolNames();
    return { activeTools: this.lastActiveTools };
  }

  /** 将 ToolDefinition[] 转换为 AI SDK ToolSet */
  private buildTools(): AdapterTools {
    const tools: AdapterTools = {};
    for (const t of this.toolRegistry.getAllTools()) {
      tools[t.name] = {
        description: t.description,
        inputSchema: jsonSchemaToZod(t.schema as unknown as Record<string, unknown>),
        execute: async (args, _opts) => {
          return this.executeTool(t, args as Record<string, unknown>);
        },
      } as AISdkTool;
    }
    return tools;
  }

  /** 执行单个工具：guardrail → preflight → execute → filterResult */
  private async executeTool(
    tool: ToolDefinition,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    // guardrail 检查 —— 复用 run() 入口构建的上下文，与 toolApproval 审批阶段一致
    const check = await this.guardrail.check(tool.name, params, this.guardrailContext);

    if (!check.allowed) {
      return { success: false, error: check.reason };
    }

    // preflight
    if (check.requiresPreflight && tool.preflight) {
      await tool.preflight(params);
    }

    // 执行
    const result = await tool.execute(params);

    // 过滤敏感数据 —— 复用同一上下文
    const filtered = this.guardrail.filterResultForRemote(tool, result, this.guardrailContext);

    // 截断超长结果，避免一次性挤占上下文
    return this.truncateToolResult(filtered);
  }

  /** 截断超过上限的工具结果，保留截断标记与原始长度信息 */
  private truncateToolResult(result: ToolResult): ToolResult {
    if (JSON.stringify(result).length <= MAX_TOOL_RESULT_CHARS) return result;

    if (typeof result.data === 'string' && result.data.length > MAX_TOOL_RESULT_CHARS) {
      return { ...result, data: this.truncateWithMarker(result.data) };
    }
    if (typeof result.error === 'string' && result.error.length > MAX_TOOL_RESULT_CHARS) {
      return { ...result, error: this.truncateWithMarker(result.error) };
    }
    const dataText = JSON.stringify(result.data ?? {});
    if (dataText.length > MAX_TOOL_RESULT_CHARS) {
      return { ...result, data: this.truncateWithMarker(dataText) };
    }
    return result;
  }

  private truncateWithMarker(text: string): string {
    return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[结果过长已截断，原始长度 ${text.length} 字符]`;
  }

  /** 构建初始 messages */
  private async buildMessages(
    input: AgentRunInput,
    currentUserMessageId?: string,
  ): Promise<ModelMessage[]> {
    const messages: ModelMessage[] = [];

    // 1. 静态 system prompt（保持前缀稳定以命中 provider prompt cache）
    messages.push(this.buildSystemMessage());
    // 2. 动态浏览器上下文（放在静态前缀之后，变化不影响缓存命中）
    messages.push(this.buildBrowserContextMessage(input.browserContext));

    // 2. Conversation summary
    const conversation = await this.conversationManager.get(input.conversationId);
    if (conversation?.summary) {
      messages.push({
        role: 'system',
        content: `## 对话摘要\n${conversation.summary}`,
      });
    }

    // 3. 摘要之后的完整历史；上下文裁剪交给 AI SDK prepareStep。
    const recentMessages = conversation
      ? conversation.messages.slice(conversation.summaryUpToIndex ?? 0)
      : await this.conversationManager.getRecentMessages(
        input.conversationId,
        Number.MAX_SAFE_INTEGER,
      );
    // 压缩后重建时本轮输入可能已落库：按本次输入的唯一 ID 排除，
    // 再统一在末尾追加一次。不能按文本比较——上一条同文用户消息是真实历史。
    const historyMessages = currentUserMessageId
      ? recentMessages.filter((message) => message.id !== currentUserMessageId)
      : recentMessages;
    // 存储顺序不可信（同毫秒按主键排序），先按显式关联重建调用/结果配对
    const { messages: history } = reconstructToolProtocol(historyMessages);
    const toolNames = new Map<string, string>();
    for (const msg of history) {
      if (msg.role !== 'assistant') continue;
      for (const toolCall of msg.toolCalls ?? []) {
        toolNames.set(toolCall.id, toolCall.name);
      }
    }
    for (const msg of history) {
      messages.push(this.convertToModelMessage(msg, toolNames.get(msg.toolCallId ?? '')));
    }

    // 4. 本轮输入始终追加且只追加一次
    messages.push({
      role: 'user',
      content: input.userMessage,
    });

    return messages;
  }

  private estimateContextTokens(messages: ModelMessage[]): number {
    const tools = this.toolRegistry.getAllTools().map(({ name, description, schema }) => ({
      name,
      description,
      schema,
    }));
    return estimateTokens(JSON.stringify(messages)) + estimateTokens(JSON.stringify(tools));
  }

  private pruneContextIfNeeded(
    messages: ModelMessage[],
    maxOutputTokens = this.getModelConfig()?.defaults?.maxOutputTokens
      ?? this.getModelConfig()?.limit?.output
      ?? 0,
  ): ModelMessage[] | undefined {
    const budget = calculateContextBudget(
      this.agentConfig.contextWindowTokens,
      maxOutputTokens,
      this.agentConfig.tokenBudgetMargin,
    );
    if (this.estimateContextTokens(messages) < budget.triggerTokens) return undefined;
    return pruneMessages({
      messages,
      reasoning: 'all',
      toolCalls: 'none',
      emptyMessages: 'remove',
    });
  }

  private async compactConversationIfNeeded(
    input: AgentRunInput,
    messages: ModelMessage[],
  ): Promise<boolean> {
    const maxOutputTokens = input.modelConfig?.defaults?.maxOutputTokens
      ?? input.modelConfig?.limit?.output
      ?? this.getModelConfig()?.defaults?.maxOutputTokens
      ?? this.getModelConfig()?.limit?.output
      ?? 0;
    const budget = calculateContextBudget(
      this.agentConfig.contextWindowTokens,
      maxOutputTokens,
      this.agentConfig.tokenBudgetMargin,
    );
    if (this.estimateContextTokens(messages) < budget.triggerTokens) return false;

    const pending = conversationCompactions.get(input.conversationId);
    if (pending) return pending;

    const compaction = this.compactConversation(input, budget, maxOutputTokens);
    conversationCompactions.set(input.conversationId, compaction);
    try {
      return await compaction;
    } finally {
      if (conversationCompactions.get(input.conversationId) === compaction) {
        conversationCompactions.delete(input.conversationId);
      }
    }
  }

  private async compactConversation(
    input: AgentRunInput,
    budget: ReturnType<typeof calculateContextBudget>,
    maxOutputTokens: number,
  ): Promise<boolean> {
    const conversation = await this.conversationManager.get(input.conversationId);
    if (!conversation) return false;

    const desiredSummaryTokens = Math.max(256, Math.min(2_000, Math.floor(budget.usableTokens * 0.05)));
    const summaryOutputTokens = maxOutputTokens > 0
      ? Math.min(desiredSummaryTokens, maxOutputTokens)
      : desiredSummaryTokens;
    const fixedMessages: ModelMessage[] = [
      this.buildSystemMessage(),
      this.buildBrowserContextMessage(input.browserContext),
      { role: 'user', content: input.userMessage },
    ];
    const rawTargetTokens = Math.max(
      1,
      budget.targetTokens - this.estimateContextTokens(fixedMessages) - summaryOutputTokens,
    );
    const startIndex = conversation.summaryUpToIndex ?? 0;
    const cutoff = selectSummaryCutoff(
      conversation.messages,
      startIndex,
      rawTargetTokens,
      RECENT_TURNS_TO_KEEP,
    );
    if (cutoff === null) return false;

    try {
      const result = await generateText({
        model: await this.createModel(),
        prompt: buildSummaryPrompt(
          conversation.messages.slice(startIndex, cutoff),
          conversation.summary,
        ),
        temperature: 0.2,
        maxOutputTokens: summaryOutputTokens,
      });
      const summary = result.text.trim();
      if (!summary) return false;
      await this.conversationManager.update(input.conversationId, {
        summary,
        summaryUpToIndex: cutoff,
      });
      return true;
    } catch (error) {
      console.warn('[ToolLoopAdapter] 上下文摘要失败，继续使用原始历史', {
        errorType: error instanceof Error ? error.name : typeof error,
      });
      return false;
    }
  }

  /**
   * 静态 system message：仅含固定指令与工具类别索引。
   * 内容不随会话变化，保证 provider 端 prompt caching 命中前缀。
   */
  private buildSystemMessage(): ModelMessage {
    const categoryIndex = (Object.keys(TOOL_CATEGORY_DESCRIPTIONS) as ToolCategory[])
      .map((category) => `- ${category}: ${TOOL_CATEGORY_DESCRIPTIONS[category]}`)
      .join('\n');

    const content = [
      `你是浏览器助手，可以管理用户的标签页、窗口、标签组等。`,
      ``,
      `## 可用工具类别`,
      categoryIndex,
    ].join('\n');

    return { role: 'system', content };
  }

  /**
   * 动态浏览器上下文：独立 system message，置于静态前缀之后。
   * 状态变化只影响后半段，不会破坏前缀缓存。
   */
  private buildBrowserContextMessage(browserContext: LowSensitivityContext): ModelMessage {
    return {
      role: 'system',
      content: `## 当前浏览器上下文\n${JSON.stringify(browserContext, null, 2)}`,
    };
  }

  /** StoredMessage → ModelMessage 转换 */
  private convertToModelMessage(msg: {
    id: string;
    role: string;
    content: string;
    toolCalls?: Array<{ id: string; name: string; params: Record<string, unknown> }>;
    toolCallId?: string;
  }, toolName?: string): ModelMessage {
    switch (msg.role) {
      case 'user':
        return { role: 'user', content: msg.content };
      case 'assistant': {
        const parts: Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }> = [];
        if (msg.content) {
          parts.push({ type: 'text', text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({
              type: 'tool-call' as const,
              toolCallId: tc.id,
              toolName: tc.name,
              input: tc.params,
            });
          }
        }
        return { role: 'assistant', content: parts.length > 0 ? parts : msg.content } as ModelMessage;
      }
      case 'tool':
        return {
          role: 'tool',
          content: [
            {
              type: 'tool-result' as const,
              toolCallId: msg.toolCallId ?? '',
              toolName: toolName ?? '',
              output: { type: 'text', value: msg.content },
            },
          ],
        } satisfies ToolModelMessage;
      default:
        return { role: 'user', content: msg.content };
    }
  }

  /** 创建 LanguageModel */
  private createModel(): Promise<LanguageModelV4> {
    if (!this._model) {
      this._model = createLanguageModel(
        this.providerConfig,
        this.modelId,
      ) as Promise<LanguageModelV4>;
    }
    return this._model;
  }

  private getModelConfig() {
    return this.providerConfig.models?.[this.modelId];
  }

  /**
   * 把 StepResult 还原成真实的 ToolResult。
   *
   * - 工具正常返回时，output 本身就是 ToolResult（executeTool 已归一化），直接透传，
   *   避免把 `{ success: false, error }` 二次包装成 `{ success: true, data: ... }`；
   * - 工具抛错时 AI SDK 不产出 toolResults，而是在 content 中给出 tool-error part，
   *   必须转成失败结果，绝不能伪造成功。
   */
  private resolveToolResult(
    tc: { toolCallId: string; toolName: string },
    stepResult: StepToolData,
  ): ToolResult {
    const tr = stepResult.toolResults?.find((r) => r.toolCallId === tc.toolCallId);
    if (tr?.output !== undefined) {
      if (tr.output !== null && typeof tr.output === 'object' && 'success' in (tr.output as Record<string, unknown>)) {
        return tr.output as ToolResult;
      }
      return { success: true, data: tr.output };
    }
    const errPart = stepResult.content?.find(
      (p) => p?.type === 'tool-error' && p?.toolCallId === tc.toolCallId,
    );
    if (errPart?.error) {
      const errMsg = errPart.error instanceof Error ? errPart.error.message : String(errPart.error);
      return { success: false, error: errMsg };
    }
    return { success: false, error: '工具执行未返回结果' };
  }

  /** 从 StepResult 中提取并记录工具调用 */
  private recordStepToolCalls(
    stepResult: StepToolData,
    toolCalls: ToolCallRecord[],
    onToolCall?: (record: ToolCallRecord) => void,
  ) {
    const stepToolCalls = stepResult.toolCalls ?? [];
    for (const tc of stepToolCalls) {
      const result = this.resolveToolResult(tc, stepResult);
      const record: ToolCallRecord = {
        toolName: tc.toolName,
        params: (tc.input as Record<string, unknown>) ?? {},
        result,
        riskLevel: 'low' as RiskLevel,
        confirmed: true,
        timestamp: Date.now(),
        toolCallId: tc.toolCallId,
      };
      toolCalls.push(record);
      onToolCall?.(record);
    }
  }

  /** 把同一工具步骤的调用行与结果行作为一批原子写入，保持步骤内顺序。 */
  private async persistStepMessages(
    conversationId: string,
    stepResult: StepToolData,
  ) {
    const stepToolCalls = stepResult.toolCalls ?? [];
    if (stepToolCalls.length === 0) return;

    // 同一步骤的 assistant 行 ID 预先确定：每个结果行通过 parentMessageId
    // 指回它，避免重复 toolCallId 或同毫秒写入时靠时间戳猜归属。
    const assistantMessageId = crypto.randomUUID();
    const rows: StoredMessage[] = [{
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      toolCalls: stepToolCalls.map((toolCall) => ({
        id: toolCall.toolCallId,
        name: toolCall.toolName,
        params: (toolCall.input as Record<string, unknown>) ?? {},
      })),
    }];

    for (const tc of stepToolCalls) {
      const result = this.resolveToolResult(tc, stepResult);
      rows.push({
        // 独立 UUID 作主键；原始 toolCallId 保留在字段里，不参与主键
        id: crypto.randomUUID(),
        role: 'tool',
        content: JSON.stringify(result),
        toolCallId: tc.toolCallId,
        parentMessageId: assistantMessageId,
      });
    }

    await this.conversationManager.addMessages(conversationId, rows);
  }
}
