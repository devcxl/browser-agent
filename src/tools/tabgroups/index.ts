import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import { createTabGroupsQueryTool, createTabGroupsUpdateTool } from './tabgroups-tools';

/**
 * 创建所有 TabGroups 工具
 */
export function createTabGroupsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createTabGroupsQueryTool(rpc),
    createTabGroupsUpdateTool(rpc),
  ];
}
