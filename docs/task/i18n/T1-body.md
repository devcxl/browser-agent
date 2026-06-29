## 任务信息

- **Task ID:** T1
- **Slug:** create-i18n-types-and-locales
- **类型:** frontend
- **Batch:** 1

## 依赖

无

## 描述

1. 创建 `i18n/types.ts`：定义 `Locale`（`'zh-CN' | 'en'`）、`MessageSchema`、`I18nContextValue`
2. 创建 `locales/zh-CN.json`：提取所有组件的硬编码中文文本
3. 创建 `locales/en.json`：英译所有中文文本

Key 命名规则：点分隔路径，如 `sidebar.status.running`；模板变量使用 `{{varName}}` 语法

## 验收标准

- [ ] `i18n/types.ts` 通过 TypeScript 编译
- [ ] `zh-CN.json` 覆盖所有组件的现有硬编码文本
- [ ] `en.json` 所有 key 与 `zh-CN.json` 完全对应
- [ ] 两个 JSON 文件不包含任何硬编码中文（除音频格式缩写外）
- [ ] 模板变量 key 在两个语言包中一致

## 技术方案参考

- docs/design/i18n-国际化支持.md
- docs/design/i18n-国际化支持-task-graph.md
