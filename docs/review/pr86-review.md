## 审查报告 — PR #86

**PR 标题:** T2: 扩展 StorageSchema 增加 skills 字段 (closes #76)
**审查时间:** 2026-06-23
**审查人:** @reviewer
**基准分支:** dev ← feat/extend-storage-schema

---

### 变更概述

| 项目 | 数值 |
|------|------|
| 修改文件数 | 3 |
| 新增行数 | 8 |
| 删除行数 | 1 |
| 新增接口/字段 | `StorageSchema.skills: Skill[]` |
| 关联 Issue | #76 |
| 风险等级 | **低** |

**变更文件清单:**

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/shared/types/storage.ts` | MODIFIED | 新增 `Skill` 类型导入 + `skills` 字段声明 |
| `src/shared/storage/config-store.ts` | MODIFIED | DEFAULTS 新增 `skills: []` |
| `src/shared/types/__tests__/storage.test.ts` | MODIFIED | 测试用例补 `skills: []` 和 `reasoningEffort` |

---

### 验收标准对照

| 验收项 | 状态 | 验证方式 |
|--------|------|----------|
| `StorageSchema` 包含 `skills: Skill[]` 字段 | ✅ 通过 | 代码审查：`storage.ts` 第 20 行 |
| `ConfigStore.DEFAULTS.skills` 为 `[]` | ✅ 通过 | 代码审查：`config-store.ts` 第 28 行 |
| 现有 ConfigStore 单测通过 | ✅ 通过 | `vitest run` 21/21 tests passed |
| `npx tsc --noEmit` 编译通过 | ⚠️ 预存错误 | 所有错误与 dev 分支一致，非本次引入 |

---

### 发现问题

**无 Critical / High / Medium 问题。**

#### 预存问题（非本次引入，不计入评级）

tsc 有 54 个预存错误，其中与本次变更文件相关的：

| 文件 | 错误 | 状态 |
|------|------|------|
| `storage.test.ts:20,35` | `reasoningEffort` 缺失（`AgentSettings` 字面量未包含 `reasoningEffort`） | dev 分支已有，PR diff 中已补充 |
| `storage.test.ts:128` | `getAll()` 返回类型缺少 `skills` 和 `reasoningEffort` | dev 分支已有，PR diff 中已补充 |

> **注意：** PR diff 中测试文件已修复了上述 3 个预存问题——为 `AgentSettings` 字面量补了 `reasoningEffort: 'medium'`，为 `IConfigStore.getAll()` mock 返回值补了 `skills: []`。但由于 dev 分支也存在 `reasoningEffort` 缺失问题（`storage.test.ts` 的第 20 行和第 35 行在 dev 分支上同样报错），这些修复属于善意的 bugfix，未在 Issue #76 的验收标准中明确要求。

#### 越界修改检查

| 修改 | 是否越界 | 说明 |
|------|----------|------|
| `storage.ts` 新增 `import type { Skill }` | ❌ 否 | 新增 `skills: Skill[]` 的必要导入 |
| `storage.ts` 新增 `skills: Skill[]` 字段 | ❌ 否 | Issue #76 明确要求 |
| `config-store.ts` DEFAULTS 新增 `skills: []` | ❌ 否 | Issue #76 明确要求 |
| `storage.test.ts` 补 `reasoningEffort` | ⚠️ 待讨论 | 属于对预存类型错误的修复，与本次变更的 `skills` 字段不直接相关，但作为测试文件维护是合理的 |

---

### 详细审查

#### 1. `src/shared/types/storage.ts` ✅

```typescript
// 第 3 行：新增导入
import type { Skill } from './skill';

// 第 19-20 行：新增字段
/** Skill 列表 */
skills: Skill[];
```

- ✅ `Skill` 类型已在 `src/shared/types/skill.ts` 中定义（T1 产物）
- ✅ `Skill` 已通过 `src/shared/types/index.ts` re-export
- ✅ `skills` 字段位置在 `activeConversationId` 之后，符合接口字段声明顺序
- ✅ 字段为必填（非 optional），与设计方案一致

#### 2. `src/shared/storage/config-store.ts` ✅

```typescript
// 第 28 行：新增默认值
skills: [],
```

- ✅ 位置在 `preferences` 之后、`DEFAULTS` 闭合 `};` 之前
- ✅ 空数组 `[]` 作为默认值，`structuredClone` 可正常处理
- ✅ `get('skills')` 未存储时返回 `DEFAULTS['skills']`（即 `[]`）
- ✅ `getAll()` 展开 DEFAULTS 后合并存储值，正确包含 `skills`

#### 3. `src/shared/types/__tests__/storage.test.ts` ✅

- ✅ `StorageSchema` 测试字面量（第 28 行）新增 `skills: []`
- ✅ `IConfigStore.getAll()` mock（第 140 行）新增 `skills: []`
- ✅ 同时修复了预存的 `reasoningEffort` 缺失和 `maxToolRounds` 缩进问题
- ✅ 21 个测试全部通过

---

### 测试建议

| 优先级 | 建议 | 说明 |
|--------|------|------|
| Low | ConfigStore 测试中显式验证 `get('skills')` 返回 `[]` | 当前仅靠 `getDefaults()` 隐式覆盖，建议新增显式断言 |
| Low | ConfigStore 测试中验证 `getAll().skills` 存在 | 确保 `getAll()` 合并逻辑正确包含 `skills` |

**现有测试覆盖分析：**
- `ConfigStore` 单测（11 个）：通过，`getDefaults()` 测试隐式覆盖 `skills`
- `Storage types` 单测（10 个）：通过，`StorageSchema` 和 `IConfigStore` 测试字面量包含 `skills`

---

### 审查结论

- [x] **通过 — 无 Critical/High 问题**

本次变更是一个最小改动：在 `StorageSchema` 接口中新增 `skills: Skill[]` 字段，并在 `ConfigStore.DEFAULTS` 中设默认值 `[]`。改动精准、无越界、测试通过、验收标准全部满足。

建议 approve + squash merge。

---

*报告生成于 2026-06-23 11:29 CST*
