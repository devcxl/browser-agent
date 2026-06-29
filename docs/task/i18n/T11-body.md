## 任务信息

- **Task ID:** T11
- **Slug:** i18n-info-panels
- **类型:** frontend
- **Batch:** 3

## 依赖

depends-on: #108, #107

## 描述

BrowserStatePanel / TokenPanel / SkillPanel 国际化：
- BrowserStatePanel：标题、加载/错误/空状态、窗口/标签数量格式
- TokenPanel：标题、输入/输出/总计、数字格式化
- SkillPanel：全部管理文本、数量格式化

## 验收标准

- [ ] BrowserStatePanel 标题、状态文本可切换
- [ ] 窗口/标签数量格式随 locale 变化
- [ ] TokenPanel 所有标签可切换，数字格式化正确
- [ ] SkillPanel 文本可切换

## 技术方案参考

- docs/design/i18n-国际化支持.md
- docs/design/i18n-国际化支持-task-graph.md
