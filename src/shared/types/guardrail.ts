import type { RiskLevel, SensitivityLevel } from './tool';
import type { ToolResult } from './tool';

// ==================== Guardrail Context ====================

export interface GuardrailContext {
  /** 当前 Provider 是否被标记为 local-trusted */
  isLocalTrusted: boolean;
  /** Expert Mode 是否开启 */
  expertModeEnabled: boolean;
  /** Expert Mode 子开关状态 */
  expertSwitches: Record<string, boolean>;
  /** 已授予的可选权限列表 */
  grantedPermissions: string[];
  /** 当前会话是否已授权敏感数据发送 */
  sessionGrants: {
    sensitiveDataAllowed: boolean;
    grantedAt?: number;
  };
}

// ==================== Guardrail Check Result ====================

export interface GuardrailCheck {
  /** 是否允许执行 */
  allowed: boolean;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 是否需要 preflight */
  requiresPreflight: boolean;
  /** 是否需要用户确认 */
  requiresConfirmation: boolean;
  /** 原因描述（用于 UI 展示） */
  reason: string;
  /** 数据敏感级别 */
  dataSensitivity: SensitivityLevel;
}

// ==================== Guardrail 接口 ====================

export interface IGuardrail {
  /**
   * 检查工具调用是否允许执行
   * @param toolName 工具名称
   * @param params 调用参数
   * @param context 当前上下文
   */
  check(
    toolName: string,
    params: Record<string, unknown>,
    context: GuardrailContext,
  ): Promise<GuardrailCheck>;

  /**
   * 根据敏感级别和上下文过滤工具执行结果
   * @param tool 工具定义（只需 resultSensitivity 字段）
   * @param result 原始执行结果
   * @param context 当前上下文
   */
  filterResultForRemote(
    tool: { resultSensitivity: SensitivityLevel },
    result: ToolResult,
    context: GuardrailContext,
  ): ToolResult;
}
