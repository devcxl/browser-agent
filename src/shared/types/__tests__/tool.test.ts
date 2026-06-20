import { describe, it, expect } from 'vitest';
import type {
  RiskLevel,
  ToolCategory,
  SensitivityLevel,
  PreflightAffectedObject,
  PreflightResult,
  ToolResult,
  ToolParameterSchema,
  OpenAIToolSchema,
  ToolDefinition,
  IToolRegistry,
  ToolCallRecord,
} from '../tool';

describe('Tool types', () => {
  describe('RiskLevel', () => {
    it('should only allow four values', () => {
      const levels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
      expect(levels).toHaveLength(4);
    });
  });

  describe('ToolCategory', () => {
    it('should have exactly 17 categories', () => {
      const categories: ToolCategory[] = [
        'tabs', 'windows', 'tabGroups', 'bookmarks',
        'history', 'downloads', 'sessions', 'page',
        'cookies', 'storage', 'clipboard', 'notifications',
        'contextMenus', 'sidePanel', 'alarms', 'system', 'expert',
      ];
      expect(categories).toHaveLength(17);
    });
  });

  describe('SensitivityLevel', () => {
    it('should only allow three values', () => {
      const levels: SensitivityLevel[] = ['low', 'sensitive', 'critical'];
      expect(levels).toHaveLength(3);
    });
  });

  describe('PreflightAffectedObject', () => {
    it('should accept a valid object', () => {
      const obj: PreflightAffectedObject = {
        type: 'tab',
        id: '1',
        title: 'Test',
        url: 'https://example.com',
      };
      expect(obj.type).toBe('tab');
    });
  });

  describe('PreflightResult', () => {
    it('should contain affectedObjects and warnings', () => {
      const result: PreflightResult = {
        affectedObjects: [],
        warnings: [],
      };
      expect(result.affectedObjects).toEqual([]);
    });
  });

  describe('ToolResult', () => {
    it('should require success', () => {
      const result: ToolResult = { success: true, data: { key: 'val' } };
      expect(result.success).toBe(true);
    });

    it('should support error result', () => {
      const result: ToolResult = { success: false, error: 'Something failed' };
      expect(result.error).toBe('Something failed');
    });

    it('should support sensitivityMap', () => {
      const result: ToolResult = {
        success: true,
        sensitivityMap: { url: 'sensitive' },
      };
      expect(result.sensitivityMap!.url).toBe('sensitive');
    });
  });

  describe('ToolParameterSchema', () => {
    it('should define OpenAI function parameters shape', () => {
      const schema: ToolParameterSchema = {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number' },
        },
        required: ['query'],
      };
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('query');
    });
  });

  describe('OpenAIToolSchema', () => {
    it('should define OpenAI tool schema with extensions', () => {
      const schema: OpenAIToolSchema = {
        type: 'function',
        function: {
          name: 'tabs_query',
          description: 'Query tabs',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
        'x-capability': 'tabs',
        'x-risk-level': 'low',
        'x-confirmation-required': false,
      };
      expect(schema.type).toBe('function');
      expect(schema['x-capability']).toBe('tabs');
    });
  });

  describe('ToolDefinition', () => {
    it('should define a complete tool', () => {
      const tool: ToolDefinition = {
        name: 'tabs_query',
        description: 'Query browser tabs',
        schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: async () => ({ success: true }),
      };
      expect(tool.name).toBe('tabs_query');
      expect(tool.category).toBe('tabs');
    });
  });

  describe('IToolRegistry', () => {
    it('should define the registry interface', () => {
      const registry: IToolRegistry = {
        register: () => {},
        registerAll: () => {},
        getAllTools: () => [],
        getTool: () => undefined,
        getToolsByCategory: () => [],
        toOpenAISchema: () => [],
        unregisterCategory: () => {},
        size: 0,
      };
      expect(registry.size).toBe(0);
    });
  });

  describe('ToolCallRecord', () => {
    it('should record a tool call', () => {
      const record: ToolCallRecord = {
        toolName: 'tabs_query',
        params: {},
        result: { success: true },
        riskLevel: 'low',
        confirmed: true,
        timestamp: Date.now(),
      };
      expect(record.toolName).toBe('tabs_query');
    });
  });
});
