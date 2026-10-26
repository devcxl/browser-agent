import type { ToolDefinition, ToolResult } from '../../shared/types';

/**
 * page_eval：在页面隔离环境中执行 JS 代码（高风险，需确认）。
 */
export function createPageEvalTool(
  executeFn: (params: Record<string, unknown>) => Promise<ToolResult>,
): ToolDefinition {
  return {
    name: 'page_eval',
    description:
      '在当前页面执行任意 JS 代码并返回结果。可查询/操作 DOM、读取页面文本与结构；代码以最后表达式的值作为结果，支持 async/await。运行在内容脚本隔离环境：无法访问页面自身的 JS 全局变量（如 window.__NEXT_DATA__）。优先考虑专用工具（读取内容用 page_read_content、点击用 page_click），仅在它们不够用时使用。',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要执行的 JS 代码' },
        tabId: { type: 'number', description: '目标标签页 ID，缺省为当前标签页' },
      },
      required: ['code'],
    },
    category: 'page',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'sensitive',
    requireContentScript: true,
    preflight: async (params) => ({
      affectedObjects: [
        {
          type: 'page',
          id: String(params.tabId ?? 'current'),
          title: '当前页面',
          reason: '在该页面上执行自定义 JS 代码',
        },
      ],
      warnings: ['将在页面上执行任意 JS 代码，请确认代码来源与内容安全。'],
    }),
    execute: (params) => executeFn({
      tabId: params.tabId,
      method: 'page.eval',
      params: { code: params.code },
    }),
  };
}
