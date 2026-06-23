# 开发文档: T2 - 扩展 StorageSchema 添加 skills 字段

**Project:** Agent Skill System
**Task ID:** T2
**Slug:** extend-storage-schema
**Issue:** #76
**类型:** backend
**Batch:** 2
**依赖:** T1 (#74 define-skill-types)

## 1. 目标

在 `StorageSchema` 接口中新增 `skills: Skill[]` 字段，并在 `ConfigStore.DEFAULTS` 中设置默认值 `[]`，使 Skill 数据可通过 `ConfigStore` 读写持久化。

## 2. 前置条件

- T1 已完成：`src/shared/types/skill.ts` 中 `Skill` 类型定义就绪，且已从 `index.ts` re-export
- 熟悉 `StorageSchema` 接口结构（`src/shared/types/storage.ts` 第 7-18 行）
- 了解 `ConfigStore.DEFAULTS` 的结构和 `getDefaults()` 的行为

## 3. 实现步骤

### 3.1 修改 storage.ts — 新增字段声明

**文件: `src/shared/types/storage.ts`（修改）**

两处改动：
1. 文件顶部新增 `Skill` 类型导入（第 1 行附近）
2. `StorageSchema` 接口中新增 `skills` 字段（第 17 行附近，`activeConversationId` 之后）

**修改前（第 1-18 行）:**
```typescript
import type { ProviderConfig } from './llm';
import type { ReasoningEffort } from './llm';

// ==================== chrome.storage.local 存储 Schema ====================

/** chrome.storage.local 中存储的所有数据 */
export interface StorageSchema {
  /** Provider 配置列表 */
  providers: ProviderConfig[];
  /** Agent 设置 */
  agentSettings: AgentSettings;
  /** Expert Mode 设置 */
  expertModeSettings: ExpertModeSettings;
  /** 全局偏好 */
  preferences: UserPreferences;
  /** 最近活跃会话 ID */
  activeConversationId?: string;
}
```

**修改后:**
```typescript
import type { ProviderConfig } from './llm';
import type { ReasoningEffort } from './llm';
import type { Skill } from './skill';

// ==================== chrome.storage.local 存储 Schema ====================

/** chrome.storage.local 中存储的所有数据 */
export interface StorageSchema {
  /** Provider 配置列表 */
  providers: ProviderConfig[];
  /** Agent 设置 */
  agentSettings: AgentSettings;
  /** Expert Mode 设置 */
  expertModeSettings: ExpertModeSettings;
  /** 全局偏好 */
  preferences: UserPreferences;
  /** 最近活跃会话 ID */
  activeConversationId?: string;
  /** Skill 列表 */
  skills: Skill[];
}
```

### 3.2 修改 config-store.ts — 新增默认值

**文件: `src/shared/storage/config-store.ts`（修改）**

在 `DEFAULTS` 对象末尾（第 27 行 `preferences` 闭合 `}` 之后、第 28 行 `};` 之前）新增一行。

**修改前（第 23-28 行）:**
```typescript
  preferences: {
    theme: 'system',
    language: 'zh-CN',
    sidebarExpanded: true,
  },
};
```

**修改后:**
```typescript
  preferences: {
    theme: 'system',
    language: 'zh-CN',
    sidebarExpanded: true,
  },
  skills: [],
};
```

### 3.3 更新 index.ts barrel export

**文件: `src/shared/types/index.ts`（修改）**

在 `StorageSchema` 的 re-export 块中新增 `Skill` 类型（如果 T1 尚未在此处导出 `Skill`）。检查第 103-113 行：

T1 完成后的 index.ts 应已有：
```typescript
export type {
  Skill,
  ISkillStore,
} from './skill';
```

如果 T1 尚未执行，则本任务需同时完成此导出（否则 `storage.ts` 中的 `import type { Skill } from './skill'` 无法通过编译）。

**修改前（第 103-113 行）:**
```typescript
export type {
  StorageSchema,
  AgentSettings,
  ExpertModeSettings,
  UserPreferences,
  DbConversation,
  DbMessage,
  DbToolCallLog,
  DbSnapshot,
  IConfigStore,
} from './storage';

export { DB_NAME, DB_VERSION } from './storage';
```

**修改后（如 T1 未完成，需追加 Skill 导出）:**
```typescript
export type {
  StorageSchema,
  AgentSettings,
  ExpertModeSettings,
  UserPreferences,
  DbConversation,
  DbMessage,
  DbToolCallLog,
  DbSnapshot,
  IConfigStore,
} from './storage';

export type {
  Skill,
  ISkillStore,
} from './skill';

export { DB_NAME, DB_VERSION } from './storage';
```

> **注意:** 如果 T1 已正确完成，`index.ts` 中应已有 `Skill` 的 re-export，本任务只需验证即可，无需重复添加。

## 4. 接口/契约

### 4.1 StorageSchema 变更

```typescript
export interface StorageSchema {
  providers: ProviderConfig[];
  agentSettings: AgentSettings;
  expertModeSettings: ExpertModeSettings;
  preferences: UserPreferences;
  activeConversationId?: string;
  skills: Skill[];           // ← 新增
}
```

### 4.2 DEFAULTS 变更

```typescript
const DEFAULTS: StorageSchema = {
  providers: [],
  agentSettings: { /* ... */ },
  expertModeSettings: { /* ... */ },
  preferences: { /* ... */ },
  skills: [],                // ← 新增
};
```

### 4.3 对现有接口的影响

| 接口方法 | 影响 |
|---------|------|
| `ConfigStore.get<'skills'>()` | 返回 `Skill[]`，未存储时返回默认值 `[]` |
| `ConfigStore.set('skills', value)` | 写入 chrome.storage.local |
| `ConfigStore.getAll()` | 返回对象中包含 `skills` 字段 |
| `ConfigStore.patch({ skills: [...] })` | 部分更新 skills |
| `ConfigStore.getDefaults()` | 返回对象中包含 `skills: []` |
| `ConfigStore.onChange()` | 监听器可收到 `skills` 变更事件 |

### 4.4 类型约束

- `skills` 为**必填字段**（非 optional），所有 `StorageSchema` 类型变量必须包含此字段
- 此设计确保 `getDefaults()` 和 `getAll()` 总是返回包含 `skills` 的完整对象
- 如果未来需要在 chrome.storage.local 中单独存储 skills，可在 `DEFAULTS` 中先设 `[]`，后续 T3（SkillStore 实现）负责实际读写

## 5. 测试指引

### 5.1 运行现有单测

```bash
npx vitest run src/shared/storage/__tests__/config-store.test.ts
```

预期结果：全部 11 个测试通过。

**关键验证点：**
- 测试 #3（get 不存在返回默认值）：`store.get('skills')` 将返回 `[]`
- 测试 #10（getDefaults 返回深拷贝）：`defaults.skills` 应为 `[]`，且修改不影响后续调用

### 5.2 类型检查

```bash
npx tsc --noEmit
```

预期结果：零错误。如出现 `Cannot find module './skill'` 或 `'Skill' is not exported`，确认 T1 已正确完成。

### 5.3 手动验证

在浏览器 DevTools Console 中验证：

```javascript
// 确认 skills 字段存在且默认为空数组
const store = ConfigStore.getInstance();
const all = await store.getAll();
console.log(all.skills);  // []

// 确认可写入
await store.set('skills', [{ id: 'test', name: 'test', /* ... */ }]);
const result = await store.get('skills');
console.log(result);  // [{ id: 'test', ... }]
```

## 6. 验收标准

- [ ] `StorageSchema` 包含 `skills: Skill[]` 字段
- [ ] `ConfigStore.DEFAULTS.skills` 为 `[]`
- [ ] 现有 `ConfigStore` 单测仍然通过（`npx vitest run src/shared/storage/__tests__/config-store.test.ts`）
- [ ] `npx tsc --noEmit` 编译通过

## 7. 注意事项

1. **T1 依赖**：本任务依赖 T1 创建的 `Skill` 类型。如果 T1 未完成，`storage.ts` 中 `import type { Skill } from './skill'` 将报错。务必先完成 T1 或同步完成。

2. **最小改动原则**：本任务仅在 2 个文件中各修改 1-2 行。不要修改无关代码、注释或格式。

3. **DEFAULTS 位置**：`skills: []` 放在 `preferences` 之后、`DEFAULTS` 闭合 `};` 之前。保持对象属性按 `StorageSchema` 接口字段声明顺序排列。

4. **`structuredClone` 兼容性**：`getDefaults()` 使用 `structuredClone(DEFAULTS)` 做深拷贝。新增的 `skills: []` 为空数组，`structuredClone` 能正常处理，不会引入兼容性问题。

5. **chrome.storage.local 容量**：`skills` 数组存储在 chrome.storage.local 中，需注意单个 key 上限（约 8KB-10KB 安全值）。后续 T3 实现 SkillStore 时需考虑大批量 Skill 的存储策略。

6. **不要修改 index.ts 的 storage re-export 块**：`StorageSchema` 等类型已通过 `export type { ... } from './storage'` 导出。`skills` 字段是 `StorageSchema` 的一部分，无需单独在 index.ts 中处理。仅当 T1 未完成时才需追加 `Skill` 的 re-export。
