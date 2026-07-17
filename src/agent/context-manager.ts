import type { ModelMessage } from 'ai';
import type { AgentConfig } from '@/shared/types/agent';
import { estimateTokens } from '@/shared/token-estimate';

/**
 * ContextManager — 在 ToolLoopAgent.prepareStep 中管理上下文窗口。
 *
 * 复用 ContextBuilder 的核心算法（Token 预算截断、工具结果微压缩），
 * 但直接操作 AI SDK 的 ModelMessage[]，避免 ChatMessage ↔ ModelMessage 来回转换。
 */
export class ContextManager {
  constructor(private config: AgentConfig) {}

  /**
   * prepareStep 回调：在偶数步执行压缩（第 0 步是初始消息，第 2、4... 步是工具循环后的步骤）。
   *
   * @param stepNumber 当前步编号
   * @param messages 累积的消息列表
   * @returns 可能被截断/压缩后的消息列表
   */
  prepareStep(stepNumber: number, messages: ModelMessage[]): { messages: ModelMessage[] } {
    // 仅在偶数步执行压缩（避免每步都操作，减少开销）
    // 第 0 步是初始构建的消息（不需要压缩）
    // 第 2+ 步才是工具循环累积后的消息（需要管理上下文窗口）
    if (stepNumber < 2 || stepNumber % 2 !== 0) {
      return { messages };
    }

    let result = messages;

    // 1. 工具结果微压缩
    result = this.microcompact(result);

    // 2. Token 预算截断
    result = this.trimToTokenBudget(result);

    return { messages: result };
  }

  // ─── Token 预算截断 ──────────────────────────────────────────

  /**
   * Token 预算截断：确保 messages 总 token 数不超过 contextWindowTokens - tokenBudgetMargin。
   *
   * 策略（与 ContextBuilder.trimToTokenBudget 一致）：
   * 1. 保留所有 system 消息不动
   * 2. 非 system 消息从最早开始丢弃，直到总 token 数在预算内
   * 3. 丢弃后对齐到 user 消息边界
   * 4. 修复被裁剪破坏的 tool_call 序列
   */
  private trimToTokenBudget(messages: ModelMessage[]): ModelMessage[] {
    const budget = this.config.contextWindowTokens - this.config.tokenBudgetMargin;

    const totalTokens = this.estimateModelTokens(messages);
    if (totalTokens <= budget) {
      return messages;
    }

    // 分离 system 和非 system 消息
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    // 计算 system 消息的 token
    const systemTokens = this.estimateModelTokens(systemMessages);
    const remainingBudget = budget - systemTokens;

    if (remainingBudget <= 0) {
      console.warn(
        `[ContextManager] System 消息已占用 ${systemTokens} tokens，超过预算 ${budget}，无法保留任何对话历史`,
      );
      return systemMessages;
    }

    // 从最早的非 system 消息开始移除，直到在预算内
    let kept = [...nonSystemMessages];
    while (this.estimateModelTokens(kept) > remainingBudget && kept.length > 0) {
      kept = kept.slice(1);
    }

    // 对齐到 user 消息边界
    const userStartIndex = kept.findIndex((m) => m.role === 'user');
    if (userStartIndex > 0) {
      kept = kept.slice(userStartIndex);
    } else if (userStartIndex === -1 && kept.length > 0) {
      kept = [];
    }

    // 修复 tool_call 序列完整性
    const fixed = this.repairToolCallIntegrity(kept);

    const trimmedCount = nonSystemMessages.length - fixed.length;
    if (trimmedCount > 0) {
      console.warn(
        `[ContextManager] Token 预算截断：丢弃了 ${trimmedCount} 条最早的消息（预估 tokens: ${totalTokens} → ${systemTokens + this.estimateModelTokens(fixed)}）`,
      );
    }

    return [...systemMessages, ...fixed];
  }

