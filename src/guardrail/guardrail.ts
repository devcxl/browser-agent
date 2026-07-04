import type { ToolDefinition, ToolResult } from '../registry/types';
import type { GuardrailCheck, GuardrailContext, IGuardrail } from '../shared/types/guardrail';
import type { IToolRegistry } from '../registry/types';
import { getRequiredPermissions } from '../shared/permissions';

export class Guardrail implements IGuardrail {
  constructor(private toolRegistry: IToolRegistry) {}

  async check(
    toolName: string,
    _params: Record<string, unknown>,
    context: GuardrailContext,
  ): Promise<GuardrailCheck> {
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      return {
        allowed: false,
        riskLevel: 'high',
        requiresPreflight: false,
        requiresConfirmation: false,
        reason: `未知工具: ${toolName}`,
        dataSensitivity: 'low',
      };
    }

    if (tool.expertOnly && !context.expertModeEnabled) {
      return {
        allowed: false,
        riskLevel: 'critical',
        requiresPreflight: false,
        requiresConfirmation: false,
        reason: `工具 ${toolName} 需要 Expert Mode`,
        dataSensitivity: tool.resultSensitivity,
      };
    }

    if (tool.expertOnly && tool.expertSwitch && !context.expertSwitches[tool.expertSwitch]) {
      return {
        allowed: false,
        riskLevel: 'critical',
        requiresPreflight: false,
        requiresConfirmation: false,
        reason: `工具 ${toolName} 需要开启 Expert API: ${tool.expertSwitch}`,
        dataSensitivity: tool.resultSensitivity,
      };
    }

    const requiredPerms = getRequiredPermissions(tool.category);
    const missing = requiredPerms.filter((p) => !context.grantedPermissions.includes(p));
    if (missing.length > 0) {
      return {
        allowed: false,
        riskLevel: tool.riskLevel,
        requiresPreflight: false,
        requiresConfirmation: false,
        reason: `需要额外权限: ${missing.join(', ')}。请在扩展设置中启用对应权限以使用此工具`,
        dataSensitivity: tool.resultSensitivity,
      };
    }

    return this.evaluateRisk(tool, context);
  }

  private evaluateRisk(tool: ToolDefinition, context: GuardrailContext): GuardrailCheck {
    const base: GuardrailCheck = {
      allowed: true,
      riskLevel: tool.riskLevel,
      requiresPreflight: false,
      requiresConfirmation: false,
      reason: '允许执行',
      dataSensitivity: tool.resultSensitivity,
    };

    switch (tool.riskLevel) {
      case 'low':
        return base;
      case 'medium':
        base.reason = '中风险操作，记录日志';
        return base;
      case 'high':
        base.requiresPreflight = true;
        base.requiresConfirmation = !context.isLocalTrusted;
        base.reason = context.isLocalTrusted
          ? '高风险操作，本地信任 Provider，跳过确认'
          : '高风险操作，需要用户确认';
        return base;
      case 'critical':
        if (!context.expertModeEnabled) {
          return { ...base, allowed: false, reason: 'Critical 操作需要 Expert Mode' };
        }
        if (tool.expertSwitch && !context.expertSwitches[tool.expertSwitch]) {
          return { ...base, allowed: false, reason: `Critical 操作需要开启 Expert API: ${tool.expertSwitch}` };
        }
        base.requiresPreflight = true;
        base.requiresConfirmation = true;
        base.reason = 'Critical 操作，需要 Expert Mode + 用户确认';
        return base;
      default:
        return base;
    }
  }

  filterResultForRemote(
    tool: ToolDefinition,
    result: ToolResult,
    context: GuardrailContext,
  ): ToolResult {
    if (!result.success || !result.data) return result;
    if (context.isLocalTrusted) return result;

    const sensitivity = tool.resultSensitivity;
    if (sensitivity === 'low') return result;

    if (sensitivity === 'sensitive') {
      if (!context.sessionGrants.sensitiveDataAllowed) {
        return { success: false, error: '敏感数据需会话授权才能发送给远程 Provider' };
      }
      return this.applySensitivityFilter(result);
    }

    if (sensitivity === 'critical') {
      return { success: false, error: '关键数据禁止发送给远程 Provider' };
    }

    return result;
  }

  private applySensitivityFilter(result: ToolResult): ToolResult {
    if (!result.sensitivityMap || !result.data) return result;
    const data = result.data as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const fieldSensitivity = result.sensitivityMap[key] ?? 'sensitive';
      filtered[key] = fieldSensitivity === 'low' ? value : `[${fieldSensitivity} data filtered]`;
    }
    return { ...result, data: filtered };
  }
}
