import type { ToolDefinition, ToolResult } from '@/shared/types';

type ExecuteFn = (params: Record<string, unknown>) => Promise<ToolResult>;

export function createPageSimulateClickTool(executeFn: ExecuteFn): ToolDefinition {
  return {
    name: 'page_simulateClick',
    description: '在页面上模拟鼠标点击，支持 CSS 选择器、XPath 或文本内容定位元素',
    schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 选择器，如 #myButton、.btn-submit',
        },
        xpath: {
          type: 'string',
          description: 'XPath 表达式，如 //button[contains(text(), "提交")]',
        },
        text: {
          type: 'string',
          description: '按文本内容匹配，如 "提交"',
        },
      },
    },
    category: 'page',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'sensitive',
    requireContentScript: true,
    execute: async (params) => {
      return executeFn({
        tabId: params.tabId,
        method: 'page.simulateClick',
        params,
      });
    },
  };
}
