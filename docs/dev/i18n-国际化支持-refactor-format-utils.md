# 开发文档: T4 - 改造 utils.ts 格式化函数

**Project:** i18n-国际化支持
**Task ID:** T4
**Slug:** refactor-format-utils
**Issue:** #107
**类型:** frontend
**Batch:** 1
**依赖:** 无

## 1. 目标

改造 `src/entrypoints/sidepanel/utils.ts` 中的 `formatTime`、`formatDateTime`，并新增 `formatNum` 函数，三个函数均增加可选的 `locale` 参数以支持国际化格式化，同时保持向后兼容。

## 2. 前置条件

- 已了解现有 `utils.ts` 文件结构和函数签名
- 已知 `ConversationSidebar.tsx`（第 20-22 行）和 `TokenPanel.tsx`（第 10-12 行）各自定义了局部的 `formatNum` 函数，需要在本次任务中统一

## 3. 实现步骤

### 3.1 改造 `formatTime`

- **文件：** `src/entrypoints/sidepanel/utils.ts`
- **现有签名：** `formatTime(ts: number): string`
- **新签名：** `formatTime(ts: number, locale?: string): string`

关键逻辑：
```typescript
/** 格式化时间戳为 HH:mm */
export function formatTime(ts: number, locale: string = 'zh-CN'): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
```

改造要点：
- 增加可选参数 `locale: string = 'zh-CN'`
- 将硬编码 `'zh-CN'` 替换为 `locale` 参数
- 默认值 `'zh-CN'` 保持向后兼容 — 所有现有调用处（仅 `MessageBubble.tsx` 第 136 行）无需修改

### 3.2 改造 `formatDateTime`

- **文件：** `src/entrypoints/sidepanel/utils.ts`
- **现有签名：** `formatDateTime(ts: number): string`
- **新签名：** `formatDateTime(ts: number, locale?: string): string`

关键逻辑：
```typescript
/** 格式化日期时间 */
export function formatDateTime(ts: number, locale: string = 'zh-CN'): string {
  const d = new Date(ts);
  return d.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
```

改造要点：
- 同上，增加可选 `locale` 参数
- 默认值 `'zh-CN'` 保持向后兼容
- 现有调用处：`ConversationSidebar.tsx` 第 180 行，无需修改

### 3.3 新增 `formatNum`

- **文件：** `src/entrypoints/sidepanel/utils.ts`
- **新签名：** `formatNum(n: number, locale?: string): string`

关键逻辑：
```typescript
/** 格式化数字（千位分隔） */
export function formatNum(n: number, locale: string = 'zh-CN'): string {
  return n.toLocaleString(locale);
}
```

改造要点：
- 新增函数到 `utils.ts`，从 `ConversationSidebar.tsx` 和 `TokenPanel.tsx` 中移除各自局部的 `formatNum` 定义
- `ConversationSidebar.tsx`：删除第 20-22 行局部 `formatNum`，从 `import { ..., formatNum } from '../utils'` 导入
- `TokenPanel.tsx`：删除第 10-12 行局部 `formatNumber`，改为从 `../utils` 导入 `formatNum`（注意函数名统一）

### 3.4 更新导入

- `ConversationSidebar.tsx`（第 3 行）：
  - 改前：`import { formatDateTime, cn } from '../utils';`
  - 改后：`import { formatDateTime, cn, formatNum } from '../utils';`
- `TokenPanel.tsx`：新增 import，删除局部函数定义
  - 新增：`import { formatNum } from '../utils';`（如果尚未导入其他 utils）
  - 删除：第 10-12 行 `function formatNumber`

## 4. 接口/契约

### 4.1 新增接口

无 API 接口变更。

### 4.2 函数签名变更

| 函数 | 改前 | 改后 |
|---|---|---|
| `formatTime` | `(ts: number): string` | `(ts: number, locale?: string): string` |
| `formatDateTime` | `(ts: number): string` | `(ts: number, locale?: string): string` |
| `formatNum` | 不存在（组件内局部定义） | `(n: number, locale?: string): string` |

