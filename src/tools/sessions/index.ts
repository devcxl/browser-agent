import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createSessionsSaveTool,
  createSessionsRestoreTool,
  createSessionsListTool,
  createSessionsDeleteTool,
} from './sessions-tools';

export function createSessionsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createSessionsSaveTool(rpc),
    createSessionsRestoreTool(rpc),
    createSessionsListTool(rpc),
    createSessionsDeleteTool(rpc),
  ];
}
