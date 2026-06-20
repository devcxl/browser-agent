# 开发文档: T12 - Guardrail 风险控制实现

**Project:** Browser Agent
**Task ID:** T12
**Slug:** guardrail-impl
**Issue:** #12
**类型:** backend
**Batch:** 4
**依赖:** T2 (define-types), T6 (tool-registry)

## 1. 目标

实现 `IGuardrail` 接口，对每次工具调用进行风险检查——根据工具的 `riskLevel`、当前上下文（Provider 信任状态、Expert Mode 开关、会话授权状态）判断执行策略，并控制敏感数据外发。

## 2. 前置条件

- [x] T2: `shared/types/guardrail.ts` 中的 `GuardrailCheck`、`IGuardrail`、`GuardrailContext` 类型已定义
- [x] T2: `shared/types/tool.ts` 中的 `RiskLevel`、`SensitivityLevel`、`ToolDefinition` 类型已定义
- [x] T6: `IToolRegistry.getTool(name)` 可查询工具定义

## 3. 实现步骤

### 3.1 类型定义复用

T2 中已定义的接口（来自技术方案 4.2.2）：

```ts
// src/guardrail/types.ts - 已由 T2 定义于 shared/types/guardrail.ts
// 本任务只需从 shared/types 导入，不需要新建 types.ts

interface GuardrailCheck {
  allowed: boolean;
  riskLevel: RiskLevel;
  requiresPreflight: boolean;
  requiresConfirmation: boolean;
  reason: string;
  dataSensitivity: SensitivityLevel;
}

interface IGuardrail {
  check(
    toolName: string,
    params: Record<string, unknown>,
    context: GuardrailContext,
  ): Promise<GuardrailCheck>;
}

interface GuardrailContext {
  isLocalTrusted: boolean;
  expertModeEnabled: boolean;
  expertSwitches: Record<string, boolean>;
  sessionGrants: {
    sensitiveDataAllowed: boolean;
    grantedAt?: number;
  };
}
```

### 3.2 Guardrail 核心实现

**文件:** `src/guardrail/guardrail.ts`

**核心逻辑（`check` 方法决策表）：**

| 条件 | allowed | requiresPreflight | requiresConfirmation | 说明 |
|------|---------|-------------------|---------------------|------|
| `riskLevel === "low"` | true | false | false | 直接放行 |
| `riskLevel === "medium"` | true | false | false | 放行，但记录日志 |
| `riskLevel === "high"` + `isLocalTrusted` | true | true | false | 本地信任时跳过确认，仍需 preflight |
| `riskLevel === "high"` + 非本地信任 | true | true | true | 必须 preflight + 用户确认 |
| `riskLevel === "critical"` + `expertModeEnabled` + 对应子开关 | true | true | true | Expert Mode 开启且子开关允许 |
| `riskLevel === "critical"` + `!expertModeEnabled` | false | false | false | 非 Expert Mode 拒绝执行 |
| `expertOnly` 工具 + `!expertModeEnabled` | false | false | false | Expert 工具不在 Expert Mode 下不可用 |

**敏感数据外发检查逻辑（在 `check` 返回值中体现）：**

```ts
// 额外检查：工具返回数据的外发策略
// 在 Guardrail 中增加辅助方法：
filterResultForRemote(
  toolName: string,
  result: ToolResult,
  context: GuardrailContext,
): ToolResult;
```

| `resultSensitivity` | `isLocalTrusted` | `sensitiveDataAllowed` | 行为 |
|---------------------|------------------|----------------------|------|
| `"low"` | 任意 | 任意 | 原样返回 |
| `"sensitive"` | true | true | 原样返回 |
| `"sensitive"` | false | true | 按 `sensitivityMap` 过滤字段后返回 |
| `"sensitive"` | false | false | 返回 `{ success: false, error: "敏感数据需会话授权" }` |
| `"critical"` | true | 任意 | 原样返回（本地可信） |
| `"critical"` | false | 任意 | 返回 `{ success: false, error: "关键数据禁止发送远程 Provider" }` |

**实现伪代码：**

