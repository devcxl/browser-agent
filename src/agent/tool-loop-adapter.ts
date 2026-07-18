import type { IAgentRuntime, AgentRunInput, AgentRunOutput, AgentConfig, ToolCallRecord } from '@/shared/types/agent';
import type { IToolRegistry, ToolDefinition } from '@/registry/types';
import type { IGuardrail } from '@/shared/types/guardrail';
import type { IConversationManager } from '@/shared/types/conversation';
import type { ProviderConfig } from '@/shared/types/llm';
import type { LowSensitivityContext } from '@/shared/types/browser';
import type { ToolResult, RiskLevel } from '@/shared/types/tool';
import { ToolLoopAgent, generateText, isStepCount, isLoopFinished, pruneMessages } from 'ai';
import type {
  ModelMessage,
  ToolModelMessage,
  Tool as AISdkTool,
  StepResult,
  LanguageModel,
  TypedToolCall,
  TypedToolResult,
} from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { jsonSchemaToZod } from '@/shared/json-schema-to-zod';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { FEATURE_FLAGS } from '@/shared/feature-flags';
import { estimateTokens } from '@/shared/token-estimate';
import {
  buildSummaryPrompt,
  calculateContextBudget,
  selectSummaryCutoff,
} from './conversation-compaction';
import { ToolClassifier } from './tool-classifier';
import { DEFAULT_AGENT_CONFIG } from './system-prompt';

/** 默认最大工具循环轮数 */
const DEFAULT_MAX_STEPS = 99;
const RECENT_TURNS_TO_KEEP = 4;
const conversationCompactions = new Map<string, Promise<boolean>>();

function mapReasoningEffort(effort?: AgentConfig['reasoningEffort']): 'low' | 'medium' | 'high' | 'xhigh' | undefined {
  if (!effort) return undefined;
  return effort === 'max' ? 'xhigh' : effort;
}

/** Agent 接口所需的工具集类型 */
type AdapterTools = Record<string, AISdkTool>;

/** toolApproval 回调请求参数 */
export interface ToolApprovalRequest {
  toolName: string;
  params: Record<string, unknown>;
  reason: string;
  riskLevel: 'high' | 'critical';
}

/** toolApproval 用户确认回调签名 */
export type OnRequestApproval = (request: ToolApprovalRequest) => Promise<'approve' | 'deny'>;

export class ToolLoopAdapter implements IAgentRuntime {
  private abortController: AbortController | null = null;
  private _agent: ToolLoopAgent | null = null;
  private _tools: AdapterTools | null = null;
  private toolClassifier: ToolClassifier;
  private onRequestApproval?: OnRequestApproval;

  constructor(
    private toolRegistry: IToolRegistry,
    private guardrail: IGuardrail,
    private conversationManager: IConversationManager,
    private providerConfig: ProviderConfig,
    private modelId: string,
    private agentConfig: AgentConfig = DEFAULT_AGENT_CONFIG as AgentConfig,
    onRequestApproval?: OnRequestApproval,
  ) {
    this.onRequestApproval = onRequestApproval;
    this.toolClassifier = new ToolClassifier();
  }

  // ─── Agent 接口 ──────────────────────────────────────

  get version(): 'agent-v1' {
    return 'agent-v1';
  }

  get id(): string | undefined {
    return undefined;
  }

  get tools(): AdapterTools {
    if (!this._tools) {
      this._tools = this.buildTools();
    }
    return this._tools;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async generate(options: any): Promise<any> {
    const agent = this.getOrCreateAgent();
    return agent.generate(options);
  }

  async stream(options: any): Promise<any> {
    const agent = this.getOrCreateAgent();
    return agent.stream(options);
  }

  // ─── IAgentRuntime 接口 ──────────────────────────────

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
    this._agent = null;
  }

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    console.debug('[ToolLoopAdapter] run() 开始', { conversationId: input.conversationId, message: input.userMessage.slice(0, 100) });
    this.abortController = new AbortController();
    const toolCalls: ToolCallRecord[] = [];
    const persistenceTasks: Promise<void>[] = [];