### 4.3 数据模型变更

无。

## 5. 测试指引

### 5.1 单元测试

**测试文件：** `src/entrypoints/sidepanel/__tests__/utils.test.ts`

- **场景 1：formatTime 默认 locale**
  - `formatTime(1700000000000)` → 返回中文格式时间（如 `"11:33"`），行为与改造前一致
- **场景 2：formatTime 指定 en**
  - `formatTime(1700000000000, 'en')` → 返回英文格式时间（如 `"11:33 AM"`）
- **场景 3：formatDateTime 默认 locale**
  - `formatDateTime(1700000000000)` → 返回中文格式（如 `"11月15日 11:33"`），行为一致
- **场景 4：formatDateTime 指定 en**
  - `formatDateTime(1700000000000, 'en')` → 返回英文格式（如 `"Nov 15, 11:33 AM"`）
- **场景 5：formatNum 默认 locale**
  - `formatNum(1234567)` → `"1,234,567"`（中文千位分隔）
- **场景 6：formatNum 指定 en**
  - `formatNum(1234567, 'en')` → `"1,234,567"`（与中文相同，因为数字格式类似）
- **场景 7：formatNum 整数边界值**
  - `formatNum(0)` → `"0"`
  - `formatNum(999)` → `"999"`

### 5.2 集成测试

- 确认 `ConversationSidebar` 中 token 用量数字显示正确（`formatNum` 导入替换局部分函数）
- 确认 `TokenPanel` 中 token 数字显示正确（`formatNum` 替换局部分 `formatNumber`）
- 确认 `MessageBubble` 中时间戳显示正确（`formatTime` 调用无需修改）
- 确认 `ConversationSidebar` 中日期显示正确（`formatDateTime` 调用无需修改）

### 5.3 编译检查

- 运行 `npx tsc --noEmit` 确保所有类型正确
- 确保 `ConversationSidebar.tsx` 和 `TokenPanel.tsx` 中删除局部函数后没有未引用的变量

## 6. 验收标准

- [ ] `formatTime` 支持可选 `locale` 参数，默认 `'zh-CN'`
- [ ] `formatDateTime` 支持可选 `locale` 参数，默认 `'zh-CN'`
- [ ] `formatNum` 新增到 `utils.ts`，支持可选 `locale` 参数，默认 `'zh-CN'`
- [ ] 不传 `locale` 时行为与改造前完全一致（向后兼容）
- [ ] 所有现有调用处无需修改即可通过编译（`MessageBubble.tsx`、`ConversationSidebar.tsx`）
- [ ] `ConversationSidebar.tsx` 和 `TokenPanel.tsx` 中删除局部 `formatNum`/`formatNumber` 函数，改为从 `utils.ts` 导入
- [ ] `npx tsc --noEmit` 无错误
- [ ] 现有测试（`__tests__/utils.test.ts`）通过（如果有的话），或新增上述测试用例

## 7. 注意事项

- **函数名统一**：`TokenPanel.tsx` 中的局部函数叫 `formatNumber`，要改为使用 `utils.ts` 中的 `formatNum`。确保所有引用都更新。
- **`SettingsPanel.tsx`/`SkillPanel.tsx` 中的 `toLocaleString('zh-CN')` 调用**（第 579/226 行）不是通过 `utils.ts` 的，而是直接用 `new Date(...).toLocaleString('zh-CN')`。这些调用在后续 T9/T11 组件改造时会一并处理，本次不改。
- **向后兼容是最高优先**：所有默认值设为 `'zh-CN'`，确保不传 `locale` 时行为不变。
- **locale 参数类型**：使用 `string` 类型而非 `Locale` 类型（`'zh-CN' | 'en'`），因为 `Intl` API 接受通用 `string`，且避免 T4 对 T1 产生不必要的类型依赖。
