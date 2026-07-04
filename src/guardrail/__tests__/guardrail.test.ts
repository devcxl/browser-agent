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
      expect(result.requiresConfirmation).toBe(false);
      expect(result.riskLevel).toBe('low');
    });

    it('场景2: medium 风险放行', async () => {
      const tool = makeTool({ riskLevel: 'medium' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check('test_tool', {}, makeContext());

      expect(result.allowed).toBe(true);
      expect(result.requiresPreflight).toBe(false);
      expect(result.requiresConfirmation).toBe(false);
    });

    it('场景3: high + 非本地信任 → requiresPreflight + requiresConfirmation', async () => {
      const tool = makeTool({ riskLevel: 'high' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check('test_tool', {}, makeContext({ isLocalTrusted: false }));

      expect(result.allowed).toBe(true);
      expect(result.requiresPreflight).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
    });

    it('场景4: high + 本地信任 → requiresConfirmation false', async () => {
      const tool = makeTool({ riskLevel: 'high' });
      const registry = createMockRegistry(() => tool);
      const guardrail = new Guardrail(registry);

      const result = await guardrail.check('test_tool', {}, makeContext({ isLocalTrusted: true }));

      expect(result.allowed).toBe(true);
      expect(result.requiresPreflight).toBe(true);
      expect(result.requiresConfirmation).toBe(false);
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
      expect(result.requiresConfirmation).toBe(true);
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
      expect(result.requiresConfirmation).toBe(false);
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
  });
});
