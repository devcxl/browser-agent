import type { IJsonRpcClient } from "../../shared/types";
import type { ToolDefinition } from "../../shared/types";
import { createTabsQueryTool, createTabsManageTool, createTabsRemoveTool } from "./tabs-tools";

export function createTabsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [createTabsQueryTool(rpc), createTabsManageTool(rpc), createTabsRemoveTool(rpc)];
}
