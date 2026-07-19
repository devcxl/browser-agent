---
name: "storage-extend-floating-settings"
depends_on: []
labels: ["backend"]
worktree_root: ".worktree/storage-extend-floating-settings/"
---

## 目标

扩展 `StorageSchema` 和 `ConfigStore`，新增 `floatingButtonSettings` 存储键。

## 实现要点

1. 在 `src/shared/types/storage.ts` 中新增 `FloatingButtonSettings` 类型：
   ```ts
   export interface FloatingButtonSettings {
     enabled: boolean;
     position: { side: 'left' | 'right'; top: number } | null;
     blacklist: string[];
   }
   ```
2. 在 `StorageSchema` 接口中新增 `floatingButtonSettings: FloatingButtonSettings`。
3. 在 `src/shared/storage/config-store.ts` 中为 `floatingButtonSettings` 提供默认值：
   `{ enabled: true, position: null, blacklist: [] }`
   - 读取时沿用现有默认值合并模式。
4. 更新 `src/shared/types/index.ts` 和 `src/shared/storage/index.ts` 导出（如需要）。
5. 确认无迁移需求（新增键，不影响现有数据）。

## 验收标准

- [ ] `FloatingButtonSettings` 类型正确导出，其他模块可引用
- [ ] `ConfigStore.get('floatingButtonSettings')` 在无存储时返回默认值
- [ ] `ConfigStore.set('floatingButtonSettings', {...})` 可正常写入
- [ ] 单测覆盖默认值合并和读写

## Worktree
- 路径: `.worktree/storage-extend-floating-settings/`
- 分支: `feat/storage-extend-floating-settings`
```json
