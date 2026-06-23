## 审查报告

### 变更概述
- **修改文件数**：2（新增）
- **新增组件**：`SkillPanel.tsx`（296 行）
- **新增测试**：`SkillPanel.test.tsx`（386 行）
- **风险等级**：低

### 验收标准对照

| # | 标准 | 状态 |
|---|------|------|
| 1 | 弹窗正确渲染，包含标题栏和关闭按钮 | ✅ |
| 2 | 列表正确显示所有 skill 的 name/desc/启用状态 | ✅ |
| 3 | 点击"新建技能"进入编辑模式，填写表单后可保存 | ✅ |
| 4 | 点击"编辑"进入编辑模式，修改后可保存 | ✅ |
| 5 | 点击"删除"弹出确认提示，确认后 skill 被移除 | ✅ |
| 6 | 启用/禁用开关即时生效 | ✅ |
| 7 | 空列表时显示"暂无技能"提示 | ✅ |
| 8 | 名称不能为空（保存时校验） | ✅ |
| 9 | 组件卸载时取消 SkillStore 监听 | ✅ |

### 发现问题

#### [CRITICAL] 无

#### [HIGH] 无

#### [MEDIUM]

**[M1] SkillStore.update 调用时未传 `updatedAt`，但 store 层会自动填充**

- 文件：`src/entrypoints/sidepanel/components/SkillPanel.tsx:55-59`
- 问题：编辑模式下 `handleSave` 调用 `store.update(id, { name, description, prompt })` 未显式传入 `updatedAt`。SkillStore.update 内部会 `Date.now()` 自动覆盖 `updatedAt`（skill-store.ts:77），行为正确，但值得在注释中说明，避免后续维护者误以为 `updatedAt` 丢失。
- 风险：无，store 层已处理。
- 修复建议：无需修改代码，仅作为认知提醒。

**[M2] 测试中 `act()` 警告**

- 文件：`src/entrypoints/sidepanel/__tests__/SkillPanel.test.tsx:340-360`
- 问题：`SkillStore.onChange 触发时应更新列表` 测试中，`storeMock._notify(newSkills)` 直接触发 React 状态更新，未包裹在 `act()` 中。运行输出中有 warning：
  ```
  Warning: An update to SkillPanel inside a test was not wrapped in act(...)
  ```
- 修复建议：
  ```typescript
  import { act } from 'react';
  // 在 _notify 调用处包裹 act：
  act(() => {
    storeMock._notify(newSkills);
  });
  ```
- 严重性：低，不影响测试正确性，但会产生控制台噪音。

**[M3] 编辑模式下同时存在多个 skill-item 时，`skill-edit` / `skill-delete` / `skill-toggle` 的 `data-testid` 不唯一**

- 文件：`src/entrypoints/sidepanel/components/SkillPanel.tsx:130-171`
- 问题：列表渲染时每个 skill 的编辑按钮、删除按钮、开关都使用相同的 `data-testid`（如 `skill-edit`、`skill-delete`、`skill-toggle`）。当列表中多于 1 个 skill 时，`screen.getByTestId` 会报错（多元素匹配）。当前测试中只有一个 skill 的场景不受影响，但多 skill 场景的交互测试（如"只删除第二个"）无法编写。
- 修复建议：为 `data-testid` 追加 skill id 后缀，或使用 `getAllByTestId` + 索引：
  ```tsx
  data-testid={`skill-edit-${skill.id}`}
  ```
  或测试中使用 `within(skillItems[1]).getByTestId('skill-edit')`。
- 严重性：低，当前测试场景不触发，但限制了未来多 skill 交互测试的可测试性。

#### [LOW]

**[L1] `emptySkillForm` 返回类型标注为 `Skill` 但 `id` 为空字符串**

- 文件：`src/entrypoints/sidepanel/components/SkillPanel.tsx:12-22`
- 问题：`emptySkillForm()` 返回 `{ id: '', createdAt: 0, updatedAt: 0 }`，类型标注为 `Skill`。这在逻辑上是"新建前的临时状态"，但类型层面违反了 `Skill.id` 为非空 `string` 的语义。实际不影响运行（保存时用 `crypto.randomUUID()` 覆写），仅类型语义不够精确。
- 修复建议：可定义 `type SkillForm = Partial<Skill> & { name: string }`，但当前做法与其他组件一致（SettingsPanel 也用 `defaultForm` 带空 id），保持一致即可，不强制修改。

**[L2] `useEffect` 依赖数组缺少 `store`**

- 文件：`src/entrypoints/sidepanel/components/SkillPanel.tsx:31-35`
- 问题：`useEffect` 内部使用了 `store`（`store.getAll()`、`store.onChange()`），但依赖数组为 `[]`。由于 `store` 是通过 `SkillStore.getInstance()` 获取的单例，在组件生命周期内不会变化，实际上安全。但 ESLint `react-hooks/exhaustive-deps` 规则会报警。
- 修复建议：添加 `store` 到依赖数组或加 `// eslint-disable-next-line` 注释。与 SettingsPanel 类似模式，保持一致即可。

### 代码质量评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 正确性 | ★★★★★ | 18 个测试全部通过，验收标准全覆盖 |
| 安全性 | ★★★★★ | 无 XSS 风险（React JSX 自动转义），无敏感数据泄露 |
| 可维护性 | ★★★★☆ | 状态管理清晰，与 SkillStore 交互正确，M3 可测试性有提升空间 |
| 性能 | ★★★★★ | useCallback 合理，无不必要的重渲染 |
| 风格一致性 | ★★★★★ | 严格对齐 SettingsPanel 的 Tailwind 样式和组件结构 |

### 测试覆盖分析

18 个测试用例，覆盖以下场景：

| 类别 | 测试数 | 覆盖 |
|------|--------|------|
| 渲染 | 2 | 标题栏 + 关闭按钮 |
| 空状态 | 1 | "暂无技能"提示 |
| 列表渲染 | 3 | 多 skill、无描述、启用 badge |
| 新建 | 3 | 进入编辑、空名称 disabled、填写保存 |
| 编辑 | 3 | 预填值、修改保存、取消退出 |
| 删除 | 3 | 确认弹窗、确认删除、取消删除 |
| 开关 | 1 | 切换 enabled |
| onChange | 1 | 外部变更同步 |
| 卸载清理 | 1 | 取消监听 |

**建议补充的测试（非阻塞）：**
1. 编辑时清空名称后保存按钮应 disabled（边界）
2. 多个 skill 时切换其中一个的开关不影响其他（交互隔离）
3. handleSave 中 store.add/store.update 失败时的行为（当前无错误处理）

### 越界检查

- 变更文件：2 个，均为 Issue #80 指定的输出文件 ✅
- 无额外修改

### 审查结论

- [x] **通过** — 无 Critical/High 问题

所有验收标准满足，18 个测试全部通过，代码风格严格对齐 SettingsPanel，无安全风险，无越界修改。3 个 Medium 问题（M1 认知提醒、M2 act() 警告、M3 testid 唯一性）均为低影响，不阻塞合并。

建议在合并后跟进修复 M2（act 警告）和 M3（testid 唯一性），以保持代码库整洁。
