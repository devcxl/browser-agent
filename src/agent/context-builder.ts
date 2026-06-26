import type { AgentConfig } from '@/shared/types/agent';
import type { ChatMessage } from '@/shared/types/llm';
import type { IToolRegistry } from '@/registry/types';
import type { IConversationManager, StoredMessage } from '@/shared/types/conversation';
import type { LowSensitivityContext } from '@/shared/types/browser';
import type { Skill } from '@/shared/types/skill';

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

    return messages;
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
