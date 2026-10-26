import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createDownloadSearchTool,
  createDownloadStartTool,
  createDownloadClearTool,
  createDownloadOpenTool,
  createDownloadCancelTool,
  createDownloadPauseTool,
  createDownloadResumeTool,
} from './downloads-tools';

export function createDownloadsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createDownloadSearchTool(rpc),
    createDownloadStartTool(rpc),
    createDownloadClearTool(rpc),
    createDownloadOpenTool(rpc),
    createDownloadCancelTool(rpc),
    createDownloadPauseTool(rpc),
    createDownloadResumeTool(rpc),
  ];
}
