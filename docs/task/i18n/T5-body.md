## 任务信息

- **Task ID:** T5
- **Slug:** integrate-i18n-into-app-entry
- **类型:** frontend
- **Batch:** 3

## 依赖

depends-on: #108, #107

## 描述

1. **main.tsx**: 渲染前调用 `detectAndSetLanguage()`（来自 T2）
2. **App.tsx**: 用 `<I18nProvider>` 包裹组件树，header 标题替换为 `t()` 调用

## 验收标准

- [ ] main.tsx 在渲染前同步执行语言检测
- [ ] App.tsx 根节点被 I18nProvider 包裹
- [ ] App header 标题跟随语言切换
- [ ] 加载中/失败消息可切换中英文

## 技术方案参考

- docs/design/i18n-国际化支持.md
- docs/design/i18n-国际化支持-task-graph.md