  /**
   * 修复 tool_call 序列：移除丢失了前置 assistant(tool-call) 的孤立 tool-result。
   * 与 ContextBuilder.repairToolCallIntegrity 逻辑一致。
   */
  private repairToolCallIntegrity(messages: ModelMessage[]): ModelMessage[] {
    const toolCallIds = new Set<string>();
    const result: ModelMessage[] = [];
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const hasToolCalls = msg.content.some((part) => part.type === 'tool-call');
        if (hasToolCalls) {
          for (const part of msg.content) {
            if (part.type === 'tool-call') {
              toolCallIds.add(part.toolCallId);
            }
          }
          result.push(msg);
        } else {
          result.push(msg);
        }
      } else if (msg.role === 'tool' && Array.isArray(msg.content)) {
        // 只检查 tool-result 是否有匹配的 tool-call（tool-approval-response 总是保留）
        const hasOrphanToolResult = msg.content.some(
          (part) => part.type === 'tool-result' && !toolCallIds.has(part.toolCallId),
        );
        if (!hasOrphanToolResult) {
          result.push(msg);
          // 消费已匹配的 toolCallId
          for (const part of msg.content) {
            if (part.type === 'tool-result') {
              toolCallIds.delete(part.toolCallId);
            }
          }
        }
        // 有孤立的 tool-result 则丢弃整条 tool 消息
      } else {
        result.push(msg);
      }
    }
    return result;
  }

  // ─── 工具结果微压缩 ──────────────────────────────────────────

  /**
   * 工具结果微压缩：将超出保留数量的旧工具大结果替换为占位符。
   *
   * 策略（与 ContextBuilder.microcompact 一致）：
   * 1. 从 assistant 消息的 tool-call part 中构建 toolCallId → toolName 映射
   * 2. 找到所有 tool 消息中的 tool-result，排除白名单中的工具
   * 3. 保留最近的 microcompactKeepRecent 条不压缩
   * 4. 对更早的、输出文本超过 microcompactMinChars 的 tool-result，替换为占位符
   */
  private microcompact(messages: ModelMessage[]): ModelMessage[] {
    const keepRecent = this.config.microcompactKeepRecent;
    const minChars = this.config.microcompactMinChars;
    const excludeTools = new Set(this.config.microcompactExcludeTools);

    // 构建 toolCallId → toolName 映射（从 assistant 消息的 tool-call parts）
    const toolNameMap = new Map<string, string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'tool-call') {
            toolNameMap.set(part.toolCallId, part.toolName);
          }
        }
      }
    }

    // 收集需要压缩的 tool-result 候选
    interface CompressCandidate {
      messageIndex: number;
      partIndex: number;
      toolName: string;
      textLength: number;
    }
    const candidates: CompressCandidate[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      if (msg.role !== 'tool' || !Array.isArray(msg.content)) continue;

      for (let j = 0; j < msg.content.length; j++) {
        const part = msg.content[j]!;
        if (part.type !== 'tool-result') continue;

        const toolName = toolNameMap.get(part.toolCallId);
        if (!toolName || excludeTools.has(toolName)) continue;

        // 计算输出文本长度
        const outputValue =
          part.output && typeof part.output === 'object' && 'value' in part.output
            ? (part.output as { type: string; value: unknown }).value
            : undefined;
        const textLength = typeof outputValue === 'string' ? outputValue.length : JSON.stringify(outputValue ?? '').length;

        candidates.push({ messageIndex: i, partIndex: j, toolName, textLength });
      }
    }

    // 保留最近 keepRecent 条不压缩
    const compressCount = candidates.length - keepRecent;
    if (compressCount <= 0) return messages;

    // 深拷贝 messages 以便修改
    const result: ModelMessage[] = messages.map((m) => {
      if (m.role === 'tool' && Array.isArray(m.content)) {
        return { ...m, content: [...m.content] };
      }
      return { ...m };
    });

    let compressedCount = 0;
    for (let i = 0; i < compressCount; i++) {
      const candidate = candidates[i]!;
      if (candidate.textLength < minChars) continue;

      const msg = result[candidate.messageIndex]!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contentArr = msg.content as any[];
      const part = contentArr[candidate.partIndex] as { type: string; toolCallId?: string; toolName?: string };
      if (part.type !== 'tool-result') continue;

      // 替换为占位符
      contentArr[candidate.partIndex] = {
        type: 'tool-result',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output: {
          type: 'text',
          value: `[${candidate.toolName} result compressed: ${candidate.textLength} chars]`,
        },
      };
      compressedCount++;
    }

    if (compressedCount > 0) {
      console.warn(
        `[ContextManager] 工具结果微压缩：${compressedCount} 条工具结果被替换为占位符`,
      );
    }

    return result;
  }

  // ─── Token 估算 ──────────────────────────────────────────────

  /** 估算一组 ModelMessage 的总 token 数 */
  private estimateModelTokens(messages: ModelMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          total += this.estimatePartTokens(part);
        }
      }
    }
    return total;
  }

  /** 估算单个 content part 的 token 数 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private estimatePartTokens(part: any): number {
    switch (part.type) {
      case 'text':
        return estimateTokens((part.text as string) ?? '');
      case 'tool-call':
        return (
          estimateTokens((part.toolName as string) ?? '') +
          estimateTokens(JSON.stringify(part.input ?? {}))
        );
      case 'tool-result': {
        const output = part.output as { type: string; value: unknown } | undefined;
        const val = output?.value;
        const text =
          typeof val === 'string'
            ? val
            : val !== undefined
              ? JSON.stringify(val)
              : '';
        return estimateTokens(text);
      }
      case 'tool-approval-response':
        return estimateTokens((part.reason as string) ?? '');
      case 'reasoning':
        return estimateTokens((part.text as string) ?? '');
      case 'file':
        return estimateTokens((part.data as string) ?? '');
      case 'image':
        // 图片 URL 或 base64 data，粗略估算
        return estimateTokens(JSON.stringify(part.image ?? ''));
      default:
        return 0;
    }
  }

  // ─── Browser Context / Skill 注入 ────────────────────────────

  /**
   * 将 browser context 注入到 system message 中。
   * 在 buildMessages 阶段调用，将动态上下文追加到第一条 system 消息。
   */
  injectBrowserContext(messages: ModelMessage[], browserContextJson: string): ModelMessage[] {
    const result = [...messages];
    const systemMsg = result.find((m) => m.role === 'system');
    if (systemMsg && typeof systemMsg.content === 'string') {
      return [
        {
          ...systemMsg,
          content: systemMsg.content + `\n\n## 当前浏览器上下文\n${browserContextJson}`,
        },
        ...result.filter((m) => m.role !== 'system'),
      ];
    }
    return result;
  }

  /**
   * 将已激活的技能 prompt 注入到 system message 中。
   */
  injectSkillPrompts(
    messages: ModelMessage[],
    activeSkillPrompts: string[],
  ): ModelMessage[] {
    if (activeSkillPrompts.length === 0) return messages;

    const result = [...messages];
    const systemMsg = result.find((m) => m.role === 'system');
    if (systemMsg && typeof systemMsg.content === 'string') {
      const skillSection = `\n\n## 已激活的技能\n${activeSkillPrompts.join('\n\n')}`;
      return [
        {
          ...systemMsg,
          content: systemMsg.content + skillSection,
        },
        ...result.filter((m) => m.role !== 'system'),
      ];
    }
    return result;
  }
}
