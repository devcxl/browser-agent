## 任务信息

- **Task ID:** T6
- **Slug:** i18n-conversation-sidebar
- **类型:** frontend
- **Batch:** 3

## 依赖

depends-on: #108, #107

## 描述

ConversationSidebar 全部文本国际化：
- 标题、按钮、折叠/展开、设置按钮、空状态
- 对话状态标签（就绪/运行中/输出中/等待确认）
- Token 统计标签（输入/输出/总计）
- 重命名/删除按钮
- formatNum/formatDateTime 传入 locale

## 验收标准

- [ ] 侧栏标题可切换中/英文
- [ ] 新对话、折叠、设置按钮文本可切换
- [ ] 对话状态标签可切换
- [ ] Token 统计数字随 locale 格式化
- [ ] 对话时间格式随 locale 变化
- [ ] 空状态文本可切换

## 技术方案参考

- docs/design/i18n-国际化支持.md
- docs/design/i18n-国际化支持-task-graph.md
