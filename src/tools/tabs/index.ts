import type { IJsonRpcClient } from "../../shared/types";
import type { ToolDefinition } from "../../shared/types";
import {
  createTabSearchTool,
  createTabOpenTool,
  createTabNavigateTool,
  createTabFocusTool,
  createTabSetTool,
  createTabCloseTool,
} from "./tabs-tools";

export function createTabsTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    createTabSearchTool(rpc),
    createTabOpenTool(rpc),
    createTabNavigateTool(rpc),
    createTabFocusTool(rpc),
    createTabSetTool(rpc),
    createTabCloseTool(rpc),
  ];
}
