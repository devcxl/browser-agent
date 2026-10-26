import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createWindowListTool,
  createWindowNewTool,
  createWindowFocusTool,
  createWindowCloseTool,
} from './windows-tools';

export function createWindowsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createWindowListTool(rpc),
    createWindowNewTool(rpc),
    createWindowFocusTool(rpc),
    createWindowCloseTool(rpc),
  ];
}
