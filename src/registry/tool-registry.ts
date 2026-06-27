import type {
  IToolRegistry,
  ToolCategory,
  ToolDefinition,
  OpenAIToolSchema,
} from "./types";

export class ToolRegistry implements IToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  get size(): number {
    return this.tools.size;
  }

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `Tool "${tool.name}" is already registered. Use a different name or unregister it first.`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  getAllTools(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getToolsByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAllTools().filter((t) => t.category === category);
  }

  toOpenAISchema(): OpenAIToolSchema[] {
    return this.getAllTools().map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.schema,
      },
    }));
  }

  unregisterCategory(category: ToolCategory): void {
    for (const [name, tool] of this.tools) {
      if (tool.category === category) {
        this.tools.delete(name);
      }
    }
  }
}
