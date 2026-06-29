## 任务信息

- **Task ID:** T13
- **Slug:** i18n-markdown-viewer
- **类型:** frontend
- **Batch:** 2

## 依赖

depends-on: #106

## 描述

markdown-viewer 是独立 HTML 页面（非 React 树），通过函数式方式获取翻译：
1. 从 `chrome.storage.local` 读取 `preferences.language`
2. 动态 `import()` 对应语言包 JSON
3. 替换硬编码文本：无效链接、内容过期、预览标题

## 验收标准

- [ ] markdown-viewer 根据 preferences 中的 language 选择语言包
- [ ] 无效链接、内容过期、预览标题文本可随语言切换
- [ ] 无 preferences 记录时默认显示中文
- [ ] 语言包通过动态 import 加载

## 技术方案参考

- docs/design/i18n-国际化支持.md
- docs/design/i18n-国际化支持-task-graph.md
