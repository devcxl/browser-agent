# 开发文档: T11 - BrowserStatePanel/TokenPanel/SkillPanel 国际化

**Project:** i18n-国际化支持
**Task ID:** T11
**Slug:** i18n-info-panels
**Issue:** #117
**类型:** frontend
**Batch:** 3
**依赖:** T3 (I18nProvider + useI18n), T4 (格式化函数增加 locale 参数)

## 1. 目标

将 `BrowserStatePanel`、`TokenPanel`、`SkillPanel` 三个信息面板中的硬编码文本替换为 `t()` 调用，数字格式化传入当前 `locale`。

## 2. 前置条件

- [ ] T3 完成 — `useI18n` hook 可用
- [ ] T4 完成 — `formatNum(n, locale)` 签名已更新
- [ ] T1 完成 — 语言包中 `browser.*`、`token.*`、`settings.skills.*` 全部 key 已定义

## 3. 实现步骤

### 3.1 BrowserStatePanel.tsx

**文件：** `src/entrypoints/sidepanel/components/BrowserStatePanel.tsx`

#### 3.1.1 增加导入和 hook 调用

```typescript
import { useI18n } from '../i18n/useI18n';
```

在 `BrowserStatePanel` 函数体顶部：
```typescript
const { t } = useI18n();
```

#### 3.1.2 替换清单

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 27 | `浏览器状态 ◀` | `{t('browser.title')} ◀` | `browser.title` |
| 35 | `加载中...` | `{t('browser.loading')}` | `browser.loading` |
| 40 | `错误:` 前缀 | `{t('browser.error')}: {error}` | `browser.error` |
| 46 | `无数据` | `{t('browser.noData')}` | `browser.noData` |
| 52 | `窗口 ({state.windows.length})` | `{t('browser.windows')} ({state.windows.length})` | `browser.windows` |
| 63 | `` 窗口 ${w.id} `` | `` {t('browser.windowLabel', { id: w.id })} `` | `browser.windowLabel` |
| 68 | `活跃` | `{t('browser.active')}` | `browser.active` |
| 77 | `标签页 ({state.tabs.length})` | `{t('browser.tabs')} ({state.tabs.length})` | `browser.tabs` |

#### 3.1.3 关键代码片段

**标题栏（第 22-28 行）：**
```tsx
<button
  type="button"
  onClick={onToggleCollapse}
  className="flex items-center justify-between px-3 py-2 border-b border-hairline text-xs font-medium text-mute hover:bg-surface-soft"
>
  {collapsed ? '◀' : <span>{t('browser.title')} ◀</span>}
</button>
```

**加载状态（第 32-36 行）：**
```tsx
{loading && (
  <div className="flex items-center justify-center py-8 text-mute">
    <span className="inline-block w-3 h-3 border-2 border-ash border-t-primary rounded-full animate-spin mr-2" />
    {t('browser.loading')}
  </div>
)}
```

**错误状态（第 39-42 行）：**
```tsx
{error && (
  <div className="text-danger bg-red-50 rounded-md px-2 py-1">
    {t('browser.error')}: {error}
  </div>
)}
```

**空状态（第 45-47 行）：**
```tsx
{!loading && !error && !state && (
  <div className="text-mute text-center py-8">{t('browser.noData')}</div>
)}
```

**窗口标题（第 62-64 行）：**
```tsx
<span className="text-ink font-medium truncate flex-1">
  {w.title ?? t('browser.windowLabel', { id: w.id })}
</span>
```

对应语言包 `browser.windowLabel`：
- 中文：`窗口 {{id}}`
- 英文：`Window {{id}}`

**注意：** `w.id` 通常是整数（如 `1234567890`），模板变量传入数字类型。

#### 3.1.4 数字格式化

`state.windows.length` 和 `state.tabs.length` 是数字，当前直接显示。如果需要千位分隔（如 1000+ 个标签页），可以使用 `formatNum`。但对于窗口/标签数量，通常不需要千位分隔，保留直接显示即可。

