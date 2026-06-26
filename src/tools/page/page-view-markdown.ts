import type { ToolDefinition, ToolResult } from '@/shared/types';
import type { IJsonRpcClient } from '@/shared/types/jsonrpc';

export function createPageViewMarkdownTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'page_viewMarkdown',
    description: '将 Markdown 内容在新标签页中渲染为格式化页面',
    schema: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description: '要渲染的 Markdown 文本',
        },
        title: {
          type: 'string',
          description: '标签页标题（可选）',
        },
      },
      required: ['markdown'],
    },
    category: 'page',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    requireBackground: true,
    execute: async (params) => {
      const markdown = params.markdown as string;
      const title = (params.title as string) ?? 'Markdown Preview';

      const result = await rpc.request('page.viewMarkdown', { markdown, title });
      return result as ToolResult;
    },
  };
}
