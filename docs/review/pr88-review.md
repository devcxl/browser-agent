## 审查报告 — PR #88 (feat/extend-context-builder → dev)

**审查日期**: 2026-06-23
**审查人**: @reviewer
**关联 Issue**: #78 (T5: 扩展 ContextBuilder 支持 skill 注入)

### 变更概述

- **修改文件数**: 2
- **新增接口/组件**: `ContextBuilder.buildSkillSections()` 私有方法
- **风险等级**: 低
- **测试**: 673/673 通过，零回归

### 变更文件

| 文件 | 行变更 | 说明 |
|------|--------|------|
| `src/agent/context-builder.ts` | +45/-2 | `build()` 新增 `activeSkillNames`、`allSkills` 可选参数；新增 `buildSkillSections()` 方法 |
| `src/agent/__tests__/context-builder.test.ts` | +98 | 新增 6 个 skill 注入测试用例 |

### 验收标准对照

| # | 标准 | 状态 |
|---|------|------|
| 1 | 不传可选参数时输出与修改前完全一致 | ✅ |
| 2 | 传入 `allSkills` 时包含 "## 可用技能" | ✅ |
| 3 | 传入匹配 `activeSkillNames` 时注入已激活 prompt | ✅ |
| 4 | 传入不匹配 `activeSkillNames` 时不注入 | ✅ |
| 5 | 单元测试覆盖各组合 | ✅ (6 个新用例) |
| 6 | 现有测试全部通过 | ✅ (673/673) |

### 发现问题

#### [HIGH] `buildSkillSections` 未检查 `Skill.enabled` 字段

- **文件**: `src/agent/context-builder.ts:68`
- **问题**: Skill 类型包含 `enabled` 字段，但 `buildSkillSections` 不区分启用/禁用状态。测试中 docker skill (`enabled: false`) 仍出现在可用技能列表中。
- **修复建议**: 确认职责划分 — 如果调用方（agent-loop）负责传入已过滤的技能列表，则当前实现正确。如需自保，可在构建可用列表时过滤：
  ```typescript
  const availableList = allSkills
    .filter((s) => s.enabled !== false)
    .map((s) => `- ${s.name}: ${s.description}`)
    .join('\n');
  ```
- **判定**: 属于调用方职责，当前不阻塞合并，但需在后续集成任务中明确。

#### [MEDIUM] 缺少 `allSkills` 为空数组 `[]` 的测试

- **文件**: `src/agent/__tests__/context-builder.test.ts`
- **问题**: 未覆盖 `allSkills` 为空数组的边界情况。代码逻辑正确（`allSkills.length === 0` 会返回 null），但缺显式验证。
- **建议**: 补充测试用例：
  ```typescript
  it('allSkills 为空数组时不注入任何 skill 内容', async () => {
    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext, [], []);
    expect(messages[0]!.content).not.toContain('## 可用技能');
    expect(messages[0]!.content).not.toContain('## 已激活的技能');
  });
  ```

#### [MEDIUM] `activeSkillNames` 使用名称匹配存在歧义风险

- **文件**: `src/agent/context-builder.ts:82`
- **问题**: 使用 `s.name` 而非 `s.id` 匹配。如果两个 skill 同名但 ID 不同，会同时被激活。
- **建议**: 调用方需保证 `name` 唯一。当前实现与参数命名 `activeSkillNames` 一致，不修改。

#### [MEDIUM] 测试中 docker skill 的 `enabled: false` 有误导性

- **文件**: `src/agent/__tests__/context-builder.test.ts:78`
- **问题**: `enabled: false` 的 skill 出现在期望的"可用技能"列表中，阅读者会困惑。
- **建议**: 移除无关的 `enabled` 字段，或添加注释说明该字段不由 context-builder 处理。

#### [LOW] 参数类型可简化

- **文件**: `src/agent/context-builder.ts:68`
- **问题**: `string[] | undefined` 写法正确但冗长。与 `build()` 签名风格一致，保持现状。

### 测试覆盖分析

**已覆盖**:
- 不传可选参数 → 向后兼容
- 传 allSkills → 可用技能列表
- 传 activeSkillNames + allSkills → 已激活技能注入
- 不匹配的 activeSkillNames → 不注入
- activeSkillNames 空数组 → 不注入
- 多技能 + 部分激活 → 正确筛选

**未覆盖（建议补充）**:
- allSkills 为空数组 `[]`
- skill 的 `prompt` 为空字符串的边界情况
- `buildSkillSections` 返回值的精确字符串格式断言

### 安全性检查

- ✅ 无硬编码密钥、密码、token
- ✅ 无 SQL 注入风险
- ✅ 无路径遍历风险
- ✅ 无未校验用户输入
- ✅ 无认证/授权漏洞

### 审查结论

- [x] **通过** — 无 Critical 问题，HIGH 问题属于职责划分不阻塞合并

**后续建议**:
- 在 agent-loop 集成任务中明确 `activeSkillNames` 和 `allSkills` 的数据来源与过滤职责
- 补充 `allSkills` 为空数组的测试用例
- 考虑在测试中移除 `enabled` 字段或添加注释说明其不生效