### 3.2 TokenPanel.tsx

**文件：** `src/entrypoints/sidepanel/components/TokenPanel.tsx`

#### 3.2.1 增加导入和 hook 调用

```typescript
import { useI18n } from '../i18n/useI18n';
```

在 `TokenPanel` 函数体顶部：
```typescript
const { t, locale } = useI18n();
```

#### 3.2.2 删除本地 `formatNumber` 函数

第 10-12 行的本地 `formatNumber` 函数删除，改用 `utils.ts` 中已改造的 `formatNum`。

导入：
```typescript
import { cn } from '../utils';
// 改为
import { cn, formatNum } from '../utils';
```

**注意：** 如果 `formatNum` 在 `utils.ts` 中名字为 `formatNumber` 或尚未导出，需与 T4 实施者确认。当前 `utils.ts` 中没有 `formatNum`，只有 `formatTime` 和 `formatDateTime`。因此可能需要：
1. T4 中在 `utils.ts` 新增 `formatNum(n, locale)` 导出
2. 或在本任务中就地改造本地函数

**如果 T4 未提供，就地改造：**
```typescript
function formatNumber(n: number, locale: string): string {
  return n.toLocaleString(locale);
}
```

保留 `formatNumber` 函数名但增加 `locale` 参数，默认值 `'zh-CN'`。

#### 3.2.3 替换清单

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 37 | `Token 用量` | `{t('token.title')}` | `token.title` |
| 54 | `输入` | `{t('token.input')}` | `token.input` |
| 55 | `formatNumber(usage.prompt)` | `formatNumber(usage.prompt, locale)` | - |
| 59 | `输出` | `{t('token.output')}` | `token.output` |
| 60 | `formatNumber(usage.completion)` | `formatNumber(usage.completion, locale)` | - |
| 62 | `总计` | `{t('token.total')}` | `token.total` |
| 63 | `formatNumber(total)` | `formatNumber(total, locale)` | - |

#### 3.2.4 关键代码片段

```tsx
<span className="text-xs font-medium text-mute">{t('token.title')}</span>
```

```tsx
{!hasData ? (
  <div className="text-ash text-center py-4">{t('token.noData')}</div>
) : (
  <>
    <div className="flex justify-between">
      <span className="text-mute">{t('token.input')}</span>
      <span className="text-ink font-mono">{formatNumber(usage.prompt, locale)}</span>
    </div>
    <div className="flex justify-between">
      <span className="text-mute">{t('token.output')}</span>
      <span className="text-ink font-mono">{formatNumber(usage.completion, locale)}</span>
    </div>
    <div className="border-t border-hairline pt-2 flex justify-between">
      <span className="text-mute font-medium">{t('token.total')}</span>
      <span className="text-ink font-mono font-medium">{formatNumber(total, locale)}</span>
    </div>
  </>
)}
```

### 3.3 SkillPanel.tsx

**文件：** `src/entrypoints/sidepanel/components/SkillPanel.tsx`

**注意：** `SkillPanel` 与 `SettingsPanel` 的 Skills Tab 存在大量代码重叠（约 80% 相同），两处需使用相同的 i18n key。

#### 3.3.1 增加导入和 hook 调用

```typescript
import { useI18n } from '../i18n/useI18n';
```

在 `SkillPanel` 函数体顶部：
```typescript
const { t, locale } = useI18n();
```

#### 3.3.2 替换清单

