# 开发文档: T1 - 创建 Skill 类型定义

**Project:** Agent Skill System
**Task ID:** T1
**Slug:** define-skill-types
**Issue:** #74
**类型:** backend
**Batch:** 1
**依赖:** 无

## 1. 目标

创建 `Skill` 和 `ISkillStore` 的 TypeScript 类型定义，作为全项目 Skill 系统的类型基础。纯类型文件，零运行时依赖。

## 2. 前置条件

- `src/shared/types/` 目录已存在
- TypeScript strict 模式可用
- 熟悉 `src/shared/types/index.ts` 的 barrel export 模式（`export type { ... } from './xxx'`）

## 3. 实现步骤

### 3.1 创建 skill.ts 类型文件

**文件: `src/shared/types/skill.ts`（新增）**

关键内容：
- 定义 `Skill` 接口：id、name、description、prompt、enabled、createdAt、updatedAt
- 定义 `ISkillStore` 接口：CRUD + 查询 + onChange 监听
- 所有方法返回 Promise，onChange 返回取消监听函数

```typescript
// ==================== Skill 数据模型 ====================

export interface Skill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// ==================== Skill Store 接口 ====================

export interface ISkillStore {
  /** 获取所有 Skill */
  getAll(): Promise<Skill[]>;
  /** 获取已启用的 Skill */
  getEnabled(): Promise<Skill[]>;
  /** 批量保存（覆盖式） */
  save(skills: Skill[]): Promise<void>;
  /** 添加单个 Skill */
  add(skill: Skill): Promise<void>;
  /** 部分更新 Skill */
  update(id: string, patch: Partial<Skill>): Promise<void>;
  /** 删除 Skill */
  remove(id: string): Promise<void>;
  /** 监听 Skill 列表变更，返回取消监听函数 */
  onChange(callback: (skills: Skill[]) => void): () => void;
}
```

### 3.2 在 index.ts 中导出

**文件: `src/shared/types/index.ts`（修改）**

在文件末尾 `export { DB_NAME, DB_VERSION } from './storage';` 之前追加以下内容：

```typescript
export type {
  Skill,
  ISkillStore,
} from './skill';
```

具体插入位置：第 113 行（`export { DB_NAME, DB_VERSION } from './storage';`）之前，即紧跟 storage 的 type export 块之后。

修改后的 `index.ts` 末尾（第 112 行起）：

```typescript
export type {
  Skill,
  ISkillStore,
} from './skill';

export { DB_NAME, DB_VERSION } from './storage';
```

## 4. 接口/契约

### 4.1 新增类型

```typescript
export interface Skill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ISkillStore {
  getAll(): Promise<Skill[]>;
  getEnabled(): Promise<Skill[]>;
  save(skills: Skill[]): Promise<void>;
  add(skill: Skill): Promise<void>;
  update(id: string, patch: Partial<Skill>): Promise<void>;
  remove(id: string): Promise<void>;
  onChange(callback: (skills: Skill[]) => void): () => void;
}
```

### 4.2 数据模型变更

无运行时数据变更，纯类型定义。此任务不涉及存储实现。

### 4.3 与现有类型的风格一致性

- 沿用项目既有的分区注释风格（`// ==================== xxx ====================`）
- `ISkillStore` 命名和接口风格对齐 `IConfigStore`（storage.ts）、`IToolRegistry`（tool.ts）
- `onChange` 返回 `() => void` 的模式对齐 `IConfigStore.onChange`
- 时间戳使用 `number`（毫秒），与 `DbConversation.createdAt/updatedAt` 保持一致

## 5. 测试指引

### 5.1 类型验证

```bash
npx tsc --noEmit
```

预期结果：零错误。如有错误，检查：
- `index.ts` 中 export 语法是否正确（`export type { ... } from './skill'`）
- `skill.ts` 中所有类型是否正确 `export`

### 5.2 手动验证

在任意 `.ts` 文件中尝试导入验证：

```typescript
import type { Skill, ISkillStore } from '../shared/types';
```

预期：TypeScript 语言服务无报错，自动补全可用。

## 6. 验收标准

- [ ] `src/shared/types/skill.ts` 文件创建，包含 `Skill` 和 `ISkillStore` 的 `export`
- [ ] `src/shared/types/index.ts` 新增 `Skill` 和 `ISkillStore` 的 `export type` re-export
- [ ] `npx tsc --noEmit` 编译通过

## 7. 注意事项

- 纯类型文件，不可引入任何运行时依赖
- `ISkillStore` 仅定义接口契约，不在此任务实现。后续任务会提供基于 `chrome.storage` 或 IndexedDB 的 `SkillStore` 实现
- 保持与项目现有类型文件（`tool.ts`、`storage.ts`、`llm.ts`）的代码风格一致
- 不要修改除 `src/shared/types/skill.ts` 和 `src/shared/types/index.ts` 之外的任何文件
