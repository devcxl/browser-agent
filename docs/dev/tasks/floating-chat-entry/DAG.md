# 浮动聊天入口 — DAG 任务依赖图

```mermaid
graph TD
  T1["Task 1: 存储扩展\n(storage-extend-floating-settings)"] --> T3["Task 3: Widget DOM 挂载\n(widget-mounting-and-panel)"]
  T1 --> T5["Task 5: 设置页区块\n(settings-floating-section)"]
  T2["Task 2: 纯逻辑\n(drag-blacklist-pure-logic)"] --> T3
  T3 --> T6["Task 6: 集成 + e2e\n(manifest-e2e-integration)"]
  T4["Task 4: SidePanel 内嵌模式\n(sidepanel-embedded-mode)"] --> T6
  T5 --> T6
```

## 批次执行计划

| Batch | 任务 | 可并行 | 类型 |
|-------|------|--------|------|
| 0 | T1, T2, T4 | ✅ | backend ×2, frontend |
| 1 | T3, T5 | ✅ (两者均依赖 T1 完成) | backend, frontend |
| 2 | T6 | 串行（依赖 T3+T4+T5 全部完成） | 集成 |

## 任务列表

| # | Slug | 标签 | 依赖 |
|---|------|------|------|
| 1 | storage-extend-floating-settings | backend | — |
| 2 | drag-blacklist-pure-logic | backend | — |
| 3 | widget-mounting-and-panel | backend | 1, 2 |
| 4 | sidepanel-embedded-mode | frontend | — |
| 5 | settings-floating-section | frontend | 1 |
| 6 | manifest-e2e-integration | backend, frontend | 3, 4, 5 |
```json
