import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createSessionSaveTool,
  createSessionRestoreTool,
  createSessionListTool,
  createSessionRemoveTool,
} from './sessions-tools';

export function createSessionsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createSessionSaveTool(rpc),
    createSessionRestoreTool(rpc),
    createSessionListTool(rpc),
    createSessionRemoveTool(rpc),
  ];
}
