import { describe, it, expect, vi } from 'vitest';
import type { IToolRegistry, ToolDefinition, ToolResult } from '../../registry/types';
import type { GuardrailContext } from '../../shared/types/guardrail';
import { Guardrail } from '../guardrail';

function createMockRegistry(getTool: (name: string) => ToolDefinition | undefined): IToolRegistry {
  return {
    getTool,
    register: vi.fn(),
    registerAll: vi.fn(),
    getAllTools: vi.fn(),
    getToolsByCategory: vi.fn(),
    toOpenAISchema: vi.fn(),
    unregisterCategory: vi.fn(),
  };
}

function makeTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'test_tool',
    description: 'Test tool',
    schema: { type: 'object', properties: {} },
    category: 'tabs',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    execute: vi.fn(),
    ...overrides,
  };
}

function makeContext(overrides: Partial<GuardrailContext> = {}): GuardrailContext {
  return {
    isLocalTrusted: false,
    expertModeEnabled: false,
    expertSwitches: {},
    grantedPermissions: [],
    sessionGrants: { sensitiveDataAllowed: false },
    ...overrides,
  };
}

describe('Guardrail', () => {
  describe('check()', () => {
    it('场景1: low 风险直接放行', async () => {
      const tool = makeTool({ riskLevel: 'low' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check('test_tool', {}, makeContext());

      expect(result.allowed).toBe(true);
      expect(result.requiresPreflight).toBe(false);
      expect(result.riskLevel).toBe('low');
    });

    it('场景2: medium 风险放行', async () => {
      const tool = makeTool({ riskLevel: 'medium' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check('test_tool', {}, makeContext());

      expect(result.allowed).toBe(true);
      expect(result.requiresPreflight).toBe(false);
    });

    it('场景3: high + 非本地信任 → requiresPreflight', async () => {
      const tool = makeTool({ riskLevel: 'high' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check('test_tool', {}, makeContext({ isLocalTrusted: false }));

      expect(result.allowed).toBe(true);
      expect(result.requiresPreflight).toBe(true);
    });

    it('场景4: high + 本地信任 → requiresPreflight', async () => {
      const tool = makeTool({ riskLevel: 'high' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check('test_tool', {}, makeContext({ isLocalTrusted: true }));

      expect(result.allowed).toBe(true);
      expect(result.requiresPreflight).toBe(true);
    });

    it('场景5: critical + Expert Mode → allowed true', async () => {
      const tool = makeTool({ riskLevel: 'critical' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check(
        'test_tool',
        {},
        makeContext({ expertModeEnabled: true }),
      );

      expect(result.allowed).toBe(true);
      expect(result.requiresPreflight).toBe(true);
    });

    it('场景6: critical + !Expert Mode → allowed false', async () => {
      const tool = makeTool({ riskLevel: 'critical' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check(
        'test_tool',
        {},
        makeContext({ expertModeEnabled: false }),
      );

      expect(result.allowed).toBe(false);
      expect(result.requiresPreflight).toBe(false);
    });

    it('场景6b: critical + expertSwitch 未开启 → allowed false', async () => {
      const tool = makeTool({ riskLevel: 'critical', expertSwitch: 'debugger' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check(
        'test_tool',
        {},
        makeContext({ expertModeEnabled: true, expertSwitches: { debugger: false } }),
      );

      expect(result.allowed).toBe(false);
      expect(result.requiresPreflight).toBe(false);
      expect(result.reason).toContain('Critical 操作需要开启 Expert API: debugger');
    });

    it('场景6c: 未识别 riskLevel 走 default 分支 → 原样放行', async () => {
      const tool = makeTool({ riskLevel: 'unknown-level' as ToolDefinition['riskLevel'] });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check('test_tool', {}, makeContext());

      expect(result.allowed).toBe(true);
      expect(result.riskLevel).toBe('unknown-level');
      expect(result.requiresPreflight).toBe(false);
    });

    it('场景7: expertOnly + !Expert Mode → allowed false', async () => {
      const tool = makeTool({ riskLevel: 'low', expertOnly: true });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check(
        'test_tool',
        {},
        makeContext({ expertModeEnabled: false }),
      );

      expect(result.allowed).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('场景8: 未知工具 → allowed false', async () => {
      const registry = createMockRegistry(() => undefined);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check('nonexistent', {}, makeContext());

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('未知工具');
    });

    it('场景8b: expertOnly + expertSwitch 未开启 → allowed false', async () => {
      const tool = makeTool({ riskLevel: 'low', expertOnly: true, expertSwitch: 'debugger' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check(
        'test_tool',
        {},
        makeContext({ expertModeEnabled: true, expertSwitches: { debugger: false } }),
      );

      expect(result.allowed).toBe(false);
      expect(result.riskLevel).toBe('critical');
      expect(result.reason).toContain('需要开启 Expert API: debugger');
    });

    it('场景8c: 缺少可选权限 → allowed false', async () => {
      const tool = makeTool({ category: 'management', riskLevel: 'medium' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check(
        'test_tool',
        {},
        makeContext({ grantedPermissions: ['tabs'] }),
      );

      expect(result.allowed).toBe(false);
      expect(result.riskLevel).toBe('medium');
      expect(result.reason).toContain('需要额外权限');
      expect(result.reason).toContain('management');
    });

    it('场景8d: 无缺省权限需求的分类（debugger）在无授权时放行', async () => {
      const tool = makeTool({ category: 'debugger', riskLevel: 'high' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check(
        'test_tool',
        {},
        makeContext({ grantedPermissions: ['debugger'] }),
      );

      expect(result.allowed).toBe(true);
      expect(result.requiresPreflight).toBe(true);
    });
  });

  describe('filterResultForRemote()', () => {
    const defaultResult: ToolResult = { success: true, data: { url: 'https://example.com' } };

    it('场景9: dataSensitivity low → 原样返回', () => {
      const tool = makeTool({ resultSensitivity: 'low' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = guardrail.filterResultForRemote(tool, defaultResult, makeContext());

      expect(result).toEqual(defaultResult);
    });

    it('场景10: sensitive + 无授权 → 错误', () => {
      const tool = makeTool({ resultSensitivity: 'sensitive' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = guardrail.filterResultForRemote(tool, defaultResult, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('敏感数据');
    });

    it('场景11: sensitive + 有授权 → 按 sensitivityMap 过滤', () => {
      const tool = makeTool({ resultSensitivity: 'sensitive' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const resultWithMap: ToolResult = {
        success: true,
        data: { url: 'https://example.com', title: 'hello', secret: 'abc123' },
        sensitivityMap: { url: 'low', title: 'sensitive', secret: 'critical' },
      };
      const context = makeContext({
        isLocalTrusted: false,
        sessionGrants: { sensitiveDataAllowed: true },
      });

      const result = guardrail.filterResultForRemote(tool, resultWithMap, context);

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).url).toBe('https://example.com');
      expect((result.data as Record<string, unknown>).title).toBe('[sensitive data filtered]');
      expect((result.data as Record<string, unknown>).secret).toBe('[critical data filtered]');
    });

    it('场景12: critical + 远程 → 错误', () => {
      const tool = makeTool({ resultSensitivity: 'critical' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = guardrail.filterResultForRemote(tool, defaultResult, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('关键数据禁止发送');
    });

    it('场景13: critical + 本地 → 原样返回', () => {
      const tool = makeTool({ resultSensitivity: 'critical' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = guardrail.filterResultForRemote(
        tool,
        defaultResult,
        makeContext({ isLocalTrusted: true }),
      );

      expect(result).toEqual(defaultResult);
    });

    it('失败结果应直接返回不做过滤', () => {
      const tool = makeTool({ resultSensitivity: 'critical' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);
      const failedResult: ToolResult = { success: false, error: 'something broke' };

      const result = guardrail.filterResultForRemote(tool, failedResult, makeContext());

      expect(result).toEqual(failedResult);
    });

    it('无 data 的结果应直接返回', () => {
      const tool = makeTool({ resultSensitivity: 'critical' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);
      const result: ToolResult = { success: true };

      const filtered = guardrail.filterResultForRemote(tool, result, makeContext());

      expect(filtered).toEqual(result);
    });

    it('sensitive + 有授权 + 无 sensitivityMap → 原样返回', () => {
      const tool = makeTool({ resultSensitivity: 'sensitive' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);
      const result: ToolResult = { success: true, data: { url: 'https://example.com' } };

      const filtered = guardrail.filterResultForRemote(
        tool,
        result,
        makeContext({ sessionGrants: { sensitiveDataAllowed: true } }),
      );

      expect(filtered).toEqual(result);
    });

    it('sensitivityMap 未列出的字段默认按 sensitive 过滤', () => {
      const tool = makeTool({ resultSensitivity: 'sensitive' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);
      const result: ToolResult = {
        success: true,
        data: { visible: 'kept', hidden: 'value' },
        sensitivityMap: { visible: 'low' },
      };

      const filtered = guardrail.filterResultForRemote(
        tool,
        result,
        makeContext({ sessionGrants: { sensitiveDataAllowed: true } }),
      );

      const data = filtered.data as Record<string, unknown>;
      expect(data.visible).toBe('kept');
      expect(data.hidden).toBe('[sensitive data filtered]');
    });

    it('未知 resultSensitivity（非 low/sensitive/critical）原样返回', () => {
      const tool = makeTool({ resultSensitivity: 'weird' as ToolDefinition['resultSensitivity'] });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);
      const result: ToolResult = { success: true, data: { url: 'https://example.com' } };

      const filtered = guardrail.filterResultForRemote(
        tool,
        result,
        makeContext({ sessionGrants: { sensitiveDataAllowed: true } }),
      );

      expect(filtered).toEqual(result);
    });
  });
});
