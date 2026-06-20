import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createBookmarksSearchTool,
  createBookmarksCreateTool,
  createBookmarksUpdateTool,
  createBookmarksDeleteTool,
  createBookmarksGetTreeTool,
} from './bookmarks-tools';

export function createBookmarksTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createBookmarksSearchTool(rpc),
    createBookmarksCreateTool(rpc),
    createBookmarksUpdateTool(rpc),
    createBookmarksDeleteTool(rpc),
    createBookmarksGetTreeTool(rpc),
  ];
}
