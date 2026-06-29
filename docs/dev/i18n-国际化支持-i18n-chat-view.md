# 开发文档: T7 - ChatView/MessageBubble/ToolCallCard 国际化

**Project:** i18n-国际化支持
**Task ID:** T7
**Slug:** i18n-chat-view
**Issue:** #113
**类型:** frontend
**Batch:** 3
**依赖:** T3 (I18nProvider + useI18n)

## 1. 目标

将 `ChatView`、`MessageBubble`、`ToolCallCard` 三个组件中的硬编码文本（思考过程、参数/结果标签、空状态提示、思考中动画文本等）替换为 `t()` 调用。

## 2. 前置条件

- [ ] T3 完成 — `useI18n` hook 可用
- [ ] T1 完成 — 语言包中 `chat.*` 全部 key 已定义

## 3. 实现步骤

### 3.1 ChatView.tsx — 空状态提示

**文件：** `src/entrypoints/sidepanel/components/ChatView.tsx`

#### 3.1.1 增加导入和 hook 调用

```typescript
import { useI18n } from '../i18n/useI18n';
```

在 `ChatView` 函数体顶部：
```typescript
const { t } = useI18n();
```

#### 3.1.2 替换空状态提示

第 64 行：
```tsx
// 改前
开始对话，发送消息给 Browser Agent
// 改后
{t('chat.emptyState')}
```

**注意：** 技术方案的语言包 Schema 中没有 `chat.emptyState` 这个 key。需要在 T1 的语言包中新增，或使用现有 key。建议新增 `chat.emptyState`：
- 中文：`开始对话，发送消息给 Browser Agent`
- 英文：`Start a conversation, send a message to Browser Agent`

### 3.2 MessageBubble.tsx — 思考过程相关文本

**文件：** `src/entrypoints/sidepanel/components/MessageBubble.tsx`

#### 3.2.1 增加导入和 hook 调用

```typescript
import { useI18n } from '../i18n/useI18n';
```

在 `MessageBubble` 函数体顶部：
```typescript
const { t, locale } = useI18n();
```

#### 3.2.2 替换清单

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 99 | `收起思考过程` | `{t('chat.message.hideReasoning')}` | `chat.message.hideReasoning` |
| 99 | `查看思考过程` | `{t('chat.message.showReasoning')}` | `chat.message.showReasoning` |
| 117 | `思考中...` | `{t('chat.message.thinking')}` | `chat.message.thinking` |
| 136 | `formatTime(message.timestamp)` | `formatTime(message.timestamp, locale)` | - |

#### 3.2.3 具体代码片段

**思考过程折叠按钮（第 93-100 行）：**
```tsx
<button
  type="button"
  onClick={() => setShowReasoning(!showReasoning)}
  className="flex items-center gap-1.5 text-xs text-mute hover:text-ink transition-colors"
>
  <span className="text-xs">{showReasoning ? '▼' : '▶'}</span>
  <span>{showReasoning ? t('chat.message.hideReasoning') : t('chat.message.showReasoning')}</span>
</button>
```

**思考中动画（第 113-117 行）：**
```tsx
<span className="ml-0.5 text-xs">{t('chat.message.thinking')}</span>
```

**时间戳格式化（第 136 行）：**
```tsx
// 改前
{formatTime(message.timestamp)}
// 改后
{formatTime(message.timestamp, locale)}
```

### 3.3 ToolCallCard.tsx — 参数/结果标签

**文件：** `src/entrypoints/sidepanel/components/ToolCallCard.tsx`

**注意：** `ToolCallCard` 当前在 `MessageBubble.tsx` 中被引用（第 68 行），但文件中也存在一个私有的 `ToolBubble` 组件（第 143 行）。检查当前代码，`MessageBubble` 中引用的是：
```tsx
import { ToolCallCard } from './ToolCallCard';
```

但实际上 `MessageBubble` 内部定义的 `ToolBubble`（第 143 行）才是实际渲染工具卡片的组件，`ToolCallCard` 可能未被使用。需确认后决定改造哪个。

#### 3.3.1 改造 MessageBubble 中的 ToolBubble（第 143-195 行）

在 `ToolBubble` 内部无法直接使用 hook（它是普通函数组件，不在 `MessageBubble` 组件作用域内但可以有自己的 hook 调用）。

**建议方案：** 给 `ToolBubble` 也添加 `useI18n()` 调用，或将 `t` 作为 props 传入。

方案 A（推荐 — 自包含）：
```typescript
function ToolBubble({ call }: { call: ToolCallDisplay }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  // ...
}
```

