## 审查报告 — PR #125: T6 ConversationSidebar 国际化

### 变更概述
- **分支**: `feat/i18n-conversation-sidebar` → `dev`
- **Issue**: #112
- **修改文件数**: 1
  - `src/entrypoints/sidepanel/components/ConversationSidebar.tsx` — 全面国际化
- **风险等级**: 低 — 无 Critical/High 问题

---

### 审查要点逐项分析

#### 1. 硬编码中文文本替换

| 位置 | 原文本 | 替换为 | 验证 |
|------|--------|--------|------|
| title="展开侧栏" | 硬编码 | `t('sidebar.expand')` | ✅ |
| title="设置" | 硬编码 | `t('sidebar.settings')` | ✅ |
| "会话" | 硬编码 | `t('sidebar.title')` | ✅ |
| "+ 新建" | 硬编码 | `t('sidebar.newChat')` | ✅ |
| title="收起侧栏" | 硬编码 | `t('sidebar.collapse')` | ✅ |
| "暂无会话" | 硬编码 | `t('sidebar.noConversations')` | ✅ |
| statusLabels['idle'] = '就绪' | 对象 | `t('sidebar.status.idle')` | ✅ |
| statusLabels['running'] = '运行中...' | 对象 | `t('sidebar.status.running')` | ✅ |
| statusLabels['streaming'] = '输出中...' | 对象 | `t('sidebar.status.streaming')` | ✅ |
| statusLabels['waitingConfirmation'] = '等待确认' | 对象 | `t('sidebar.status.waitingConfirmation')` | ✅ |
| "重命名" | 硬编码 | `t('sidebar.rename')` | ✅ |
| "删除" | 硬编码 | `t('sidebar.delete')` | ✅ |
| "输入" | 硬编码 | `t('sidebar.input')` | ✅ |
| "输出" | 硬编码 | `t('sidebar.output')` | ✅ |
| "总计" | 硬编码 | `t('sidebar.total')` | ✅ |
| "设置" (底部按钮) | 硬编码 | `t('sidebar.settings')` | ✅ |

共计 15 处硬编码中文/文本全部替换。原有 `statusLabels` 对象已删除。

#### 2. i18n key 定义检查

所有 key 均存在于 `MessageSchema` (types.ts) 和两个 JSON 语言包中：

| Key | zh-CN | en |
|-----|-------|----|
| `sidebar.title` | "会话" | "Conversations" |
| `sidebar.newChat` | "+ 新建" | "+ New Chat" |
| `sidebar.collapse` | "收起侧栏" | "Collapse sidebar" |
| `sidebar.expand` | "展开侧栏" | "Expand sidebar" |
| `sidebar.settings` | "设置" | "Settings" |
| `sidebar.noConversations` | "暂无会话" | "No conversations" |
| `sidebar.rename` | "重命名" | "Rename" |
| `sidebar.delete` | "删除" | "Delete" |
| `sidebar.input` | "输入" | "Input" |
| `sidebar.output` | "输出" | "Output" |
| `sidebar.total` | "总计" | "Total" |
| `sidebar.status.idle` | "就绪" | "Idle" |
| `sidebar.status.running` | "运行中..." | "Running..." |
| `sidebar.status.streaming` | "输出中..." | "Streaming..." |
| `sidebar.status.waitingConfirmation` | "等待确认" | "Awaiting confirmation" |

全部 ✅

#### 3. Props / 逻辑 / 样式变更检查

- 无 Props 变更 ✅
- 无样式变更 ✅
- `formatNum` 从本地 `function` 移入 `utils` 导入。`utils.ts` 中 `formatNum(n, locale)` 签名匹配调用方式。✅
- `formatDateTime(conv.updatedAt, locale)` — `utils.ts` 中签名 `formatDateTime(ts, locale)` 已存在。✅
- 动态状态 key `t(\`sidebar.status.${conv.status}\`)` — 当 `conv.status` 为未定义或不在 map 中时，`t()` 返回原始 key 作为 fallback，与原逻辑 `statusLabels[conv.status] ?? conv.status` 行为等价。✅

---

### 发现问题

无 Critical、High、Medium 问题。

---

### 测试建议

建议补充测试验证：
1. `statusLabels` 对象移除后，动态 key 构建 `sidebar.status.${conv.status}` 在各种 status 值下正确渲染
2. `formatDateTime` / `formatNum` 接收 `locale` 参数后在不同语言下正确格式化

---

### 审查结论

- [x] **通过** — 无问题

**备注**: 变更干净。动态 key 构建使用了模板字符串，`t()` 函数内置了 key-not-found → return-key-as-is 的 fallback，无需额外防御。
