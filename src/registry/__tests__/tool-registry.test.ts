import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../tool-registry";
import type { ToolDefinition, ToolCategory } from "../types";

function createMockTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "test-tool",
    description: "A test tool",
    schema: { type: "object", properties: {} },
    category: "tabs",
    riskLevel: "low",
    confirmationRequired: false,
    resultSensitivity: "low",
    execute: async () => ({ success: true }),
    ...overrides,
  };
}

describe("ToolRegistry", () => {
  describe("register", () => {
    it("should register a tool and make it retrievable via getTool", () => {
      const registry = new ToolRegistry();
      const tool = createMockTool({ name: "getTabs" });
      registry.register(tool);
      expect(registry.getTool("getTabs")).toBe(tool);
    });

    it("should throw when registering a tool with a duplicate name", () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool({ name: "getTabs" }));
      expect(() =>
        registry.register(createMockTool({ name: "getTabs" })),
      ).toThrow('Tool "getTabs" is already registered');
    });
  });

  describe("registerAll", () => {
    it("should register multiple tools", () => {
      const registry = new ToolRegistry();
      const tools = [
        createMockTool({ name: "tool-a" }),
        createMockTool({ name: "tool-b" }),
        createMockTool({ name: "tool-c" }),
      ];
      registry.registerAll(tools);
      expect(registry.getAllTools()).toHaveLength(3);
    });

    it("should throw if any tool in the batch has a duplicate name", () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool({ name: "existing" }));
      expect(() =>
        registry.registerAll([
          createMockTool({ name: "new" }),
          createMockTool({ name: "existing" }),
        ]),
      ).toThrow('Tool "existing" is already registered');
    });
  });

  describe("getAllTools", () => {
    it("should return an empty array for a fresh registry", () => {
      const registry = new ToolRegistry();
      expect(registry.getAllTools()).toEqual([]);
    });

    it("should return a shallow copy that cannot mutate internal state", () => {
      const registry = new ToolRegistry();
      const tool = createMockTool({ name: "tool" });
      registry.register(tool);

      const result = registry.getAllTools();
      expect(result).toHaveLength(1);

      // Mutate the returned array
      result.pop();
      expect(registry.getAllTools()).toHaveLength(1);
    });
  });

  describe("getTool", () => {
    it("should return undefined for a non-existent tool", () => {
      const registry = new ToolRegistry();
      expect(registry.getTool("non-existent")).toBeUndefined();
    });
  });

  describe("getToolsByCategory", () => {
    it("should filter tools by category", () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool({ name: "tool-tabs", category: "tabs" }));
      registry.register(
        createMockTool({ name: "tool-windows", category: "windows" }),
      );
      registry.register(
        createMockTool({ name: "tool-tabGroups", category: "tabGroups" }),
      );

      const tabs = registry.getToolsByCategory("tabs");
      expect(tabs).toHaveLength(1);
      expect(tabs[0]?.name).toBe("tool-tabs");

      const windows = registry.getToolsByCategory("windows");
      expect(windows).toHaveLength(1);
      expect(windows[0]?.name).toBe("tool-windows");
    });
  });

  describe("toOpenAISchema", () => {
    it("should return an empty array when no tools are registered", () => {
      const registry = new ToolRegistry();
      expect(registry.toOpenAISchema()).toEqual([]);
    });

    it("should convert registered tools to OpenAI function schema format", () => {
      const registry = new ToolRegistry();
      registry.register(
        createMockTool({
          name: "getTabs",
          description: "Get all open tabs",
          schema: {
            type: "object",
            properties: { windowId: { type: "number" } },
            required: [],
          },
        }),
      );

      const schema = registry.toOpenAISchema();
      expect(schema).toHaveLength(1);
      expect(schema[0]).toEqual({
        type: "function",
        function: {
          name: "getTabs",
          description: "Get all open tabs",
          parameters: {
            type: "object",
            properties: { windowId: { type: "number" } },
            required: [],
          },
        },
      });
    });
  });

  describe("unregisterCategory", () => {
    it("should remove all tools of the specified category", () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool({ name: "tool-tabs", category: "tabs" }));
      registry.register(
        createMockTool({ name: "tool-windows", category: "windows" }),
      );

      registry.unregisterCategory("tabs");
      const remaining = registry.getAllTools();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.name).toBe("tool-windows");
    });

    it("should be idempotent when unregistering a non-existent category", () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool({ name: "tool", category: "tabs" }));
      expect(() =>
        registry.unregisterCategory("expert" as ToolCategory),
      ).not.toThrow();
      expect(registry.getAllTools()).toHaveLength(1);
    });
  });
});
