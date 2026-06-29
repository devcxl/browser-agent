## 任务信息

- **Task ID:** T3
- **Slug:** implement-i18n-provider-and-hook
- **类型:** frontend
- **Batch:** 2

## 依赖

depends-on: #106

## 描述

实现核心 i18n 基础设施：
1. **I18nProvider**: React Context Provider，从 ConfigStore 读取语言，静态 import 语言包，提供 `{ locale, t, setLanguage }`
2. **useI18n**: Hook 获取 context 值
3. **t(key, vars?)**: 点分隔路径解析 + `{{varName}}` 模板变量替换

关键实现细节：
- `t()` 路径不存在时 `console.warn` 并返回 key 本身
- `setLanguage()` 更新 ConfigStore 并切换语言包
- 使用 `useEffect` 监听 ConfigStore.onChange 实现跨标签页同步

## 验收标准

- [ ] `I18nProvider` 正确包裹子组件并提供 context
- [ ] `t()` 支持点分隔路径解析（如 `t('sidebar.status.running')`）
- [ ] `t()` 支持模板变量替换（如 `t('token.total', { total: 100 })`）
- [ ] `t()` key 不存在时打印 warning 并返回 key 字符串（不崩溃）
- [ ] `setLanguage('en')` 更新 ConfigStore 并触发子树重渲染
- [ ] ConfigStore.onChange 触发语言自动更新（跨标签页同步）
- [ ] `useI18n()` 在 Provider 外调用时抛出明确错误
- [ ] 语言包通过静态 import 加载，无运行时 fetch 请求

## 技术方案参考

- docs/design/i18n-国际化支持.md
- docs/design/i18n-国际化支持-task-graph.md
