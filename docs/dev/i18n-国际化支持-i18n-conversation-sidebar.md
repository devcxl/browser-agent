# 开发文档: T6 - ConversationSidebar 国际化

**Project:** i18n-国际化支持
**Task ID:** T6
**Slug:** i18n-conversation-sidebar
**Issue:** #112
**类型:** frontend
**Batch:** 3
**依赖:** T3 (I18nProvider + useI18n), T4 (格式化函数 formatDateTime/formatNum 增加 locale 参数)

## 1. 目标

将 `ConversationSidebar` 组件中的全部硬编码中文/英文文本替换为 `t()` 调用，并将 `formatDateTime`、本地 `formatNum` 调用改为传入当前 `locale`。

## 2. 前置条件

- [ ] T3 完成 — `useI18n` hook 可用，返回 `{ t, locale }`
- [ ] T4 完成 — `formatDateTime(ts, locale)` 和 `formatNum(n, locale)` 签名已更新
- [ ] T1 完成 — 语言包中 `sidebar.*` 全部 key 已定义

## 3. 实现步骤

### 3.1 增加导入和 hook 调用

**文件：** `src/entrypoints/sidepanel/components/ConversationSidebar.tsx`

在文件顶部增加：
```typescript
import { useI18n } from '../i18n/useI18n';
```

在 `ConversationSidebar` 函数体顶部增加：
```typescript
const { t, locale } = useI18n();
```

### 3.2 删除本地 `formatNum` 和 `statusLabels`，改用 i18n

**删除：**
- 第 20-22 行的本地 `formatNum` 函数（改用 `utils.ts` 中已改造的版本）
- 第 31-36 行的 `statusLabels` 硬编码对象

**保留：**
- `statusColors` 对象（纯 CSS 类名，不含文本，无需国际化）

### 3.3 替换清单

按行号逐一替换：

| 行号 | 原文本 | 替换后 | 使用的 Key | 备注 |
|------|--------|--------|-----------|------|
| 75 | `title="展开侧栏"` | `title={t('sidebar.expand')}` | `sidebar.expand` | |
| 87 | `title="设置"` | `title={t('sidebar.settings')}` | `sidebar.settings` | |
| 105 | `<span>会话</span>` | `<span>{t('sidebar.title')}</span>` | `sidebar.title` | |
| 113 | `+ 新建` | `+ {t('sidebar.newChat')}` | `sidebar.newChat` | |
| 119 | `title="收起侧栏"` | `title={t('sidebar.collapse')}` | `sidebar.collapse` | |
| 132 | `加载中...` | `{t('common.loading')}` | `common.loading` | |
| 143 | `暂无会话` | `{t('sidebar.noConversations')}` | `sidebar.noConversations` | |
| 180 | `statusLabels[conv.status]` | `t('sidebar.status.' + conv.status)` | `sidebar.status.*` | 状态标签 (见 3.4) |
| 191 | `重命名` | `{t('sidebar.rename')}` | `sidebar.rename` | |
| 201 | `删除` | `{t('sidebar.delete')}` | `sidebar.delete` | |
| 215-216 | 硬编码 Token 统计文本 | 模板变量形式 (见 3.5) | `sidebar.input`/`sidebar.output`/`sidebar.total` | |
| 228 | `设置` | `{t('sidebar.settings')}` | `sidebar.settings` | 底部设置按钮 |
| 179 | `formatDateTime(conv.updatedAt)` | `formatDateTime(conv.updatedAt, locale)` | - | |

### 3.4 状态标签动态 Key

将第 180 行的 `statusLabels` 查找改为：

```tsx
{conv.status && conv.status !== 'idle'
  ? t(`sidebar.status.${conv.status}`)
  : formatDateTime(conv.updatedAt, locale)
}
```

对应语言包 key：
- `sidebar.status.idle` → 就绪 / Ready（实际 idle 状态不显示文本，仅显示时间）
- `sidebar.status.running` → 运行中... / Running...
- `sidebar.status.streaming` → 输出中... / Streaming...
- `sidebar.status.waitingConfirmation` → 等待确认 / Waiting confirmation

### 3.5 Token 统计文本

将第 215-216 行的硬编码改为模板变量：

```tsx
{t('sidebar.input')} {formatNum(tokenUsage.prompt, locale)} / {t('sidebar.output')} {formatNum(tokenUsage.completion, locale)} / {t('sidebar.total')} {formatNum(tokenUsage.prompt + tokenUsage.completion, locale)}
```

或为了可读性拆分为：
```tsx
{t('sidebar.input')} {formatNum(tokenUsage.prompt, locale)} / {t('sidebar.output')} {formatNum(tokenUsage.completion, locale)} / {t('sidebar.total')} {formatNum(tokenUsage.prompt + tokenUsage.completion, locale)}
```

### 3.6 formatDateTime 增加 locale 参数

