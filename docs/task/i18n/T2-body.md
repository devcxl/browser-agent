## 任务信息

- **Task ID:** T2
- **Slug:** implement-language-detector
- **类型:** frontend
- **Batch:** 2

## 依赖

depends-on: #106

## 描述

实现首次语言检测 `detectAndSetLanguage()` 函数：
1. 先检查 `ConfigStore.get('preferences').language` 是否已有值
2. 若无，读取 `navigator.language` 进行匹配
3. 匹配逻辑：`'zh'` 或 `'zh-CN'` → `'zh-CN'`；`'en'` → `'en'`；其他 → 默认 `'zh-CN'`
4. 写入 `ConfigStore.set('preferences', { ..., language })`
5. 在 `main.tsx` 渲染前同步调用

## 验收标准

- [ ] 首次启动（无偏好记录）时自动检测浏览器语言
- [ ] 浏览器语言为 `zh-CN` / `zh` 时设置为 `'zh-CN'`
- [ ] 浏览器语言为 `en` / `en-US` 时设置为 `'en'`
- [ ] 其他语言默认回退到 `'zh-CN'`
- [ ] 已有偏好时跳过检测
- [ ] 检测结果正确持久化到 ConfigStore

## 技术方案参考

- docs/design/i18n-国际化支持.md
- docs/design/i18n-国际化支持-task-graph.md
