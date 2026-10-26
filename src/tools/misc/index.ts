import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createClipboardReadTool,
  createClipboardWriteTool,
  createNotificationCreateTool,
  createStorageReadTool,
  createStorageWriteTool,
  createStorageRemoveTool,
  createTimeGetTool,
} from './misc-tools';

export function createMiscTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createClipboardReadTool(rpc),
    createClipboardWriteTool(rpc),
    createNotificationCreateTool(rpc),
    createStorageReadTool(rpc),
    createStorageWriteTool(rpc),
    createStorageRemoveTool(rpc),
    createTimeGetTool(),
  ];
}
