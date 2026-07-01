import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import { createManagementListTool, createManagementToggleTool } from './management-tools';
import { createPrivacyGetSettingsTool, createPrivacySetSettingTool } from './privacy-tools';
import { createProxyGetSettingsTool, createProxySetSettingsTool, createProxyClearTool } from './proxy-tools';
import { createDebuggerGetTargetsTool, createDebuggerAttachTool, createDebuggerDetachTool } from './debugger-tools';
import { createDnrGetDynamicRulesTool, createDnrAddDynamicRulesTool, createDnrRemoveDynamicRulesTool } from './dnr-tools';
import { createIdentityGetAuthTokenTool, createIdentityClearCachedTokenTool } from './identity-tools';

export function createExpertTools(rpc: IJsonRpcClient): ToolDefinition[] {
  return [
    // Management
    createManagementListTool(rpc),
    createManagementToggleTool(rpc),

    // Privacy
    createPrivacyGetSettingsTool(rpc),
    createPrivacySetSettingTool(rpc),

    // Proxy
    createProxyGetSettingsTool(rpc),
    createProxySetSettingsTool(rpc),
    createProxyClearTool(rpc),

    // Debugger
    createDebuggerGetTargetsTool(rpc),
    createDebuggerAttachTool(rpc),
    createDebuggerDetachTool(rpc),

    // DeclarativeNetRequest
    createDnrGetDynamicRulesTool(rpc),
    createDnrAddDynamicRulesTool(rpc),
    createDnrRemoveDynamicRulesTool(rpc),

    // Identity
    createIdentityGetAuthTokenTool(rpc),
    createIdentityClearCachedTokenTool(rpc),
  ];
}
