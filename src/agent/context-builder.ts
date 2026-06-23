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

    // 4. Recent messages
    const recentMessages = await this.conversationManager.getRecentMessages(
      conversationId,
      this.config.maxContextMessages,
    );
    for (const msg of recentMessages) {
      messages.push(this.convertToChatMessage(msg));
    }

    return messages;
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
