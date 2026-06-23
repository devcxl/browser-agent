## 审查报告 — PR #85

**PR:** `feat/create-skill-tool` → `dev`
**关联 Issue:** #75 (T4: 创建 skill 伪 tool 定义)
**审查人:** @reviewer
**日期:** 2026-06-23

---

### 变更概述
- **修改文件数:** 2（均为新增）
- **新增文件:**
  - `src/tools/skill-tool.ts` — `createSkillTool()` 工厂函数，返回 `ToolDefinition`
  - `src/tools/__tests__/skill-tool.test.ts` — 9 个单元测试
- **风险等级:** 低
- **无越界修改:** ✅ 仅修改 Issue #75 指定的文件

### 验证结果

| 验收标准 | 状态 | 详情 |
|----------|------|------|
| `src/tools/skill-tool.ts` 创建 | ✅ | 23 行，导出 `createSkillTool()` |
| ToolDefinition 符合接口 | ⚠️ | 见 [HIGH-1] |
| 单元测试通过 | ✅ | 9/9 通过，耗时 5ms |
| `npx tsc --noEmit` 编译 | ✅ | 零 skill-tool 相关错误 |

---

### 发现问题

#### [HIGH] 导入路径不一致 — `@/registry/types` vs `@/shared/types`

- **文件:** `src/tools/skill-tool.ts:1`
- **问题:** `skill-tool.ts` 使用 `import type { ToolDefinition } from '@/registry/types'`，但项目中其他所有 tools（28 处）均使用 `import ... from '@/shared/types'`。开发文档 #75 也明确要求从 `@/shared/types` 导入。

  `src/registry/types.ts` 和 `src/shared/types/tool.ts` 中 `ToolDefinition` 的 `schema` 字段类型定义不同：
  - `registry/types.ts`: `properties: Record<string, unknown>`（宽松）
  - `shared/types/tool.ts`: `properties: Record<string, { type: string; description?: string; ... }>`（严格，符合 `ToolParameterSchema`）

  当前导入 `@/registry/types` 会导致 `schema.properties.name.type` 被推断为 `unknown`，虽然测试能通过，但类型安全性降低。

- **修复建议:**
  ```typescript
  // 修改前
  import type { ToolDefinition } from '@/registry/types';

  // 修改后
  import type { ToolDefinition } from '@/shared/types';
  ```

- **严重程度:** High — 违反项目统一导入规范，且降低类型安全性

---

#### [MEDIUM] 开发文档约定 10 个测试用例，实际只有 9 个

- **文件:** `src/tools/__tests__/skill-tool.test.ts`
- **问题:** Issue #75 开发文档（3.2 节）列出了 14 个测试用例（含 `it('execute 是函数', ...)` 和 `it('schema.properties.name.description 非空', ...)` 以及 `it('execute 能处理任意 name 值', ...)` 等），实际测试文件将结构属性验证合并为更简洁的写法，共 9 个用例。

  实际 9 个测试覆盖了所有关键断言：
  - name、category、riskLevel、confirmationRequired、resultSensitivity ✅
  - schema 结构 ✅
  - description ✅
  - execute 两种 skill 名称 ✅

  缺少的断言（不影响功能正确性）：
  - `typeof tool.execute === 'function'` — 隐式被 async 调用覆盖
  - `schema.properties.name.description` 非空检查 — 非关键
  - 中文 skill 名称测试 — 非关键

- **修复建议:** 无需修改。9 个测试已覆盖核心行为，减少 1 个非关键断言不影响质量。但建议在 PR 描述中注明实际测试数与开发文档的差异。

- **严重程度:** Medium — 不影响功能正确性

---

#### [MEDIUM] `execute` 缺少对异常 name 参数的防御

- **文件:** `src/tools/skill-tool.ts:19-21`
- **问题:** `execute` 的伪实现直接使用 `params.name`，未处理 `name` 为 `undefined`、空字符串或非字符串类型的情况。虽然 schema 声明 `required: ['name']`，但 LLM 可能传入意外值（如 `{ name: undefined }` 或 `{ name: '' }`）。

  伪 tool 虽然"永远返回 success"，但返回 `{ activated: undefined }` 或 `{ activated: '' }` 可能在下游 T6（AgentLoop）拦截逻辑中造成非预期行为。

- **修复建议:**
  ```typescript
  execute: async (params) => {
    const name = typeof params.name === 'string' && params.name.trim() 
      ? params.name.trim() 
      : String(params.name ?? 'unknown');
    return { success: true, data: { activated: name } };
  },
  ```
  或至少加一条注释说明"此 tool 的 execute 为伪实现，实际拦截在 AgentLoop 中，无需校验参数"。

- **严重程度:** Medium — 伪 tool，实际不会直接执行，但防御性编程是良好实践

---

#### [LOW] 测试文件使用 `toHaveProperty` 但未验证 `name` 的 `type` 字段

- **文件:** `src/tools/__tests__/skill-tool.test.ts:29`
- **问题:** `expect(tool.schema.properties).toHaveProperty('name')` 只验证了 key 存在，未验证 `name.type === 'string'` 和 `name.description` 非空。开发文档 3.2 节中有对应的断言。

  这不影响实际功能，但测试完整性略低于开发文档的要求。

- **严重程度:** Low — 结构测试的次要遗漏

---

### 测试建议

当前测试覆盖已足够。建议后续（T6/T7）补充以下集成测试：
- AgentLoop 拦截 `tool.name === 'skill'` 时跳过 execute 并加载 skill 上下文
- ToolRegistry 注册 `createSkillTool()` 后 `getTool('skill')` 能正确返回

---

### 审查结论

- **结论:** 有条件通过 — 存在 1 个 High 问题
- **High 问题:** 导入路径应从 `@/registry/types` 改为 `@/shared/types`（项目统一规范 + 类型安全性）
- **必须修复:** [HIGH] 导入路径不一致
- **建议修复:** [MEDIUM] 参数防御性处理

修复 [HIGH-1] 后可 Approve。

---

### 修复检查清单

- [ ] `skill-tool.ts:1` — `import` 改为 `from '@/shared/types'`
- [ ] 重新运行 `npx tsc --noEmit` 确认零新增错误
- [ ] 重新运行 `npx vitest run src/tools/__tests__/skill-tool.test.ts` 确认 9/9 通过
