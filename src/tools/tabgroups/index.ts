import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import {
  createGroupListTool,
  createGroupCreateTool,
  createGroupUpdateTool,
  createGroupAssignTool,
} from './tabgroups-tools';

/**
 * 创建所有 TabGroups 工具
 */
export function createTabGroupsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createGroupListTool(rpc),
    createGroupCreateTool(rpc),
    createGroupUpdateTool(rpc),
    createGroupAssignTool(rpc),
  ];
}
