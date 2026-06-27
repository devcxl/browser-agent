// Registry 层类型定义 — 从 shared/types/tool.ts 统一导出
// 保持向后兼容，避免模块间类型不一致
export type {
  RiskLevel,
  ToolCategory,
  SensitivityLevel,
  ToolDefinition,
  ToolResult,
  ToolParameterSchema,
  OpenAIToolSchema,
  PreflightAffectedObject,
  PreflightResult,
} from '@/shared/types/tool';

export type { IToolRegistry } from '@/shared/types/tool';
