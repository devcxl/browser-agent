import type { ToolDefinition, ToolResult } from '@/shared/types';
import type { IJsonRpcClient } from '@/shared/types/jsonrpc';

export function createPageGetScreenshotTool(rpc: IJsonRpcClient): ToolDefinition {
  return {
    name: 'page_getScreenshot',
    description: '获取当前标签页的可视区域截图，返回 base64 编码的 PNG 图片',
    schema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['png', 'jpeg'],
          description: '图片格式，默认 png',
        },
        quality: {
          type: 'number',
          description: 'JPEG 质量（0-100），仅 format=jpeg 时有效',
        },
      },
    },
    category: 'page',
    riskLevel: 'high',
    confirmationRequired: true,
    resultSensitivity: 'sensitive',
    requireBackground: true,
    execute: async (params) => {
      const result = await rpc.request('tabs.captureScreenshot', {
        format: params.format ?? 'png',
        quality: params.quality,
      });
      return result as ToolResult;
    },
  };
}
