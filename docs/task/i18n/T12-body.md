## 任务信息

- **Task ID:** T12
- **Slug:** i18n-voice-input
- **类型:** frontend
- **Batch:** 3

## 依赖

depends-on: #108

## 描述

useVoiceInput hook 错误消息国际化：
- 6 种语音相关错误消息替换为 t() 调用
- 无 STT 模型、麦克风拒绝、无设备、启动失败、Provider 丢失、转写失败

## 验收标准

- [ ] 语音相关的 6 种错误消息均可切换中英文
- [ ] 错误消息通过 t() 从语言包获取
- [ ] 无 Provider 时回退到默认消息

## 技术方案参考

- docs/design/i18n-国际化支持.md
- docs/design/i18n-国际化支持-task-graph.md