    try {
      console.debug('[ToolLoopAdapter] buildMessages 开始');
      let messages = await this.buildMessages(input);
      const compacted = await this.compactConversationIfNeeded(input, messages);

      await this.conversationManager.addMessage(input.conversationId, {
        id: crypto.randomUUID(),
        role: 'user',
        content: input.userMessage,
      });
      if (compacted) {
        messages = await this.buildMessages(input);
      }
      console.debug('[ToolLoopAdapter] buildMessages 完成, count:', messages.length);

      console.debug('[ToolLoopAdapter] ensureAgentCreated');
      this.ensureAgentCreated(input);

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
          persistenceTasks.push(this.persistStepMessages(input.conversationId, stepResult));
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
      const usage = await result.usage;
      await Promise.all(persistenceTasks);
      console.debug('[ToolLoopAdapter] 执行完成', {
        finalText: finalStep.text?.slice(0, 80),
        toolCalls: toolCalls.length,
        usage,
      });

      await this.conversationManager.addMessage(input.conversationId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: finalStep.text || accumulatedText,
        reasoningContent: finalStep.reasoningText || accumulatedReasoning || undefined,
      });

      return {
        finalMessage: finalStep.text,
        toolCalls,
        tokenUsage: usage
          ? { prompt: usage.inputTokens ?? 0, completion: usage.outputTokens ?? 0 }
          : undefined,
      };
    } catch (err) {
      await Promise.allSettled(persistenceTasks);
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ToolLoopAdapter] run() 异常', err);
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

  /** 懒加载创建 ToolLoopAgent（仅首次或 abort 后重建） */
  private getOrCreateAgent(): ToolLoopAgent {
    if (!this._agent) {
      this.abortController = new AbortController();
      this._agent = new ToolLoopAgent({
        model: this.createModel(),
        maxOutputTokens: this.getModelConfig()?.defaults?.maxOutputTokens,
        temperature: this.getModelConfig()?.defaults?.temperature,
        reasoning: mapReasoningEffort(this.agentConfig.reasoningEffort),
        tools: this.tools,
        allowSystemInMessages: true,
        stopWhen: [isStepCount(DEFAULT_MAX_STEPS), isLoopFinished()],
        toolApproval: this.createToolApproval(),
        prepareStep: async ({ messages, stepNumber, model }) => {
          // 工具懒加载：step 0 时 LLM 预分类
          const toolFilter = await this.classifyAndFilterTools(messages, stepNumber, model);
          const prunedMessages = this.pruneContextIfNeeded(messages);
          return { ...(prunedMessages ? { messages: prunedMessages } : {}), ...toolFilter };
        },
        onStepFinish: () => {
          // toolCalls 记录由 useChat 框架处理，此处不重复记录
        },
      });
    }
    return this._agent;
  }

  /** 为 run() 路径创建 agent（带 run() 特有的 onStepFinish 和正确的 guardrail 上下文） */
  private ensureAgentCreated(input: AgentRunInput): void {
    if (this._agent) {
      this._agent = null;
    }
    const toolCalls: ToolCallRecord[] = [];
    this.abortController = new AbortController();
    this._agent = new ToolLoopAgent({
      model: this.createModel(),
      maxOutputTokens: this.getModelConfig()?.defaults?.maxOutputTokens,
      temperature: this.getModelConfig()?.defaults?.temperature,
      reasoning: mapReasoningEffort(this.agentConfig.reasoningEffort),
      tools: this.tools,
      allowSystemInMessages: true,
      stopWhen: [isStepCount(DEFAULT_MAX_STEPS), isLoopFinished()],
      toolApproval: this.createToolApproval(input),
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
          if (FEATURE_FLAGS.usePrepareStepContext) return result;
          console.debug('[ToolLoopAdapter] prepareStep activeTools:', toolFilter.activeTools?.length ?? 'all');
          return toolFilter;
        },
        onStepFinish: (stepResult: StepResult<Record<string, AISdkTool>>) => {
          this.recordStepToolCalls(stepResult, toolCalls);
        },
      });
    }

  /** 创建 toolApproval 函数 */
  private createToolApproval(input?: AgentRunInput) {
    return async ({ toolCall }: { toolCall: { toolName: string; input: unknown } }) => {
      if (!FEATURE_FLAGS.useToolApproval) {
        return { type: 'approved' as const };
      }

      const guardrailCtx = {
        isLocalTrusted: this.providerConfig.isLocalTrusted,
        expertModeEnabled: input?.expertModeSettings?.enabled ?? false,
        expertSwitches: input?.expertModeSettings?.switches ?? ({} as Record<string, boolean>),
        grantedPermissions: input?.grantedPermissions ?? ([] as string[]),
        sessionGrants: { sensitiveDataAllowed: false },
      };

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
        case 'high':
          if (guardrailCtx.isLocalTrusted) return { type: 'approved' as const };
          if (this.onRequestApproval) {
            const decision = await this.onRequestApproval({
              toolName: toolCall.toolName,
              params: toolCall.input as Record<string, unknown>,
              reason: check.reason,
              riskLevel: 'high',
            });
            return decision === 'approve'
              ? { type: 'approved' as const }
              : { type: 'denied' as const, reason: check.reason };
          }
          return { type: 'user-approval' as const };
        case 'critical':
          if (!guardrailCtx.expertModeEnabled) return { type: 'denied' as const, reason: '需要 Expert Mode' };
          if (this.onRequestApproval) {
            const decision = await this.onRequestApproval({
              toolName: toolCall.toolName,
              params: toolCall.input as Record<string, unknown>,
              reason: check.reason,
              riskLevel: 'critical',
            });
            return decision === 'approve'
              ? { type: 'approved' as const }
              : { type: 'denied' as const, reason: check.reason };
          }
          return { type: 'user-approval' as const };
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
    if (!FEATURE_FLAGS.useToolLazyLoad || stepNumber !== 0) {
      if (stepNumber === 0) console.debug('[ToolLoopAdapter] classify: FLAG=false, skip');
      return {};
    }

    const lastUserMsg = [...messages].reverse().find(
      (m): m is { role: 'user'; content: string } =>
        m.role === 'user' && typeof m.content === 'string',
    );
    if (!lastUserMsg) {
      console.debug('[ToolLoopAdapter] classify: 未找到用户消息');
      return {};
    }

    try {
      console.debug('[ToolLoopAdapter] classify: 开始 LLM 分类, message:', lastUserMsg.content.slice(0, 80));
      const categories = await this.toolClassifier.classify(
        lastUserMsg.content,
        model,
      );
      console.debug('[ToolLoopAdapter] classify: LLM 返回 categories:', categories);

      if (categories.length === 0) {
        console.debug('[ToolLoopAdapter] classify: 无匹配类别, 降级到全量工具');
        return {};
      }

      const allTools = this.toolRegistry.getAllTools();
      const toolNames = allTools
        .filter((t) => categories.includes(t.category))
        .map((t) => t.name);

      console.debug('[ToolLoopAdapter] classify: 过滤结果', {
        totalTools: allTools.length,
        matchedCategories: categories,
        activeTools: toolNames,
      });

      return toolNames.length > 0 ? { activeTools: toolNames } : {};
    } catch (err) {
      console.warn('[ToolLoopAdapter] classify: 分类失败, 降级到全量工具', err);
      return {};
    }
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
    // guardrail 检查
    const check = await this.guardrail.check(tool.name, params, {
      isLocalTrusted: this.providerConfig.isLocalTrusted,
      expertModeEnabled: false,
      expertSwitches: {},
      grantedPermissions: [],
      sessionGrants: { sensitiveDataAllowed: false },
    });

    if (!check.allowed) {
      return { success: false, error: check.reason };
    }

    // preflight
    if (check.requiresPreflight && tool.preflight) {
      await tool.preflight(params);
    }

    // 执行
    const result = await tool.execute(params);

    // 过滤敏感数据
    return this.guardrail.filterResultForRemote(tool, result, {
      isLocalTrusted: this.providerConfig.isLocalTrusted,
      expertModeEnabled: false,
      expertSwitches: {},
      grantedPermissions: [],
      sessionGrants: { sensitiveDataAllowed: false },
    });
  }

  /** 构建初始 messages */
  private async buildMessages(input: AgentRunInput): Promise<ModelMessage[]> {
    const messages: ModelMessage[] = [];

    // 1. System prompt
    messages.push(this.buildSystemMessage(input.browserContext));

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
        this.agentConfig.maxContextMessages,
      );
    const toolNames = new Map<string, string>();
    const pendingToolCallIds = new Set<string>();
    for (const msg of recentMessages) {
      if (msg.role === 'assistant') {
        for (const toolCall of msg.toolCalls ?? []) {
          toolNames.set(toolCall.id, toolCall.name);
          pendingToolCallIds.add(toolCall.id);
        }
      }
      if (msg.role === 'tool') {
        if (!msg.toolCallId || !pendingToolCallIds.delete(msg.toolCallId)) continue;
      }
      messages.push(this.convertToModelMessage(msg, toolNames.get(msg.toolCallId ?? '')));
    }

    // 4. Current user message (if not already in history)
    const lastMsg = recentMessages[recentMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== input.userMessage) {
      messages.push({
        role: 'user',
        content: input.userMessage,
      });
    }

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
    if (!FEATURE_FLAGS.usePrepareStepContext) return undefined;
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
      this.buildSystemMessage(input.browserContext),
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
        model: this.createModel(),
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
      console.warn('[ToolLoopAdapter] 上下文摘要失败，继续使用原始历史', error);
      return false;
    }
  }

  /** 构建 System Message（含工具列表描述） */
  private buildSystemMessage(browserContext: LowSensitivityContext): ModelMessage {
    const tools = this.toolRegistry.getAllTools();
    const toolsDesc = tools.map((t) => `- **${t.name}**: ${t.description}`).join('\n');

    const content = [
      `你是浏览器助手，可以管理用户的标签页、窗口、标签组等。`,
      ``,
      `## 当前浏览器上下文`,
      JSON.stringify(browserContext, null, 2),
      ``,
      `## 可用工具`,
      toolsDesc,
    ].join('\n');

    return { role: 'system', content };
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
  private createModel(): LanguageModelV4 {
    const headers = {
      ...(this.providerConfig.apiKey ? { Authorization: `Bearer ${this.providerConfig.apiKey}` } : {}),
      ...this.providerConfig.extraHeaders,
    };
    const provider = createOpenAICompatible({
      name: this.providerConfig.name,
      baseURL: this.providerConfig.api ?? this.providerConfig.endpoint ?? '',
      headers,
    });
    return provider.chatModel(this.modelId) as unknown as LanguageModelV4;
  }

  private getModelConfig() {
    return this.providerConfig.models?.[this.modelId];
  }

  /** 从 StepResult 中提取并记录工具调用 */
  private recordStepToolCalls(
    stepResult: { toolCalls?: Array<TypedToolCall<Record<string, AISdkTool>>>; toolResults?: Array<TypedToolResult<Record<string, AISdkTool>>> },
    toolCalls: ToolCallRecord[],
    onToolCall?: (record: ToolCallRecord) => void,
  ) {
    const stepToolCalls = stepResult.toolCalls ?? [];
    const stepToolResults = stepResult.toolResults ?? [];
    for (const tc of stepToolCalls) {
      const tr = stepToolResults.find((r) => r.toolCallId === tc.toolCallId);
      const result: ToolResult = tr?.output
        ? { success: true, data: tr.output }
        : { success: true };
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

  /** 按 assistant tool-call → tool-result 顺序持久化，保证下一轮历史符合协议。 */
  private async persistStepMessages(
    conversationId: string,
    stepResult: { toolCalls?: Array<TypedToolCall<Record<string, AISdkTool>>>; toolResults?: Array<TypedToolResult<Record<string, AISdkTool>>> },
  ) {
    const stepToolCalls = stepResult.toolCalls ?? [];
    const stepToolResults = stepResult.toolResults ?? [];
    if (stepToolCalls.length === 0) return;

    await this.conversationManager.addMessage(conversationId, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      toolCalls: stepToolCalls.map((toolCall) => ({
        id: toolCall.toolCallId,
        name: toolCall.toolName,
        params: (toolCall.input as Record<string, unknown>) ?? {},
      })),
    });

    for (const tc of stepToolCalls) {
      const tr = stepToolResults.find((r) => r.toolCallId === tc.toolCallId);
      await this.conversationManager.addMessage(conversationId, {
        id: tc.toolCallId,
        role: 'tool',
        content: JSON.stringify(tr?.output ?? { success: true }),
        toolCallId: tc.toolCallId,
      });
    }
  }
}
