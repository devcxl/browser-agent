# 开发文档: T4 - 创建 skill 伪 tool 定义

**Project:** Agent Skill System
**Task ID:** T4
**Slug:** create-skill-tool
**Issue:** #75
**类型:** backend
**Batch:** 1
**依赖:** T1 (define-skill-types)

## 1. 目标

创建 `skill` 伪 tool 的 `ToolDefinition`，导出 `createSkillTool()` 工厂函数。LLM 通过 function calling 调用此 tool 声明要激活的 skill。此 tool 不需要真正的执行逻辑——实际拦截在 T6（AgentLoop）中完成。

## 2. 前置条件

- T1 已完成：`src/shared/types/skill.ts` 中 `Skill`、`ISkillStore` 类型定义就绪
- 熟悉 `src/shared/types/tool.ts` 中的 `ToolDefinition`、`ToolParameterSchema`、`ToolResult` 类型
- 了解项目用 `@/` 路径别名（指向 `src/`）

## 3. 实现步骤

### 3.1 创建 skill-tool.ts

**文件: `src/tools/skill-tool.ts`（新增）**

关键逻辑：
- 导出 `createSkillTool()` 工厂函数
- 返回符合 `ToolDefinition` 接口的对象
- `execute` 是伪实现：只返回 `{ success: true, data: { activated: params.name } }`
- schema 使用 `ToolParameterSchema` 类型，只接受一个 `name` 参数

```typescript
import type { ToolDefinition } from '@/shared/types';

/**
 * 创建 skill 伪 tool 定义。
 * 此 tool 的 execute 为伪实现——真正的 skill 激活拦截逻辑在 AgentLoop 中（T6）。
 * 注册由 T7（useAgent 集成）负责。
 */
export function createSkillTool(): ToolDefinition {
  return {
    name: 'skill',
    description:
      '激活一个技能（skill），加载该技能的上下文指令。当你识别到用户意图匹配某个技能时，调用此工具激活它。可以多次调用以激活多个技能。',
    schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '要激活的技能名称',
        },
      },
      required: ['name'],
    },
    category: 'expert',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    execute: async (params) => {
      // 伪 tool：实际拦截在 AgentLoop 中，这里只返回成功
      return { success: true, data: { activated: params.name } };
    },
  };
}
```

### 3.2 编写单元测试

**文件: `src/tools/__tests__/skill-tool.test.ts`（新增）**

关键逻辑：
- 调用 `createSkillTool()` 获取 ToolDefinition
- 验证结构完整性：name、category、riskLevel、confirmationRequired、resultSensitivity
- 验证 schema 的 required 包含 `name`
- 验证 `execute` 返回正确的 `ToolResult`

```typescript
import { describe, it, expect } from 'vitest';
import { createSkillTool } from '../skill-tool';

describe('createSkillTool', () => {
  const tool = createSkillTool();

  describe('ToolDefinition 结构完整性', () => {
    it('name 为 "skill"', () => {
      expect(tool.name).toBe('skill');
    });

    it('category 为 "expert"', () => {
      expect(tool.category).toBe('expert');
    });

    it('riskLevel 为 "low"', () => {
      expect(tool.riskLevel).toBe('low');
    });

    it('confirmationRequired 为 false', () => {
      expect(tool.confirmationRequired).toBe(false);
    });

    it('resultSensitivity 为 "low"', () => {
      expect(tool.resultSensitivity).toBe('low');
    });

    it('description 非空', () => {
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe('string');
    });

    it('execute 是函数', () => {
      expect(typeof tool.execute).toBe('function');
    });
  });

  describe('schema 参数定义', () => {
    it('schema.type 为 "object"', () => {
      expect(tool.schema.type).toBe('object');
    });

    it('schema.properties.name.type 为 "string"', () => {
      expect(tool.schema.properties.name).toBeDefined();
      expect(tool.schema.properties.name.type).toBe('string');
    });

    it('schema.properties.name.description 非空', () => {
      expect(tool.schema.properties.name.description).toBeTruthy();
    });

    it('schema.required 包含 "name"', () => {
      expect(tool.schema.required).toBeDefined();
      expect(tool.schema.required).toContain('name');
    });
  });

  describe('execute 伪实现', () => {
    it('execute 返回 success: true 和 data.activated', async () => {
      const result = await tool.execute({ name: 'test-skill' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ activated: 'test-skill' });
    });

    it('execute 能处理任意 name 值', async () => {
      const result = await tool.execute({ name: '代码审查' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ activated: '代码审查' });
    });
  });
});
```

