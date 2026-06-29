## 任务信息

- **Task ID:** T10
- **Slug:** i18n-confirm-and-error
- **类型:** frontend
- **Batch:** 3

## 依赖

depends-on: #108

## 描述

ConfirmDialog + ErrorBoundary 国际化：
- 确认对话框标题、字段标签、按钮
- 错误边界渲染错误消息
- 动态内容（工具名等）通过模板变量传入

## 验收标准

- [ ] 确认对话框所有静态标签可切换中英文
- [ ] 对话框中动态内容通过模板变量正确渲染
- [ ] 错误边界 fallback UI 文本可切换

## 技术方案参考

- docs/design/i18n-国际化支持.md
- docs/design/i18n-国际化支持-task-graph.md