复用 `settings.skills.*` 命名空间的 key，与 SettingsPanel 的 Skills Tab 保持一致。

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 142 | `技能管理` | `{t('settings.skills.title')}` * | 见下方说明 |
| 156 | `订阅` | `{t('settings.skills.subscriptions')}` * | 见下方说明 |
| 162 | `placeholder="输入 GitHub 仓库，如 owner/repo"` | `placeholder={t('settings.skills.placeholder')}` | `settings.skills.placeholder` |
| 172 | `添加` | `{t('settings.skills.add')}` | `settings.skills.add` |
| 183 | `隐藏 Token` / `配置 GitHub Token（选填，提高 API 限流）` | 条件 `t()` | `settings.skills.hideToken` / `settings.skills.configToken` |
| 191 | `placeholder="ghp_xxx 或 github_pat_xxx"` | `placeholder={t('settings.skills.tokenPlaceholder')}` | `settings.skills.tokenPlaceholder` |
| 210 | `暂无订阅，输入 GitHub 仓库地址添加` | `{t('settings.skills.noSubscriptions')}` | `settings.skills.noSubscriptions` |
| 229-231 | `{subSkills.length} 个技能` | `{t('settings.skills.skillsCount', { count: subSkills.length })}` | `settings.skills.skillsCount` |
| 241 | `同步中...` | `{t('settings.skills.syncing')}` | `settings.skills.syncing` |
| 241 | `同步` | `{t('settings.skills.sync')}` | `settings.skills.sync` |
| 249 | `删除` | `{t('settings.skills.delete')}` | `settings.skills.delete` |
| 311 | `本地技能` | `{t('settings.skills.localSkills')}` | `settings.skills.localSkills` |
| 322 | `启用` | `{t('settings.skills.enabled')}` | `settings.skills.enabled` |
| 98 | msg (sync ok) | `{t('settings.skills.syncComplete', { count: parsed.length })}` | `settings.skills.syncComplete` |
| 100 | msg (sync err) | `{t('settings.skills.syncFailed')}: ${(err as Error).message}` | `settings.skills.syncFailed` |
| 41 | msg (exists) `该订阅已存在` | `{t('settings.skills.subscriptionExists')}` | `settings.skills.subscriptionExists` |

**`*` 标记的 key 注释：**

`settings.skills.title` 和 `settings.skills.subscriptions` 在当前 MessageSchema 中不存在，但 `SkillPanel` 有其独立的标题（"技能管理"）和章节标题（"订阅"），与 `SettingsPanel` 的 Skills Tab 不同。有两种处理方式：

**方案 A — 新增独立 key：**
在 `settings.skills` 下增加：
- `settings.skills.panelTitle`: 技能管理 / Skill Management
- `settings.skills.subscriptions`: 订阅 / Subscriptions

**方案 B — 复用 SettingsPanel 的 key：**
- `panelTitle` 复用 `settings.tabs.skills`（Skills 标签名）
- `subscriptions` 新增或在语言包补充

推荐方案 A，语义更准确。

#### 3.3.3 日期格式化

第 226 行的 `lastSyncedAt` 显示：
```tsx
// 改前
{new Date(sub.lastSyncedAt).toLocaleString('zh-CN')}

// 改后
{new Date(sub.lastSyncedAt).toLocaleString(locale)}
```

#### 3.3.4 Token 按钮条件文本

```tsx
// 改前 (第 182-183 行)
{showToken ? '隐藏 Token' : '配置 GitHub Token（选填，提高 API 限流）'}

// 改后
{showToken ? t('settings.skills.hideToken') : t('settings.skills.configToken')}
```

## 4. 接口/契约

### 4.1 使用的语言包 Key

#### browser 命名空间
| Key | 中文 | 英文 |
|-----|------|------|
| `browser.title` | 浏览器状态 | Browser state |
| `browser.loading` | 加载中... | Loading... |
| `browser.error` | 错误 | Error |
| `browser.noData` | 无数据 | No data |
| `browser.windows` | 窗口 | Windows |
| `browser.tabs` | 标签页 | Tabs |
| `browser.active` | 活跃 | Active |
| `browser.windowLabel` | 窗口 {{id}} | Window {{id}} |

