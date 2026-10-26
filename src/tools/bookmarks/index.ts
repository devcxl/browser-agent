import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createBookmarkSearchTool,
  createBookmarkAddTool,
  createBookmarkEditTool,
  createBookmarkMoveTool,
  createBookmarkRemoveTool,
  createBookmarkTreeTool,
} from './bookmarks-tools';

export function createBookmarksTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createBookmarkSearchTool(rpc),
    createBookmarkAddTool(rpc),
    createBookmarkEditTool(rpc),
    createBookmarkMoveTool(rpc),
    createBookmarkRemoveTool(rpc),
    createBookmarkTreeTool(rpc),
  ];
}
