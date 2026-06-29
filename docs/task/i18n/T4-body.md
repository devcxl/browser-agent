## 任务信息

- **Task ID:** T4
- **Slug:** refactor-format-utils
- **类型:** frontend
- **Batch:** 1

## 依赖

无

## 描述

改造 `utils.ts` 的三个格式化函数，增加 `locale` 参数，保持向后兼容：

1. `formatTime(ts, locale?)` — 使用 `toLocaleTimeString(locale, ...)`
2. `formatDateTime(ts, locale?)` — 使用 `toLocaleString(locale, ...)`
3. `formatNum(n, locale?)` — 使用 `n.toLocaleString(locale)`

所有现有调用处无需改动（locale 可选，默认 `'zh-CN'`）。

## 验收标准

- [ ] `formatTime` 支持 locale 参数
- [ ] `formatDateTime` 支持 locale 参数
- [ ] `formatNum` 支持 locale 参数
- [ ] 不传 locale 时行为与改造前完全一致
- [ ] 所有现有调用处无需修改即可通过编译

## 技术方案参考

- docs/design/i18n-国际化支持.md
- docs/design/i18n-国际化支持-task-graph.md
