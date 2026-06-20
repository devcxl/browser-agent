import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createCookiesGetTool,
  createCookiesGetAllTool,
  createCookiesSetTool,
  createCookiesRemoveTool,
  createCookiesGetAllCookieStoresTool,
} from './cookies-tools';

export function createCookiesTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createCookiesGetTool(rpc),
    createCookiesGetAllTool(rpc),
    createCookiesSetTool(rpc),
    createCookiesRemoveTool(rpc),
    createCookiesGetAllCookieStoresTool(rpc),
  ];
}