替换清单：

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 175 | `参数: ` | `{t('chat.message.params')}: ` | `chat.message.params` |
| 182 | `结果: ` | `{t('chat.message.result')}: ` | `chat.message.result` |

#### 3.3.2 改造 ToolCallCard.tsx（如果被引用）

如果 `ToolCallCard` 确实被外部引用（如其他组件），同样改造：

```typescript
import { useI18n } from '../i18n/useI18n';

export function ToolCallCard({ call }: Props) {
  const { t } = useI18n();
  // ...
}
```

替换清单：

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 50 | `参数: ` | `{t('chat.message.params')}: ` | `chat.message.params` |
| 57 | `结果: ` | `{t('chat.message.result')}: ` | `chat.message.result` |

## 4. 接口/契约

### 4.1 依赖的格式化函数

```typescript
// utils.ts (T4 改造后)
export function formatTime(ts: number, locale: string): string;
```

### 4.2 使用的语言包 Key

| Key | 中文 | 英文 |
|-----|------|------|
| `chat.emptyState` | 开始对话，发送消息给 Browser Agent | Start a conversation, send a message to Browser Agent |
| `chat.message.showReasoning` | 查看思考过程 | Show reasoning |
| `chat.message.hideReasoning` | 收起思考过程 | Hide reasoning |
| `chat.message.thinking` | 思考中... | Thinking... |
| `chat.message.params` | 参数 | Params |
| `chat.message.result` | 结果 | Result |

### 4.3 需要在 T1 语言包中新增的 Key

当前设计文档的 MessageSchema 中缺少 `chat.emptyState`，需要在 T1 的语言包 JSON 中补充：
```json
{
  "chat": {
    "emptyState": "开始对话，发送消息给 Browser Agent",
    // ... 已有 key
  }
}
```

同时需要在 `i18n/types.ts` 的 `MessageSchema` 接口中补充该字段。

## 5. 测试指引

### 5.1 现有测试

- `src/entrypoints/sidepanel/__tests__/MessageBubble.test.tsx`
- `src/entrypoints/sidepanel/__tests__/ToolCallCard.test.tsx`

需更新：
- Mock `useI18n` 返回 `{ t: (key) => key, locale: 'zh-CN' }`
- 验证思考过程展开/收起按钮文本
- 验证参数/结果标签文本
- 验证 `formatTime` 调用传入了 `locale`

### 5.2 手动验证

1. 中文环境：空状态显示"开始对话，发送消息给 Browser Agent"
2. 英文环境：空状态显示"Start a conversation, send a message to Browser Agent"
3. 思考过程按钮：中文"查看思考过程"/"收起思考过程"，英文"Show reasoning"/"Hide reasoning"
4. 工具卡片：参数标签"参数"/"Params"，结果标签"结果"/"Result"
5. 思考中动画："思考中..."/"Thinking..."
6. 时间戳格式：中文 `14:30`，英文 `02:30 PM`

## 6. 验收标准

- [ ] `ChatView` 空状态提示使用 `t('chat.emptyState')`
- [ ] `MessageBubble` 思考过程展开/收起按钮文本可切换
- [ ] `MessageBubble` "思考中..."动画文本可切换
- [ ] `MessageBubble` 时间戳格式化传入 `locale`
- [ ] `ToolBubble`/`ToolCallCard` "参数"/"结果"标签可切换
- [ ] `npx tsc --noEmit` 零错误
- [ ] 现有测试全部通过

## 7. 注意事项

### 7.1 ToolBubble vs ToolCallCard

当前代码中 `MessageBubble.tsx` 内部定义了私有的 `ToolBubble` 组件（第 143 行），而 `ToolCallCard.tsx` 导出了同功能的 `ToolCallCard` 组件。需在改造前确认哪个是实际使用的：

- 查看 `MessageBubble.tsx` 第 68 行是否引用了 `ToolCallCard`
- 搜索其他文件是否引用了 `ToolCallCard`

如果两者功能重叠，建议只保留一个并对其进行改造（或合并后改造）。

### 7.2 空状态 Key 缺失

当前 MessageSchema 中没有 `chat.emptyState`，需在 T1 实施时补充，或将空状态文本合并到 `app` 命名空间下。推荐新增 `chat.emptyState`。

### 7.3 用户消息不为空

用户消息的 `content` 始终是用户输入的原始文本，不需要翻译。仅翻译 UI 框架文本（标签、提示等）。

### 7.4 ▼/▶ 箭头保留

折叠箭头的 `▼`/`▶` 是符号（非文字），不需要国际化。
