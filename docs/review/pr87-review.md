## 审查报告 — PR #87（feat/implement-skill-store → dev）

### 变更概述
- 修改文件数：3
- 新增文件：`src/shared/storage/skill-store.ts`（108 行）、`src/shared/storage/__tests__/skill-store.test.ts`（332 行）
- 修改文件：`src/shared/storage/index.ts`（+1 行，新增 SkillStore 导出）
- 风险等级：**低**

### 对应 Issue

Issue #77 — T3: 实现 SkillStore 持久化层

### 验收标准逐项核对

| 验收标准 | 状态 | 说明 |
|---|---|---|
| `getInstance()` 返回同一实例（单例验证） | ✅ | 测试通过 |
| `getAll()` 无数据时返回 `[]` | ✅ | 测试通过 |
| `add()` 后 `getAll()` 包含新 skill | ✅ | 测试通过 |
| `update(id, patch)` 部分更新成功，`updatedAt` 自动更新 | ✅ | 测试通过，且 `createdAt` 未被修改 |
| `remove(id)` 后 skill 不再出现 | ✅ | 测试通过 |
| `getEnabled()` 只返回 `enabled: true` | ✅ | 测试通过 |
| `onChange()` 触发回调 | ✅ | 测试通过 |
| 返回的取消函数能正确取消监听 | ✅ | 测试通过 |
| 单元测试覆盖全部 7 个方法 | ✅ | 16 个用例覆盖所有方法 + 集成场景 + 边界条件 |

### 测试结果

```
 ✓ src/shared/storage/__tests__/skill-store.test.ts (16 tests) 11ms
 Test Files  1 passed (1)
```

全量回归测试：683/683 通过，无回归。

### 发现问题

#### [LOW] `onChange` 回调签名差异

- 文件：`src/shared/storage/skill-store.ts:100`
- 问题：`onChange` 回调只接收 `Skill[]`（变更后的值），而 `ConfigStore.onChange` 接收 `Partial<StorageSchema>`（含 key 的 change 对象）。两者语义不一致但属于设计层面差异——`ConfigStore` 是多 key 模式所以需要区分 key，`SkillStore` 只有单一 key 所以简化合理。
- 结论：**可接受**，单 key 场景下简化设计是合理的。

#### [LOW] `update()` 的 `patch` 未做空值校验

- 文件：`src/shared/storage/skill-store.ts:82`
- 问题：如果调用 `update('id', {})` 传入空 patch，仍然会执行 `writeAll`，产生无意义的 `updatedAt` 更新和 storage 写入。虽然没有功能错误，但会产生不必要的 I/O。
- 修复建议（可选）：
  ```ts
  async update(id: string, patch: Partial<Skill>): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    // ... 其余逻辑
  }
  ```
- 结论：**可接受**，边界条件影响极小，当前实现不会导致数据错误。

### 代码质量

#### 实现（`skill-store.ts`）— 通过

- **单例模式**：与 `ConfigStore` 一致，`getInstance()` + `resetInstance()`。
- **读写分离**：`readAll()` / `writeAll()` 作为内部辅助，避免重复代码。
- **先读后写**：所有写操作先 `readAll` 再 `writeAll`，保证数组一致性。
- **静默忽略不存在的 id**：`update()` 和 `remove()` 在找不到目标时直接 `return`，不抛出错误。
- **自动时间戳**：`update()` 自动更新 `updatedAt = Date.now()`。
- **`onChange` 过滤**：只对 `skills` key 的变更触发回调，忽略其他 key。
- **错误处理**：无 try/catch，但 chrome.storage API 本身不会 throw（返回 rejected promise）。调用方自行处理。与 `ConfigStore` 风格一致。
- **行数**：108 行，控制在合理范围。

#### 测试（`skill-store.test.ts`）— 通过

- **16 个测试用例**覆盖：
  - 单例：2 个（同一实例 + reset 后新实例）
  - `getAll()`：2 个（空 + 有数据）
  - `getEnabled()`：2 个（过滤 enabled + 全 disabled 返回空）
  - `save()`：1 个（验证 set 调用参数）
  - `add()`：1 个（验证追加后 set 参数）
  - `update()`：2 个（部分更新 + 不存在的 id 静默忽略）
  - `remove()`：2 个（删除 + 不存在的 id 静默忽略）
  - `onChange()`：3 个（触发 + 非 skills key 不触发 + 取消监听）
  - 集成场景：1 个（add + update + remove + getEnabled 完整流程）
- **Mock 模式**：与 `config-store.test.ts` 共享相同的 `mockBrowserStorage()` 工具函数（代码有重复，但属测试文件的常规做法）。
- **边界条件**：覆盖了空数据、全 disabled、不存在 id、非 skills key 变更等。

### 与方案文档对照

- 遵循 `ConfigStore` 相同的单例模式 ✅
- 以 `skills` 为 key 存储 `Skill[]` ✅
- 7 个方法全部实现 ✅
- `onChange()` 返回取消函数 ✅

### 未修改范围外的文件

仅修改 Issue #77 规定的 3 个文件，无越界修改。

### 审查结论

- [x] **通过** — 无 Critical/High 问题

代码质量良好，与 `ConfigStore` 风格一致，测试覆盖全面（16 个用例覆盖 7 个方法 + 边界条件 + 集成场景），全量回归 683/683 通过。

建议：可直接合并到 dev。
