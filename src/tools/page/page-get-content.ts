import type { ToolDefinition, ToolResult } from '../../shared/types';

export function createPageGetContentTool(
  executeFn: (params: Record<string, unknown>) => Promise<ToolResult>,
): ToolDefinition {
  return {
    name: 'page_getContent',
    description: '提取当前页面的正文内容。',
    schema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: '目标标签页 ID' },
      },
    },
    category: 'page',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'sensitive',
    requireContentScript: true,
    execute: (params) => executeFn({
      tabId: params.tabId,
      method: 'page.getContent',
      params: {},
    }),
    preflight: async (params) => ({
      affectedObjects: [
        {
          type: 'page',
          id: String(params.tabId ?? 'current'),
          title: '当前页面',
          reason: '读取页面正文内容',
        },
      ],
      warnings: ['页面内容可能包含敏感信息'],
    }),
  };
}
