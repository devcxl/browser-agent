import type { ToolDefinition, ToolResult } from '../../shared/types';

export function createPageGetSelectionTool(
  executeFn: (params: Record<string, unknown>) => Promise<ToolResult>,
): ToolDefinition {
  return {
    name: 'page_getSelection',
    description: '获取当前页面中被选中的文本内容。',
    schema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: '目标标签页 ID' },
      },
    },
    category: 'page',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'sensitive',
    requireContentScript: true,
    execute: (params) => executeFn({
      tabId: params.tabId,
      method: 'page.getSelection',
      params: {},
    }),
  };
}
