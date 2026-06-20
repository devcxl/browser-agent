import type { ToolDefinition, ToolResult } from '../../shared/types';

export function createPageGetMarkdownTool(
  executeFn: (params: Record<string, unknown>) => Promise<ToolResult>,
): ToolDefinition {
  return {
    name: 'page_getMarkdown',
    description:
      '提取当前页面的正文内容并转换为格式化的 Markdown（含 YAML frontmatter、标题降级、代码块语言保留、GFM 表格/删除线、不安全链接过滤）。',
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
    execute: (params) =>
      executeFn({
        tabId: params.tabId,
        method: 'page.getMarkdown',
        params: {},
      }),
    preflight: async (params) => ({
      affectedObjects: [
        {
          type: 'page',
          id: String(params.tabId ?? 'current'),
          title: '当前页面',
          reason: '提取页面正文并转换为 Markdown',
        },
      ],
      warnings: ['页面内容可能包含敏感信息'],
    }),
  };
}