## 4. 接口/契约

### 4.1 `createSkillTool()` 返回值契约

```typescript
function createSkillTool(): ToolDefinition
```

返回的 `ToolDefinition` 各字段值：

| 字段 | 值 | 说明 |
|------|-----|------|
| `name` | `'skill'` | tool 唯一名称，AgentLoop 用此名称做拦截判断 |
| `description` | 含中文的激活引导文本 | 注入 system prompt，引导 LLM 何时调用 |
| `schema.type` | `'object'` | OpenAI function calling 格式要求 |
| `schema.properties.name.type` | `'string'` | 唯一参数：skill 名称 |
| `schema.required` | `['name']` | name 为必填 |
| `category` | `'expert'` | 避免与现有浏览器 tool 类别冲突 |
| `riskLevel` | `'low'` | 无副作用，无需 guardrail 拦截 |
| `confirmationRequired` | `false` | 无需用户确认 |
| `resultSensitivity` | `'low'` | 返回数据不敏感 |
| `execute` | 伪实现 | 返回 `{ success: true, data: { activated: params.name } }` |

### 4.2 与 ToolRegistry 的关系

此任务**不负责**将 tool 注册到 ToolRegistry。注册在 T7（useAgent 集成）中完成。届时调用方式：

```typescript
// T7 中执行（本任务不实现）
registry.register(createSkillTool());
```

### 4.3 数据模型变更

无。不新增类型，不修改存储 schema。

## 5. 测试指引

### 5.1 运行测试

```bash
npx vitest run src/tools/__tests__/skill-tool.test.ts
```

预期结果：全部 10 个测试通过。

### 5.2 类型检查

```bash
npx tsc --noEmit
```

预期结果：零错误。

## 6. 验收标准

- [ ] `src/tools/skill-tool.ts` 文件创建，导出 `createSkillTool()` 工厂函数
- [ ] `createSkillTool()` 返回的 `ToolDefinition` 完全符合 `ToolDefinition` 接口（类型检查通过）
- [ ] 单元测试 10 个用例全部通过（vitest）
- [ ] `npx tsc --noEmit` 编译通过

## 7. 注意事项

1. **`execute` 是伪实现**：真正拦截逻辑在 T6（AgentLoop）中。这里的 `execute` 永远返回 success，不会真正激活 skill。AgentLoop 会在 `tool.function.name === 'skill'` 时跳过此 execute，自行处理激活逻辑。

2. **`category: 'expert'`**：使用 `expert` 类别而非新建类别，避免与现有 16 个浏览器 tool 类别（tabs、windows、bookmarks 等）冲突。`ToolCategory` 中已预置 `'expert'`。

3. **不在此任务注册**：`createSkillTool()` 只创建定义，注册到 `ToolRegistry` 是 T7 的职责。不要在 `phase2-register.ts` 或其他注册入口中引入此 tool。

4. **文件位置**：虽然项目其他 tool 按子目录组织（`page/`、`cookies/` 等），但此 tool 为单文件且无额外依赖，直接放在 `src/tools/skill-tool.ts` 即可。测试放在 `src/tools/__tests__/skill-tool.test.ts`（与 `phase2-register.test.ts` 同级）。

5. **类型导入**：`ToolDefinition` 从 `@/shared/types` 导入（barrel export），与项目其他模块风格一致。不使用 `@/registry/types`，`shared/types` 是规范的类型来源。
