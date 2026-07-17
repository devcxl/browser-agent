---
parent_issue: 135
phase: 1
dependencies: []
status: todo
estimated_lines: +100
---

# Task 1.2: 实现 jsonSchemaToZod 转换器

## 目标
实现 JSON Schema → Zod Schema 转换器，使现有工具的 JSON Schema 定义能直接适配 AI SDK v7 的 `tool()` 参数。

## 实现要点
1. 新建 `src/shared/json-schema-to-zod.ts`
2. 优先评估使用 `json-schema-to-zod` 包（~5KB min+gz）
3. 如引入新包不可行，手动实现精简版，仅支持项目 JSON Schema 子集：
   - `type`（string/number/boolean/object/array）
   - `properties` + `required`
   - `enum`
   - `items`
   - `description`
4. 不支持的特性：`$ref`、`oneOf`、`anyOf`、`allOf`、循环引用（当前工具 schema 不使用这些特性）
5. 编写测试验证所有 40+ 工具 schema 可正确转换
6. 参数校验行为必须与原 JSON Schema 保持一致

## 验收标准
- [ ] 所有 `tools/` 目录下的工具 JSON Schema 能成功转换
- [ ] 单元测试覆盖：基本类型、enum、数组、嵌套对象
- [ ] 参数校验行为与 `ToolRegistry.validateParams()` 一致
- [ ] TypeScript 编译无错误