#### token 命名空间
| Key | 中文 | 英文 |
|-----|------|------|
| `token.title` | Token 用量 | Token usage |
| `token.input` | 输入 | Input |
| `token.output` | 输出 | Output |
| `token.total` | 总计 | Total |
| `token.noData` | -- | -- |

#### settings.skills 命名空间（SkillPanel 复用，与 T9 一致）
参见 T9 文档第 4.2 节 `settings.skills.*` 全部 key。

#### 需要新增的 Key（当前 Schema 缺失）

| Key | 中文 | 英文 |
|-----|------|------|
| `settings.skills.panelTitle` | 技能管理 | Skill Management |
| `settings.skills.subscriptions` | 订阅 | Subscriptions |
| `token.noData` | -- | -- |

### 4.2 依赖的格式化函数

```typescript
// utils.ts (T4 改造后)
export function formatNum(n: number, locale: string): string;
```

## 5. 测试指引

### 5.1 现有测试

- `src/entrypoints/sidepanel/__tests__/SkillPanel.test.tsx`

需更新：
- Mock `useI18n` 返回 `{ t: (key) => key, locale: 'zh-CN' }`
- 验证所有文本使用 `t()` 调用
- 验证模板变量消息（`skillsCount`、`syncComplete`）

BrowserStatePanel 和 TokenPanel 当前可能没有独立测试，如果有则同样更新。

### 5.2 手动验证

**BrowserStatePanel:**
1. 打开 sidepanel → 浏览器状态面板可见
2. 中文："浏览器状态"、"窗口 (3)"、"标签页 (10)"、"活跃"
3. 英文："Browser state"、"Windows (3)"、"Tabs (10)"、"Active"

**TokenPanel:**
1. 进行一次对话 → 右侧 Token 面板显示用量
2. 中文："Token 用量"、"输入 / 输出 / 总计"
3. 英文："Token usage"、"Input / Output / Total"
4. 数字格式：1234 显示为 "1,234"

**SkillPanel:**
1. 打开技能管理面板
2. 中文：标题"技能管理"、章节"订阅"、所有按钮和消息为中文
3. 英文：切换语言后所有文本变为英文
4. 模板变量正确（如 "5 个技能" / "5 skills"）

## 6. 验收标准

- [ ] `BrowserStatePanel` 标题、加载、错误、空状态、窗口/标签页标签、活跃标记可切换
- [ ] `BrowserStatePanel` 窗口 fallback 名称使用模板变量
- [ ] `TokenPanel` 标题、输入/输出/总计标签可切换
- [ ] `TokenPanel` 数字格式化跟随 locale（千位分隔）
- [ ] `SkillPanel` 所有文本可切换（与 SettingsPanel Skills Tab 一致）
- [ ] `SkillPanel` 模板变量消息正确
- [ ] `SkillPanel` 日期格式化跟随 locale
- [ ] `npx tsc --noEmit` 零错误
- [ ] 现有测试全部通过

## 7. 注意事项

### 7.1 SkillPanel 与 SettingsPanel Skills Tab 代码重复

`SkillPanel.tsx`（第 87-365 行）和 `SettingsPanel.tsx` 的 Skills Tab（第 514-697 行）有约 80% 的代码重叠。两个文件使用相同的 key 确保一致性。后续可考虑抽取共享组件，但不在本任务范围内。

### 7.2 TokenPanel 的 `--` 占位符

当没有 token 数据时显示 `--`，这是通用占位符，中英文一致，不需要翻译。语言包中的 `token.noData` 保留了 `"--"` 作为占位符值。

### 7.3 BrowserStatePanel 中的 🔊/📌 图标

扬声器图标 🔊 和大头针图标 📌 是 emoji 符号，不需要国际化。

### 7.4 数字格式化一致性

`TokenPanel` 中的数字（token count）和 `ConversationSidebar` 中的 token 统计都使用了 `formatNum(n, locale)`（或本地 `formatNumber(n, locale)`），确保两处的格式化行为一致。
