import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createHistorySearchTool,
  createHistoryDeleteTool,
  createHistoryDeleteAllTool,
} from './history-tools';

export function createHistoryTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createHistorySearchTool(rpc),
    createHistoryDeleteTool(rpc),
    createHistoryDeleteAllTool(rpc),
  ];
}
