export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ToolCategory =
  | "tabs"
  | "windows"
  | "tabGroups"
  | "bookmarks"
  | "history"
  | "downloads"
  | "sessions"
  | "page"
  | "cookies"
  | "storage"
  | "clipboard"
  | "notifications"
  | "contextMenus"
  | "sidePanel"
  | "alarms"
  | "expert";

export type SensitivityLevel = "low" | "sensitive" | "critical";

export interface ToolDefinition {
  name: string;
  description: string;
  schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  category: ToolCategory;
  riskLevel: RiskLevel;
  confirmationRequired: boolean;
  resultSensitivity: SensitivityLevel;
  expertOnly?: boolean;
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
  preflight?: (params: Record<string, unknown>) => Promise<PreflightResult>;
  requireBackground?: boolean;
  requireContentScript?: boolean;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  sensitivityMap?: Record<string, SensitivityLevel>;
}

export interface PreflightResult {
  affectedObjects: PreflightAffectedObject[];
  warnings: string[];
}

export interface PreflightAffectedObject {
  type:
    | "tab"
    | "window"
    | "bookmark"
    | "history"
    | "download"
    | "cookie"
    | "page";
  id?: string;
  title?: string;
  url?: string;
  reason?: string;
}

export interface OpenAIToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        {
          type: string;
          description?: string;
          enum?: string[];
          items?: { type: string };
        }
      >;
      required?: string[];
    };
  };
}

export interface IToolRegistry {
  register(tool: ToolDefinition): void;
  registerAll(tools: ToolDefinition[]): void;
  getAllTools(): ToolDefinition[];
  getTool(name: string): ToolDefinition | undefined;
  getToolsByCategory(category: ToolCategory): ToolDefinition[];
  toOpenAISchema(): OpenAIToolSchema[];
  unregisterCategory(category: ToolCategory): void;
}
