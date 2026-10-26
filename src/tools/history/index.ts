import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createHistorySearchTool,
  createHistoryRemoveTool,
  createHistoryClearTool,
} from './history-tools';

export function createHistoryTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createHistorySearchTool(rpc),
    createHistoryRemoveTool(rpc),
    createHistoryClearTool(rpc),
  ];
}
