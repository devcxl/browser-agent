import type { ToolDefinition, ToolResult } from '../../shared/types';

export function createPageGetMetadataTool(
  executeFn: (params: Record<string, unknown>) => Promise<ToolResult>,
): ToolDefinition {
  return {
    name: 'page_getMetadata',
    description: '获取当前页面的元数据信息（标题、URL、描述、OG 图片等）。',
    schema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: '目标标签页 ID' },
      },
    },
    category: 'page',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    requireContentScript: true,
    execute: executeFn,
  };
}
