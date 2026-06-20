import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createWindowsGetAllTool,
  createWindowsGetTool,
  createWindowsCreateTool,
  createWindowsRemoveTool,
} from './windows-tools';

export function createWindowsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createWindowsGetAllTool(rpc),
    createWindowsGetTool(rpc),
    createWindowsCreateTool(rpc),
    createWindowsRemoveTool(rpc),
  ];
}
