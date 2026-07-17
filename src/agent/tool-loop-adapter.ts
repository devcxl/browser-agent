import type { IAgentRuntime, AgentRunInput, AgentRunOutput, AgentConfig, ToolCallRecord } from '@/shared/types/agent';
import type { IToolRegistry, ToolDefinition } from '@/registry/types';
import type { IGuardrail } from '@/shared/types/guardrail';
import type { IConversationManager } from '@/shared/types/conversation';
import type { ProviderConfig } from '@/shared/types/llm';
import type { LowSensitivityContext } from '@/shared/types/browser';
import type { ToolResult, RiskLevel } from '@/shared/types/tool';
import { ToolLoopAgent, isStepCount, isLoopFinished } from 'ai';
import type {
  ModelMessage,
  Tool as AISdkTool,
  StepResult,
  TypedToolCall,
  TypedToolResult,
} from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { jsonSchemaToZod } from '@/shared/json-schema-to-zod';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { FEATURE_FLAGS } from '@/shared/feature-flags';
import { ContextManager } from './context-manager';
import { DEFAULT_AGENT_CONFIG } from './system-prompt';

/** 默认最大工具循环轮数 */
const DEFAULT_MAX_STEPS = 99;

/** Agent 接口所需的工具集类型 */
type AdapterTools = Record<string, AISdkTool>;

export class ToolLoopAdapter implements IAgentRuntime {
  private abortController: AbortController | null = null;
  private _agent: ToolLoopAgent | null = null;
  private _tools: AdapterTools | null = null;
  private contextManager: ContextManager;

  constructor(
    private toolRegistry: IToolRegistry,
    private guardrail: IGuardrail,
    private conversationManager: IConversationManager,
    private providerConfig: ProviderConfig,
    private modelId: string,
    private agentConfig: AgentConfig = DEFAULT_AGENT_CONFIG as AgentConfig,
  ) {
    this.contextManager = new ContextManager(agentConfig);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    this.abortController = new AbortController();
    const toolCalls: ToolCallRecord[] = [];

    try {
      // 1. 构建初始 messages（含 system prompt + 对话历史）
      const messages = await this.buildMessages(input);

      // 2. 获取或创建 agent（首次调用时创建，后续复用——但 abort 后会重建）
      this.ensureAgentCreated(input);

      // 3. 执行
      const result = await this._agent!.generate({
        messages,
        abortSignal: this.abortController.signal,
      });

      return {
        finalMessage: result.text,
        toolCalls,
        tokenUsage: result.usage
          ? { prompt: result.usage.inputTokens ?? 0, completion: result.usage.outputTokens ?? 0 }
          : undefined,
      };
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
        tools: this.tools,
        stopWhen: [isStepCount(DEFAULT_MAX_STEPS), isLoopFinished()],
        toolApproval: this.createToolApproval(),
        prepareStep: ({ messages, stepNumber }) => {
          if (FEATURE_FLAGS.usePrepareStepContext) {
            return this.contextManager.prepareStep(stepNumber, messages);
          }
          return {};
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
      tools: this.tools,
      stopWhen: [isStepCount(DEFAULT_MAX_STEPS), isLoopFinished()],
      toolApproval: this.createToolApproval(input),
      prepareStep: ({ messages, stepNumber }) => {
        if (FEATURE_FLAGS.usePrepareStepContext) {
          return this.contextManager.prepareStep(stepNumber, messages);
        }
        return {};
      },
      onStepFinish: (stepResult: StepResult<Record<string, AISdkTool>>) => {
        this.recordStepToolCalls(stepResult, toolCalls);
      },
    });
  }

  /** 创建 toolApproval 函数 */
  private createToolApproval(input?: AgentRunInput) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          return { type: 'user-approval' as const };
        case 'critical':
          if (!guardrailCtx.expertModeEnabled) return { type: 'denied' as const, reason: '需要 Expert Mode' };
          return { type: 'user-approval' as const };
        default:
          return { type: 'approved' as const };
      }
    };
  }

  /** 将 ToolDefinition[] 转换为 AI SDK ToolSet */
  private buildTools(): AdapterTools {
    const tools: AdapterTools = {};
    for (const t of this.toolRegistry.getAllTools()) {
      tools[t.name] = {
        description: t.description,
        inputSchema: jsonSchemaToZod(t.schema as unknown as Record<string, unknown>),
        execute: async (args, opts) => {
          return this.executeTool(t, args as Record<string, unknown>, opts?.abortSignal);
        },
      } as AISdkTool;
    }
    return tools;
  }

  /** 执行单个工具：guardrail → preflight → execute → filterResult */
  private async executeTool(
    tool: ToolDefinition,
    params: Record<string, unknown>,
    abortSignal?: AbortSignal,
  ): Promise<ToolResult> {
    // guardrail 检查
    const check = await this.guardrail.check(tool.name, params, {
      isLocalTrusted: tool.confirmationRequired === false,
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
      isLocalTrusted: tool.confirmationRequired === false,
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

    // 3. Conversation history
    const recentMessages = await this.conversationManager.getRecentMessages(input.conversationId, 20);
    for (const msg of recentMessages) {
      messages.push(this.convertToModelMessage(msg));
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
  }): ModelMessage {
    switch (msg.role) {
      case 'user':
        return { role: 'user', content: msg.content };
      case 'assistant': {
        const parts: Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }> = [];
        if (msg.content) {
          parts.push({ type: 'text', text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({
              type: 'tool-call' as const,
              toolCallId: tc.id,
              toolName: tc.name,
              args: tc.params,
            });
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { role: 'assistant', content: parts.length > 0 ? parts as any : msg.content } as ModelMessage;
      }
      case 'tool':
        return {
          role: 'tool',
          content: [
            {
              type: 'tool-result' as const,
              toolCallId: msg.toolCallId ?? '',
              toolName: '',
              output: { type: 'text', value: msg.content },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ] as any,
        } as ModelMessage;
      default:
        return { role: 'user', content: msg.content };
    }
  }

  /** 创建 LanguageModel */
  private createModel(): LanguageModelV4 {
    const provider = createOpenAICompatible({
      name: this.providerConfig.name,
      baseURL: this.providerConfig.endpoint,
      apiKey: this.providerConfig.apiKey,
      headers: this.providerConfig.extraHeaders,
    });
    return provider.chatModel(this.modelId) as unknown as LanguageModelV4;
  }

  /** 从 StepResult 中提取并记录工具调用 */
  private recordStepToolCalls(
    stepResult: { toolCalls?: Array<TypedToolCall<Record<string, AISdkTool>>>; toolResults?: Array<TypedToolResult<Record<string, AISdkTool>>> },
    toolCalls: ToolCallRecord[],
  ) {
    const stepToolCalls = stepResult.toolCalls ?? [];
    const stepToolResults = stepResult.toolResults ?? [];
    for (const tc of stepToolCalls) {
      const tr = stepToolResults.find((r) => r.toolCallId === tc.toolCallId);
      const result: ToolResult = tr?.output
        ? { success: true, data: tr.output }
        : { success: true };
      toolCalls.push({
        toolName: tc.toolName,
        params: (tc.input as Record<string, unknown>) ?? {},
        result,
        riskLevel: 'low' as RiskLevel,
        confirmed: true,
        timestamp: Date.now(),
        toolCallId: tc.toolCallId,
      });
    }
  }
}
