import type { ToolDefinition } from '@/registry/types';

export function createSkillTool(): ToolDefinition {
  return {
    name: 'skill',
    description:
      '激活一个技能（skill），加载该技能的上下文指令。当你识别到用户意图匹配某个技能时，调用此工具激活它。可以多次调用以激活多个技能。',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '要激活的技能名称' },
      },
      required: ['name'],
    },
    category: 'expert',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    execute: async (params) => {
      return { success: true, data: { activated: params.name } };
    },
  };
}
