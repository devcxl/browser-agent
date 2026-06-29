## 审查报告 — PR #120: T4 改造 utils.ts 格式化函数

### 变更概述
- **修改文件数：** 2
- **新增接口/组件：** `formatNum` 函数
- **风险等级：** 高

### 修改文件

| 文件 | 新增行 | 删除行 | 变更类型 |
|------|--------|--------|----------|
| `src/entrypoints/sidepanel/utils.ts` | +9 | -4 | MODIFIED |
| `src/entrypoints/sidepanel/__tests__/utils.test.ts` | +47 | -1 | MODIFIED |

---

### 发现问题

#### [CRITICAL] 缺失组件改造：ConversationSidebar 和 TokenPanel 仍保留局部格式化函数

- **文件：** `src/entrypoints/sidepanel/components/ConversationSidebar.tsx:20-22`
- **文件：** `src/entrypoints/sidepanel/components/TokenPanel.tsx:10-12`
- **问题：** 开发文档 [docs/dev/i18n-国际化支持-refactor-format-utils.md](docs/dev/i18n-国际化支持-refactor-format-utils.md) **第 80-93 行**明确要求：
  1. `ConversationSidebar.tsx` 删除第 20-22 行局部 `formatNum` 函数，改为 `import { formatDateTime, cn, formatNum } from '../utils'`
  2. `TokenPanel.tsx` 删除第 10-12 行局部 `formatNumber` 函数，改为 `import { formatNum } from '../utils'`（函数名统一）

  当前 PR 分支上这两个文件的局部函数**仍未被移除**，`ConversationSidebar.tsx` 的 import 行也**未更新**引入 `formatNum`。

  这导致验收标准第 6 条不满足：
  > `ConversationSidebar.tsx` 和 `TokenPanel.tsx` 中删除局部 `formatNum`/`formatNumber` 函数，改为从 `utils.ts` 导入

- **修复建议：**

  **ConversationSidebar.tsx:**
  ```diff
  -import { formatDateTime, cn } from '../utils';
  +import { formatDateTime, cn, formatNum } from '../utils';

  // 删除整个局部函数定义（第 20-22 行）：
  -function formatNum(n: number): string {
  -  return n.toLocaleString();
  -}
  ```

  **TokenPanel.tsx:**
  ```diff
  +import { formatNum } from '../utils';

  // 删除整个局部函数定义（第 10-12 行），并将调用处：
  -function formatNumber(n: number): string {
  -  return n.toLocaleString();
  -}
  // 所有 formatNumber(...) 调用改为 formatNum(...)
  ```

---

#### [MEDIUM] 测试断言不够精确 — 无法区分 locale 行为差异

- **文件：** `src/entrypoints/sidepanel/__tests__/utils.test.ts:9, 15`
- **问题：** `formatTime` 两个测试用例使用了相同的正则 `toMatch(/14:30|02:30/)`。在 `zh-CN` locale 下 `14:30` 会格式化为 `"14:30"`，在 `en-US` 下则为 `"2:30 PM"`。当前断言无法检测到 locale 参数被忽略的 bug（例如默认值设错导致两个测试都走同一 locale）。

- **修复建议：**
  ```typescript
  it('formats with default locale (zh-CN)', () => {
    const ts = new Date(2024, 0, 15, 14, 30, 0).getTime();
    expect(formatTime(ts)).toBe('14:30');
  });

  it('formats with custom locale (en-US)', () => {
    const ts = new Date(2024, 0, 15, 14, 30, 0).getTime();
    expect(formatTime(ts, 'en-US')).toMatch(/2:30\s*PM/i);
  });
  ```

---

#### [MEDIUM] formatDateTime 测试断言过于宽松

- **文件：** `src/entrypoints/sidepanel/__tests__/utils.test.ts:23, 29`
- **问题：** 两个 `formatDateTime` 测试仅检查 `toContain('15')`，无法验证 locale 特定格式化差异。例如若参数 `locale` 被错误忽略为固定值，测试依然通过。

- **修复建议：**
  ```typescript
  it('formats with default locale (zh-CN)', () => {
    const ts = new Date(2024, 0, 15, 14, 30, 0).getTime();
    const result = formatDateTime(ts);
    expect(result).toContain('15');
    expect(result).not.toMatch(/AM|PM/i); // zh-CN 不使用 AM/PM
  });

  it('formats with custom locale (en-US)', () => {
    const ts = new Date(2024, 0, 15, 14, 30, 0).getTime();
    const result = formatDateTime(ts, 'en-US');
    expect(result).toContain('Jan');       // en-US 月份缩写
    expect(result).toContain('15');
    expect(result).toMatch(/AM|PM/i);      // en-US 使用 AM/PM
  });
  ```

---

#### [MEDIUM] formatNum 缺少 en-US 测试场景

- **文件：** `src/entrypoints/sidepanel/__tests__/utils.test.ts`
- **问题：** 开发文档测试场景 6 要求覆盖 `formatNum(1234567, 'en')`，当前测试用 `de-DE` 代替。虽然 `de-DE` 的分隔符也是 `.`，但缺少 en-US 覆盖使测试矩阵不完整。
- **修复建议：** 新增测试用例：
  ```typescript
  it('formats number with en-US locale', () => {
    expect(formatNum(1234567, 'en-US')).toBe('1,234,567');
  });
  ```

---

### 验收标准对照

| # | 标准 | 状态 |
|---|------|------|
| 1 | `formatTime` 支持可选 `locale` 参数，默认 `'zh-CN'` | ✅ |
| 2 | `formatDateTime` 支持可选 `locale` 参数，默认 `'zh-CN'` | ✅ |
| 3 | `formatNum` 新增到 `utils.ts`，支持可选 `locale` 参数，默认 `'zh-CN'` | ✅ |
| 4 | 不传 `locale` 时行为与改造前完全一致（向后兼容） | ✅ |
| 5 | 所有现有调用处无需修改即可通过编译 | ✅（`npx tsc --noEmit` 通过） |
| 6 | `ConversationSidebar.tsx` 和 `TokenPanel.tsx` 删除局部 `formatNum`/`formatNumber` | ❌ 未完成 |
| 7 | `npx tsc --noEmit` 无错误 | ✅ |
| 8 | 测试通过 | ✅（16 个测试全部通过） |

---

### 测试覆盖分析

**新增测试：** 9 个（formatTime ×2, formatDateTime ×2, formatNum ×4）

**覆盖盲区：**
- `formatNum` 缺少 `en-US` locale 测试
- `formatTime` / `formatDateTime` 断言过于宽松，未覆盖 locale 差异边界
- 缺失集成测试：验证 `ConversationSidebar`、`TokenPanel`、`MessageBubble` 中格式化函数行为不变

---

### 审查结论

- [ ] 通过 — 无 Critical/High 问题
- [ ] 有条件通过 — 仅 Medium 及以下问题
- [x] **不通过 — 存在 Critical 问题**

**不通过原因：** 组件改造（ConversationSidebar.tsx、TokenPanel.tsx）未包含在本次 PR 中，这是开发文档明确要求的交付物，属于功能不完整。PR 描述中的验收标准第 6 条标注为已完成，但与实际代码不符。

**建议：** 补充组件改造后重新请求审查。
