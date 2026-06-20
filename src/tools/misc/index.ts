import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createClipboardReadTool,
  createClipboardWriteTool,
  createNotificationsCreateTool,
  createStorageLocalGetTool,
  createStorageLocalSetTool,
  createStorageLocalRemoveTool,
  createTimeGetTool,
} from './misc-tools';

export function createMiscTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createClipboardReadTool(rpc),
    createClipboardWriteTool(rpc),
    createNotificationsCreateTool(rpc),
    createStorageLocalGetTool(rpc),
    createStorageLocalSetTool(rpc),
    createStorageLocalRemoveTool(rpc),
    createTimeGetTool(),
  ];
}
