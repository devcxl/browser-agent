import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createDownloadsSearchTool,
  createDownloadsDownloadTool,
  createDownloadsEraseTool,
  createDownloadsOpenTool,
  createDownloadsCancelTool,
  createDownloadsPauseTool,
  createDownloadsResumeTool,
} from './downloads-tools';

export function createDownloadsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createDownloadsSearchTool(rpc),
    createDownloadsDownloadTool(rpc),
    createDownloadsEraseTool(rpc),
    createDownloadsOpenTool(rpc),
    createDownloadsCancelTool(rpc),
    createDownloadsPauseTool(rpc),
    createDownloadsResumeTool(rpc),
  ];
}
