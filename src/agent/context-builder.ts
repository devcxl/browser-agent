import type { AgentConfig } from '@/shared/types/agent';
import type { ChatMessage } from '@/shared/types/llm';
import type { IToolRegistry } from '@/registry/types';
import type { IConversationManager, StoredMessage } from '@/shared/types/conversation';
import type { LowSensitivityContext } from '@/shared/types/browser';
import type { Skill } from '@/shared/types/skill';
import { estimateTokens } from '@/shared/token-estimate';

export class ContextBuilder {
  constructor(
    private config: AgentConfig,
    private toolRegistry: IToolRegistry,
    private conversationManager: IConversationManager,
  ) {}

  async build(
    conversationId: string,
    currentBrowserContext: LowSensitivityContext,
    activeSkillNames?: string[],
    allSkills?: Skill[],
  ): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];

    const toolsDesc = this.toolRegistry
      .getAllTools()
      .map((t) => `- **${t.name}**: ${t.description}`)
      .join('\n');

    const skillSections = this.buildSkillSections(activeSkillNames, allSkills);

    let systemContent = this.config.systemPrompt;
    if (skillSections) {
      systemContent += `\n\n${skillSections}`;
    }
    systemContent += `\n\n## Available Tools\n${toolsDesc}`;

    messages.push({
      role: 'system',
      content: systemContent,
    });

    // 2. Conversation summary (if any)
    const conversation = await this.conversationManager.get(conversationId);
    if (conversation?.summary) {
      messages.push({
        role: 'system',
        content: `## Conversation Summary\n${conversation.summary}`,
      });
    }

    // 3. Current browser context
    messages.push({
      role: 'system',
      content: `## Current Browser Context\n${JSON.stringify(currentBrowserContext, null, 2)}`,
    });

    // 4. Recent messages — 截断后修复序列完整性
    const recentMessages = await this.conversationManager.getRecentMessages(
      conversationId,
      this.config.maxContextMessages,
    );

    // 修复：移除丢失了前置 assistant(tool_calls) 的 tool 消息
    const fixedMessages = this.repairToolCallSequence(recentMessages);

    for (const msg of fixedMessages) {
      messages.push(this.convertToChatMessage(msg));
    }

    // 5. Token 预算截断
    return this.trimToTokenBudget(messages);
  }

  /**
   * Token 预算截断：确保 messages 总 token 数不超过 contextWindowTokens - tokenBudgetMargin。
   *
   * 策略：
   * 1. 保留所有 system 消息不动
   * 2. 非 system 消息从最早开始丢弃，直到总 token 数在预算内
   * 3. 丢弃后对齐到 user 消息边界（确保不从 tool_call 序列中间切断）
   * 4. 修复被裁剪破坏的 tool_call 序列
   */
  private trimToTokenBudget(messages: ChatMessage[]): ChatMessage[] {
    const budget = this.config.contextWindowTokens - this.config.tokenBudgetMargin;

    const totalTokens = this.estimateMessageTokens(messages);
    if (totalTokens <= budget) {
      return messages;
    }

    // 分离 system 和非 system 消息
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    // 计算 system 消息的 token
    const systemTokens = this.estimateMessageTokens(systemMessages);
    const remainingBudget = budget - systemTokens;

    if (remainingBudget <= 0) {
      console.warn(
        `[ContextBuilder] System 消息已占用 ${systemTokens} tokens，超过预算 ${budget}，无法保留任何对话历史`,
      );
      return systemMessages;
    }

    // 从最早的非 system 消息开始移除，直到在预算内
    let kept = [...nonSystemMessages];
    while (this.estimateMessageTokens(kept) > remainingBudget && kept.length > 0) {
      kept = kept.slice(1);
    }

    // 对齐到 user 消息边界：从保留的消息开头开始，找到第一个 user 角色
    const userStartIndex = kept.findIndex((m) => m.role === 'user');
    if (userStartIndex > 0) {
      kept = kept.slice(userStartIndex);
    } else if (userStartIndex === -1 && kept.length > 0) {
      // 没有 user 消息开头的片段（如只剩 tool 结果），全部丢弃
      kept = [];
    }

    // 修复 tool_call 序列完整性
    const fixed = this.repairToolCallIntegrity(kept);

    const trimmedCount = nonSystemMessages.length - fixed.length;
    if (trimmedCount > 0) {
      console.warn(
        `[ContextBuilder] Token 预算截断：丢弃了 ${trimmedCount} 条最早的消息（预估 tokens: ${totalTokens} → ${systemTokens + this.estimateMessageTokens(fixed)}）`,
      );
    }

    return [...systemMessages, ...fixed];
  }

  /** 估算一组消息的总 token 数 */
  private estimateMessageTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += estimateTokens(msg.content ?? '');
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          total += estimateTokens(tc.function.name);
          total += estimateTokens(tc.function.arguments);
        }
      }
    }
    return total;
  }

  /**
   * 修复 ChatMessage 级别的 tool_call 序列完整性。
   * 移除丢失了前置 assistant(tool_calls) 的孤立 tool 消息。
   */
  private repairToolCallIntegrity(messages: ChatMessage[]): ChatMessage[] {
    const toolCallIds = new Set<string>();
    const result: ChatMessage[] = [];
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          toolCallIds.add(tc.id);
        }
        result.push(msg);
      } else if (msg.role === 'tool' && msg.tool_call_id) {
        if (toolCallIds.has(msg.tool_call_id)) {
          result.push(msg);
          toolCallIds.delete(msg.tool_call_id);
        }
        // 没有匹配的 tool_call_id 则丢弃
      } else {
        result.push(msg);
      }
    }
    return result;
  }

  /**
   * 修复 tool_call 序列：移除丢失了前置 assistant(tool_calls) 的 tool 消息。
   * 简单截断会导致 tool 消息找不到对应的 assistant(tool_calls)，违反 OpenAI 协议。
   */
  private repairToolCallSequence(msgs: StoredMessage[]): StoredMessage[] {
    const toolCallIds = new Set<string>();
    const result: StoredMessage[] = [];
    for (const msg of msgs) {
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          toolCallIds.add(tc.id);
        }
        result.push(msg);
      } else if (msg.role === 'tool' && msg.toolCallId) {
        if (toolCallIds.has(msg.toolCallId)) {
          result.push(msg);
          // tool 消息消费掉对应的 tool_call_id，后续同 id 的 tool 应视为孤儿
          toolCallIds.delete(msg.toolCallId);
        }
        // 没有匹配的 tool_call_id 则丢弃
      } else {
        result.push(msg);
      }
    }
    return result;
  }

  private buildSkillSections(
    activeSkillNames: string[] | undefined,
    allSkills: Skill[] | undefined,
  ): string | null {
    if (!allSkills || allSkills.length === 0) {
      return null;
    }

    const parts: string[] = [];

    // 可用技能列表
    const availableList = allSkills
      .map((s) => `- ${s.name}: ${s.description}`)
      .join('\n');
    parts.push(`## 可用技能\n你可以使用 \`skill\` 工具激活以下技能。\n${availableList}`);

    // 已激活技能 prompt
    if (activeSkillNames && activeSkillNames.length > 0) {
      const activeSkills = allSkills.filter((s) => activeSkillNames.includes(s.name));
      if (activeSkills.length > 0) {
        const activeParts = activeSkills.map(
          (s) => `### ${s.name}\n${s.prompt}`,
        );
        parts.push(`## 已激活的技能\n${activeParts.join('\n\n')}`);
      }
    }

    return parts.join('\n\n');
  }

  private convertToChatMessage(msg: StoredMessage): ChatMessage {
    const base: ChatMessage = { role: msg.role, content: msg.content };
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      base.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.params),
        },
      }));
    }
    if (msg.toolCallId) {
      base.tool_call_id = msg.toolCallId;
    }
    return base;
  }
}
