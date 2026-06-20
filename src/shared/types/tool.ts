// ==================== 枚举类型 ====================

/** 风险等级 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** 工具类别（16 个） */
export type ToolCategory =
  | 'tabs'
  | 'windows'
  | 'tabGroups'
  | 'bookmarks'
  | 'history'
  | 'downloads'
  | 'sessions'
  | 'page'
  | 'cookies'
  | 'storage'
  | 'clipboard'
  | 'notifications'
  | 'contextMenus'
  | 'sidePanel'
  | 'alarms'
  | 'expert';

/** 数据敏感级别 */
export type SensitivityLevel = 'low' | 'sensitive' | 'critical';

// ==================== 工具执行 ====================

/** Preflight 影响对象 */
export interface PreflightAffectedObject {
  type: 'tab' | 'window' | 'bookmark' | 'history' | 'download' | 'cookie' | 'page';
  id?: string;
  title?: string;
  url?: string;
  reason?: string;
}

/** Preflight 结果 */
export interface PreflightResult {
  affectedObjects: PreflightAffectedObject[];
  warnings: string[];
}

/** 工具执行结果 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** 返回数据中每个字段的敏感级别，用于过滤外发给 LLM 的内容 */
  sensitivityMap?: Record<string, SensitivityLevel>;
}

// ==================== 工具定义 ====================

/** OpenAI Function Calling Schema - parameters 部分 */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: { type: string };
  }>;
  required?: string[];
}

/** OpenAI Function Calling Schema - 完整格式 */
export interface OpenAIToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  };
  // 扩展字段（非 OpenAI 标准，内部使用）
  'x-capability'?: ToolCategory;
  'x-risk-level'?: RiskLevel;
  'x-confirmation-required'?: boolean;
}

/** 工具定义 */
export interface ToolDefinition {
  /** 唯一名称，如 "tabs_query", "tabs_remove" */
  name: string;
  /** 人类可读描述，注入 LLM system prompt */
  description: string;
  /** OpenAI Function Calling Schema（parameters 部分） */
  schema: ToolParameterSchema;
  /** 所属能力域 */
  category: ToolCategory;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 是否需要用户确认（high/critical 必须为 true） */
  confirmationRequired: boolean;
  /** 返回数据的默认敏感级别 */
  resultSensitivity: SensitivityLevel;
  /** Expert Mode 专用标记 */
  expertOnly?: boolean;
  /** 执行函数 */
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
  /** Preflight 函数（高风险工具必须实现） */
  preflight?: (params: Record<string, unknown>) => Promise<PreflightResult>;
  /** 是否需要 Background 代理执行 */
  requireBackground?: boolean;
  /** 是否需要 Content Script 代理执行 */
  requireContentScript?: boolean;
}

// ==================== Tool Registry 接口 ====================

export interface IToolRegistry {
  /** 注册工具 */
  register(tool: ToolDefinition): void;
  /** 批量注册 */
  registerAll(tools: ToolDefinition[]): void;
  /** 获取所有工具 */
  getAllTools(): ToolDefinition[];
  /** 按名称查找 */
  getTool(name: string): ToolDefinition | undefined;
  /** 按类别过滤 */
  getToolsByCategory(category: ToolCategory): ToolDefinition[];
  /** 导出为 OpenAI Tool Schema 格式 */
  toOpenAISchema(): OpenAIToolSchema[];
  /** 卸载某类别的所有工具 */
  unregisterCategory(category: ToolCategory): void;
  /** 已注册工具数量 */
  readonly size: number;
}

// ==================== 工具调用记录 ====================

export interface ToolCallRecord {
  toolName: string;
  params: Record<string, unknown>;
  result: ToolResult;
  riskLevel: RiskLevel;
  confirmed: boolean;
  timestamp: number;
}