第 179 行：
```tsx
// 改前
formatDateTime(conv.updatedAt)
// 改后
formatDateTime(conv.updatedAt, locale)
```

### 3.7 最终代码差异概览

**删除：**
- 本地 `formatNum` 函数（第 20-22 行）
- `statusLabels` 对象（第 31-36 行）

**新增：**
- `import { useI18n } from '../i18n/useI18n';`
- `const { t, locale } = useI18n();`

**修改：**
- 约 12 处文本替换
- `formatDateTime` 调用增加 `locale` 参数
- Token 统计部分增加 `formatNum(..., locale)` 调用

## 4. 接口/契约

### 4.1 依赖的格式化函数签名

```typescript
// utils.ts (T4 改造后)
export function formatDateTime(ts: number, locale: string): string;
export function formatNum(n: number, locale: string): string;  // 需确认 T4 是否包含此函数；若不存在则沿用本地函数并增加 locale 参数
```

**重要：** 如果 T4 方案中 `formatNum` 不是 `utils.ts` 的导出函数（当前代码中 `ConversationSidebar` 有自己的本地 `formatNum`），则有两种选择：
1. T4 一并改造 `utils.ts`，导出 `formatNum(n, locale)`
2. 本任务就地改造本地 `formatNum` 函数增加 `locale` 参数

推荐方案 1，避免多处重复定义。

### 4.2 使用的语言包 Key

| Key | 中文 | 英文 |
|-----|------|------|
| `sidebar.title` | 会话 | Conversations |
| `sidebar.newChat` | 新建 | New |
| `sidebar.collapse` | 收起侧栏 | Collapse sidebar |
| `sidebar.expand` | 展开侧栏 | Expand sidebar |
| `sidebar.settings` | 设置 | Settings |
| `sidebar.noConversations` | 暂无会话 | No conversations |
| `sidebar.rename` | 重命名 | Rename |
| `sidebar.delete` | 删除 | Delete |
| `sidebar.input` | 输入 | Input |
| `sidebar.output` | 输出 | Output |
| `sidebar.total` | 总计 | Total |
| `sidebar.status.running` | 运行中... | Running... |
| `sidebar.status.streaming` | 输出中... | Streaming... |
| `sidebar.status.waitingConfirmation` | 等待确认 | Waiting confirmation |
| `common.loading` | 加载中... | Loading... |

## 5. 测试指引

### 5.1 现有测试

当前存在 `src/entrypoints/sidepanel/__tests__/ConversationSidebar.test.tsx`。

需更新测试：
- Mock `useI18n` 返回 `{ t: (key) => key, locale: 'zh-CN' }`
- 验证所有文本使用 `t()` 调用而非硬编码字符串
- 验证 `formatDateTime` 调用时传入了 `locale` 参数

### 5.2 手动验证

1. 中文环境：侧栏显示"会话"、"新建"、状态为"运行中..."
2. 英文环境：侧栏显示"Conversations"、"New"、状态为"Running..."
3. 日期格式：`formatDateTime(ts, 'zh-CN')` → `6月29日 14:30`，`formatDateTime(ts, 'en')` → `Jun 29, 14:30`
4. Token 数字格式：`formatNum(1234, 'zh-CN')` → `1,234`，`formatNum(1234, 'en')` → `1,234`

## 6. 验收标准

- [ ] 侧栏标题"会话" / "Conversations" 可切换
- [ ] "新建"按钮文本可切换
- [ ] 收起/展开按钮 title 可切换
- [ ] 状态标签（运行中.../输出中.../等待确认）可切换
- [ ] "暂无会话"空状态文本可切换
- [ ] 重命名/删除按钮文本可切换
- [ ] Token 统计（输入/输出/总计）标签可切换
- [ ] 日期格式化跟随当前语言
- [ ] 数字格式化跟随当前语言
- [ ] 底部"设置"按钮文本可切换
- [ ] `npx tsc --noEmit` 零错误
- [ ] 现有测试全部通过

## 7. 注意事项

### 7.1 删除 `statusLabels` 对象

`statusLabels` 是纯硬编码中文文本映射，删除后由语言包替代。`statusColors` 保留（CSS 类名，不含用户可见文本）。

### 7.2 `formatNum` 归属

需与 T4 的实施者确认 `formatNum` 是否已加入 `utils.ts`。如果 T4 未包含，则本任务就地改造本地函数：
```typescript
function formatNum(n: number, locale: string): string {
  return n.toLocaleString(locale);
}
```
默认值保持 `'zh-CN'` 向后兼容。

### 7.3 重命名交互逻辑不变

`editingId`、`editTitle`、`startRename`、`confirmRename` 逻辑完全保持不变，仅按钮文本被替换。

### 7.4 错误消息

sidebar 的 `error` 属性来自 `useChat()`，是运行时错误文本（如数据库读取错误），不通过 i18n 翻译，直接显示原文。
