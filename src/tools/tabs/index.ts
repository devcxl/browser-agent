import type { IJsonRpcClient } from "../../shared/types";
import type { ToolDefinition } from "../../shared/types";
import { createTabsQueryTool, createTabsGetTool, createTabsCreateTool, createTabsUpdateTool, createTabsRemoveTool, createTabsMoveTool, createTabsGroupTool, createTabsUngroupTool } from "./tabs-tools";

export function createTabsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createTabsQueryTool(rpc),
    createTabsGetTool(rpc),
    createTabsCreateTool(rpc),
    createTabsUpdateTool(rpc),
    createTabsRemoveTool(rpc),
    createTabsMoveTool(rpc),
    createTabsGroupTool(rpc),
    createTabsUngroupTool(rpc),
  ];
}