```ts
// src/guardrail/guardrail.ts

import type { ToolDefinition, RiskLevel, SensitivityLevel } from '../shared/types/tool';
import type { GuardrailCheck, GuardrailContext, IGuardrail } from '../shared/types/guardrail';
import type { IToolRegistry } from '../registry/types';
import type { ToolResult } from '../shared/types/tool';

export class Guardrail implements IGuardrail {
  constructor(private toolRegistry: IToolRegistry) {}

  async check(
    toolName: string,
    params: Record<string, unknown>,
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

    // Expert Only 检查
    if (tool.expertOnly && !context.expertModeEnabled) {
      return {
        allowed: false,
        riskLevel: 'critical',
        requiresPreflight: false,
        requiresConfirmation: false,
        reason: `工具 ${toolName} 需要 Expert Mode 开启`,
        dataSensitivity: tool.resultSensitivity,
      };
    }

    // Expert 子开关检查
    if (tool.category === 'expert') {
      const switchKey = tool.name.split('_')[0]; // 如 "proxy_set" → "proxy"
      if (!context.expertSwitches[switchKey]) {
        return {
          allowed: false,
          riskLevel: 'critical',
          requiresPreflight: false,
          requiresConfirmation: false,
          reason: `Expert 子开关 ${switchKey} 未开启`,
          dataSensitivity: tool.resultSensitivity,
        };
      }
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
        if (context.isLocalTrusted) {
          base.requiresConfirmation = false;
          base.reason = '高风险操作，本地信任 Provider，跳过确认';
        } else {
          base.requiresConfirmation = true;
          base.reason = '高风险操作，需要用户确认';
        }
        return base;

      case 'critical':
        if (!context.expertModeEnabled) {
          return {
            allowed: false,
            riskLevel: 'critical',
            requiresPreflight: false,
            requiresConfirmation: false,
            reason: 'Critical 操作需要 Expert Mode',
            dataSensitivity: tool.resultSensitivity,
          };
        }
        base.requiresPreflight = true;
        base.requiresConfirmation = true;
        base.reason = 'Critical 操作，需要 Expert Mode + 用户确认';
        return base;

      default:
        return base;
    }
  }

  /** 根据数据敏感级别过滤工具结果，控制外发给远程 Provider */
  filterResultForRemote(
    tool: ToolDefinition,
    result: ToolResult,
    context: GuardrailContext,
  ): ToolResult {
    if (!result.success || !result.data) return result;

    const sensitivity = tool.resultSensitivity;

    // 本地信任 Provider：原样返回
    if (context.isLocalTrusted) return result;

    switch (sensitivity) {
      case 'low':
        return result; // 直接发送

      case 'sensitive':
        if (!context.sessionGrants.sensitiveDataAllowed) {
          return {
            success: false,
            error: '敏感数据需会话授权才能发送给远程 Provider',
          };
        }
        // 有授权但需按 sensitivityMap 过滤
        return this.applySensitivityFilter(result);

      case 'critical':
        // 关键数据禁止发送远程 Provider
        return {
          success: false,
          error: '关键数据禁止发送给远程 Provider',
        };

      default:
        return result;
    }
  }

  private applySensitivityFilter(result: ToolResult): ToolResult {
    if (!result.sensitivityMap || !result.data) return result;

    const data = result.data as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      const fieldSensitivity = result.sensitivityMap[key] ?? 'sensitive';
      if (fieldSensitivity === 'low') {
        filtered[key] = value;
      } else {
        filtered[key] = `[${fieldSensitivity} data filtered]`;
      }
    }

    return { ...result, data: filtered };
  }
}
```

### 3.3 导出

**文件:** `src/guardrail/index.ts`

```ts
export { Guardrail } from './guardrail';
export type { GuardrailCheck, GuardrailContext, IGuardrail } from '../shared/types/guardrail';
```

## 4. 接口/契约

### 4.1 已有接口（T2 定义）

`IGuardrail.check()` — 见技术方案 4.2.2 节。

### 4.2 新增方法

```ts
// Guardrail 扩展方法（非接口约束，实现类提供）
filterResultForRemote(
  tool: ToolDefinition,
  result: ToolResult,
  context: GuardrailContext,
): ToolResult;
```

## 5. 测试指引

### 5.1 单元测试

**文件:** `src/guardrail/__tests__/guardrail.test.ts`

**测试场景及预期：**

