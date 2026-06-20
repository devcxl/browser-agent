import type { ToolDefinition, ToolResult } from '../../shared/types';
import { createPageGetContentTool } from './page-get-content';
import { createPageGetSelectionTool } from './page-get-selection';
import { createPageGetMetadataTool } from './page-get-metadata';

export function createPageTools(
  executeFn: (params: Record<string, unknown>) => Promise<ToolResult>,
): ToolDefinition[] {
  return [
    createPageGetContentTool(executeFn),
    createPageGetSelectionTool(executeFn),
    createPageGetMetadataTool(executeFn),
  ];
}
