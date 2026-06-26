import type { IJsonRpcClient } from '@/shared/types/jsonrpc';
import type { ToolDefinition, ToolResult } from '../../shared/types';
import { createPageGetContentTool } from './page-get-content';
import { createPageGetSelectionTool } from './page-get-selection';
import { createPageGetMetadataTool } from './page-get-metadata';
import { createPageGetMarkdownTool } from './page-get-markdown';
import { createPageViewMarkdownTool } from './page-view-markdown';
import { createPageGetScreenshotTool } from './page-get-screenshot';
import { createPageSimulateClickTool } from './page-simulate-click';

export function createPageTools(
  executeFn: (params: Record<string, unknown>) => Promise<ToolResult>,
  rpc?: IJsonRpcClient,
): ToolDefinition[] {
  return [
    createPageGetContentTool(executeFn),
    createPageGetSelectionTool(executeFn),
    createPageGetMetadataTool(executeFn),
    createPageGetMarkdownTool(executeFn),
    createPageSimulateClickTool(executeFn),
    ...(rpc ? [createPageViewMarkdownTool(rpc), createPageGetScreenshotTool(rpc)] : []),
  ];
}
