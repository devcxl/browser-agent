## 任务信息

- **Task ID:** T9
- **Slug:** i18n-settings-panel
- **类型:** frontend
- **Batch:** 3

## 依赖

depends-on: #108

## 描述

1. **全设置面板文本国际化** - 所有 Tab、表单标签、placeholder、按钮文本
2. **新增语言选择器** - 设置面板中添加语言下拉框（zh-CN/en）

涉及文本量最大，包括 Provider/Agent/Expert/Skills 四个 Tab 的全部静态文本，
以及音频格式选项标签、推理力度选项等。

## 验收标准

- [ ] 所有设置面板表单标签、placeholder、按钮文本可切换
- [ ] 标签页名称可切换
- [ ] 语言选择器渲染正确，当前语言高亮
- [ ] 切换语言下拉框后设置面板即时更新
- [ ] Agent 推理力度选项标签可切换
- [ ] Skills 面板同步完成/失败消息可切换
- [ ] 语言选择器不影响其他配置项的保存/读取

## 技术方案参考

- docs/design/i18n-国际化支持.md
- docs/design/i18n-国际化支持-task-graph.md