| # | 场景 | 输入 | 预期结果 |
|---|------|------|----------|
| 1 | low 风险直接放行 | `riskLevel: "low"` | `allowed: true, requiresPreflight: false, requiresConfirmation: false` |
| 2 | medium 风险放行 | `riskLevel: "medium"` | `allowed: true, requiresPreflight: false, requiresConfirmation: false` |
| 3 | high 风险 + 非本地信任 | `riskLevel: "high", isLocalTrusted: false` | `allowed: true, requiresPreflight: true, requiresConfirmation: true` |
| 4 | high 风险 + 本地信任 | `riskLevel: "high", isLocalTrusted: true` | `allowed: true, requiresPreflight: true, requiresConfirmation: false` |
| 5 | critical + Expert Mode 开启 | `riskLevel: "critical", expertModeEnabled: true` | `allowed: true, requiresPreflight: true, requiresConfirmation: true` |
| 6 | critical + Expert Mode 关闭 | `riskLevel: "critical", expertModeEnabled: false` | `allowed: false` |
| 7 | expertOnly + Expert Mode 关闭 | `expertOnly: true, expertModeEnabled: false` | `allowed: false` |
| 8 | 未知工具名称 | `toolName: "nonexistent"` | `allowed: false, reason: "未知工具"` |
| 9 | dataSensitivity low 过滤 | `resultSensitivity: "low"` | 原样返回 data |
| 10 | dataSensitivity sensitive 无授权 | `sensitive, sensitiveDataAllowed: false` | 返回错误信息 |
| 11 | dataSensitivity sensitive 有授权 | `sensitive, sensitiveDataAllowed: true` | 按 sensitivityMap 过滤字段 |
| 12 | dataSensitivity critical 远程 | `critical, isLocalTrusted: false` | 返回 `error: "关键数据禁止发送远程 Provider"` |
| 13 | dataSensitivity critical 本地 | `critical, isLocalTrusted: true` | 原样返回 data |

**Mock 策略：** Mock `IToolRegistry.getTool()` 返回预设的 `ToolDefinition`。Mock `GuardrailContext` 配置各种组合。

## 6. 验收标准

- [ ] `riskLevel === "low"` 工具直接放行（`allowed: true, requiresConfirmation: false`）
- [ ] `riskLevel === "medium"` 工具放行但 reason 包含"记录日志"
- [ ] `riskLevel === "high"` 工具必须 `requiresPreflight: true`，非本地信任时 `requiresConfirmation: true`
- [ ] `riskLevel === "high"` + `isLocalTrusted: true` 时 `requiresConfirmation: false`
- [ ] `riskLevel === "critical"` 工具仅在 `expertModeEnabled: true` 时可用
- [ ] `expertOnly` 工具在 `expertModeEnabled: false` 时返回 `allowed: false`
- [ ] `dataSensitivity === "critical"` 工具结果禁止发送远程 Provider
- [ ] `dataSensitivity === "sensitive"` + `sensitiveDataAllowed: false` 时返回错误
- [ ] `filterResultForRemote` 正确按 `sensitivityMap` 过滤字段
- [ ] 单元测试覆盖所有风险等级 × 信任状态 × 授权状态组合

## 7. 注意事项

1. **`check` 是同步逻辑** — 不涉及 I/O，所有判断基于 `ToolDefinition` 元数据和 `GuardrailContext`，实现为纯函数（但接口声明为 `Promise` 以兼容未来异步扩展）。
2. **`filterResultForRemote` 不在 `IGuardrail` 接口中** — 这是 Guardrail 实现类的辅助方法，由 Agent Loop 在将工具结果注入 LLM 上下文前调用。
3. **日志记录** — medium 风险级别要求"记录日志"，本任务只需在 reason 中标明，实际日志写入由 Agent Loop 调用 `ConversationManager` 的 `toolCallLogs` 完成。
4. **Expert Mode 子开关匹配** — `expertSwitches` 的 key 需要与工具名称前缀匹配。约定：Expert 工具命名格式为 `{domain}_{action}`，如 `proxy_set`、`debugger_attach`，子开关 key 为 `{domain}`。
5. **Preflight 执行** — `check` 只返回 `requiresPreflight: true`，实际 preflight 的执行由 Agent Loop 通过 `ToolDefinition.preflight()` 完成。Guardrail 不负责执行 preflight。
