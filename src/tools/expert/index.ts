import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import { createManagementListTool, createManagementSetTool } from './management-tools';
import { createPrivacyReadTool, createPrivacySetTool } from './privacy-tools';
import { createProxyReadTool, createProxySetTool, createProxyClearTool } from './proxy-tools';
import { createDebuggerListTool, createDebuggerAttachTool, createDebuggerDetachTool } from './debugger-tools';
import { createDnrListTool, createDnrAddTool, createDnrRemoveTool } from './dnr-tools';

export function createExpertTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    // Management
    createManagementListTool(rpc),
    createManagementSetTool(rpc),

    // Privacy
    createPrivacyReadTool(rpc),
    createPrivacySetTool(rpc),

    // Proxy
    createProxyReadTool(rpc),
    createProxySetTool(rpc),
    createProxyClearTool(rpc),

    // Debugger
    createDebuggerListTool(rpc),
    createDebuggerAttachTool(rpc),
    createDebuggerDetachTool(rpc),

    // DeclarativeNetRequest
    createDnrListTool(rpc),
    createDnrAddTool(rpc),
    createDnrRemoveTool(rpc),
  ];
}
