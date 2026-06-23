# 开发文档: T5 - 扩展 ContextBuilder 注入 Skill 上下文

**Project:** Agent Skill System
**Task ID:** T5
**Slug:** extend-context-builder
**Issue:** #78
**类型:** backend
**Batch:** 2
**依赖:** T1 (#74, define-skill-types)

## 1. 目标

修改 `ContextBuilder.build()` 方法，新增两个可选参数：
- `activeSkillNames: string[]` — 当前已激活的 Skill 名称列表
- `allSkills: Skill[]` — 所有可用 Skill 列表（含 `enabled` 状态）

在 system prompt 中注入可用技能列表和已激活技能的完整 prompt，使 LLM 获得 Skill 上下文指令。

## 2. 前置条件

- **T1 必须已完成**：`src/shared/types/skill.ts` 中的 `Skill` 接口已定义，且 `src/shared/types/index.ts` 已 re-export
- 如果 T1 未完成，本任务中的 `Skill` 类型需直接 inline 定义（见 3.1 节）

### 2.1 验证前置条件

```bash
# 检查 T1 是否已完成
test -f src/shared/types/skill.ts && echo "T1 OK" || echo "T1 NOT DONE - 需要在 context-builder.ts 中 inline 定义 Skill 类型"
```

## 3. 实现步骤

### 3.1 导入 Skill 类型（`src/agent/context-builder.ts`）

**文件：`src/agent/context-builder.ts`，第 1-5 行区域**

现有导入：

```typescript
import type { AgentConfig } from '@/shared/types/agent';
import type { ChatMessage } from '@/shared/types/llm';
import type { IToolRegistry } from '@/registry/types';
import type { IConversationManager, StoredMessage } from '@/shared/types/conversation';
import type { LowSensitivityContext } from '@/shared/types/browser';
```

在第 5 行后新增：

```typescript
import type { Skill } from '@/shared/types/skill';
```

**注意：** 如果 T1 尚未完成（`skill.ts` 不存在），在 `context-builder.ts` 文件顶部（第 5 行之后、第 7 行之前）inline 定义最小 Skill 类型：

```typescript
// 临时 inline 类型定义（T1 完成后移除此行，改用 import）
interface Skill {
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
}
```

> 此 inline 定义仅包含 `ContextBuilder` 实际使用的字段（name, description, prompt, enabled），不包含 id、createdAt、updatedAt。

### 3.2 修改 `build()` 方法签名（第 14-18 行）

**当前代码（第 14-18 行）：**

```typescript
  async build(
    conversationId: string,
    currentBrowserContext: LowSensitivityContext,
  ): Promise<ChatMessage[]> {
```

**修改为：**

```typescript
  async build(
    conversationId: string,
    currentBrowserContext: LowSensitivityContext,
    activeSkillNames?: string[],
    allSkills?: Skill[],
  ): Promise<ChatMessage[]> {
```

> 两个新参数均为可选（`?`），默认 `undefined`，确保向后兼容 —— 不传参时行为与修改前完全一致。

### 3.3 新增 `buildSkillSections()` 私有方法

在 `ContextBuilder` 类中（第 56 行 `convertToChatMessage` 方法之前，即第 55 行之后）新增：

```typescript
  private buildSkillSections(
    allSkills: Skill[],
    activeSkillNames: string[],
  ): string {
    const sections: string[] = [];

    // 1. 可用技能列表
    if (allSkills.length > 0) {
      const skillList = allSkills
        .map((s) => `- ${s.name}: ${s.description}`)
        .join('\n');
      sections.push(`## 可用技能\n你可以使用 \`skill\` 工具激活以下技能。\n${skillList}`);
    }

    // 2. 已激活的技能（仅注入匹配的 skill，忽略不匹配的 activeSkillNames）
    if (activeSkillNames.length > 0) {
      const activeSkills = activeSkillNames
        .map((name) => allSkills.find((s) => s.name === name))
        .filter((s): s is Skill => s !== undefined);

      if (activeSkills.length > 0) {
        const activePrompts = activeSkills
          .map((s) => `### ${s.name}\n${s.prompt}`)
          .join('\n\n');
        sections.push(`## 已激活的技能\n${activePrompts}`);
      }
    }

    return sections.length > 0 ? sections.join('\n\n') + '\n\n' : '';
  }
```

**关键行为：**
- `activeSkillNames` 中的名称如果在 `allSkills` 中找不到，**静默忽略**，不报错、不注入
- 只有当 `allSkills` 中有匹配项时才生成"已激活的技能"段落
- 返回的字符串末尾带有 `\n\n`，方便拼接时作为分隔

### 3.4 修改 system prompt 构建逻辑（第 20-28 行）

**当前代码（第 20-28 行）：**

```typescript
    // 1. System prompt with tool list
    const toolsDesc = this.toolRegistry
      .getAllTools()
      .map((t) => `- **${t.name}**: ${t.description}`)
      .join('\n');
    messages.push({
      role: 'system',
      content: `${this.config.systemPrompt}\n\n## Available Tools\n${toolsDesc}`,
    });
```

**修改为：**

```typescript
    // 1. System prompt: 基础 prompt → Skill 上下文 → 工具列表
    const toolsDesc = this.toolRegistry
      .getAllTools()
      .map((t) => `- **${t.name}**: ${t.description}`)
      .join('\n');

    let systemContent = this.config.systemPrompt;

    // 注入 Skill 上下文（如果提供了参数）
    if (allSkills && allSkills.length > 0) {
      systemContent += '\n\n' + this.buildSkillSections(allSkills, activeSkillNames ?? []);
    }

    systemContent += `\n\n## Available Tools\n${toolsDesc}`;

    messages.push({
      role: 'system',
      content: systemContent,
    });
```

**最终 system prompt 结构（从上到下）：**

1. 基础 prompt（`this.config.systemPrompt`）
2. 可用技能列表（`## 可用技能`）— 仅当 `allSkills` 非空时注入
3. 已激活技能 prompt（`## 已激活的技能`）— 仅当有匹配的激活 skill 时注入
4. 工具列表（`## Available Tools`）

### 3.5 完整修改后的文件结构

修改后的 `context-builder.ts` 完整结构：

```
第 1-5 行：原有 import
第 6 行：  import type { Skill } from '@/shared/types/skill';（或 inline 定义）
第 7 行：  export class ContextBuilder {
第 8-12 行： constructor（不变）
第 14-19 行： build() 签名（新增 2 个可选参数）
第 20-42 行： build() 方法体（system prompt 构建逻辑修改）
第 43-55 行： 原有 conversation summary + browser context + messages（不变）
第 57-73 行： buildSkillSections()（新增私有方法）
第 75-88 行： convertToChatMessage()（不变）
```

## 4. 接口/契约

### 4.1 `build()` 方法签名

```typescript
async build(
  conversationId: string,
  currentBrowserContext: LowSensitivityContext,
  activeSkillNames?: string[],
  allSkills?: Skill[],
): Promise<ChatMessage[]>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `conversationId` | `string` | 是 | 会话 ID |
| `currentBrowserContext` | `LowSensitivityContext` | 是 | 当前浏览器上下文 |
| `activeSkillNames` | `string[]` | 否 | 已激活的 Skill 名称列表，默认 `undefined` |
| `allSkills` | `Skill[]` | 否 | 所有 Skill 列表，默认 `undefined` |

### 4.2 依赖的 `Skill` 类型（来自 T1）

```typescript
interface Skill {
  name: string;        // 技能名称（用于匹配 activeSkillNames）
  description: string; // 简短描述
  prompt: string;      // 完整系统指令（注入到 system prompt）
  enabled: boolean;    // 是否启用
}
```

### 4.3 `buildSkillSections()` 输出格式

当 `allSkills` 包含 2 个 skill，`activeSkillNames` 包含 1 个匹配项时：

```
## 可用技能
你可以使用 `skill` 工具激活以下技能。
- caveman: Ultra-compressed communication mode
- diagnose: Disciplined diagnosis loop

## 已激活的技能
### caveman
Ultra-compressed communication mode. Cuts token usage ~75%...

（此处省略 caveman 的完整 prompt 内容）
```

## 5. 测试指引

### 5.1 修改测试文件

**文件：`src/agent/__tests__/context-builder.test.ts`（修改）**

#### 5.1.1 新增辅助函数和测试数据（在 `defaultBrowserContext` 之后，`describe` 之前）

```typescript
// Skill 测试数据（inline 定义，不依赖 skill.ts 是否存在）
interface TestSkill {
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
}

const sampleSkills: TestSkill[] = [
  {
    name: 'caveman',
    description: 'Ultra-compressed communication mode',
    prompt: 'Speak in caveman style. Short sentences. No fluff.',
    enabled: true,
  },
  {
    name: 'diagnose',
    description: 'Disciplined diagnosis loop for hard bugs',
    prompt: 'When debugging: reproduce → minimise → hypothesise → instrument → fix.',
    enabled: true,
  },
];
```

#### 5.1.2 新增测试用例（在现有 `describe('ContextBuilder', ...)` 块末尾，第 185 行 `});` 之前）

**测试 1：向后兼容 — 不传可选参数时输出与修改前一致**

```typescript
  it('不传 skill 参数时输出与修改前一致（向后兼容）', async () => {
    const tools: ToolDefinition[] = [
      {
        name: 'tabs_query',
        description: '查询标签页',
        schema: { type: 'object', properties: {} },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn(),
      },
    ];
    const toolRegistry = createMockToolRegistry(tools);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    // 不传 activeSkillNames 和 allSkills
    const messages = await builder.build('conv-1', defaultBrowserContext);

    const first = messages[0]!;
    expect(first.content).toContain('You are a browser assistant.');
    expect(first.content).toContain('## Available Tools');
    expect(first.content).not.toContain('## 可用技能');
    expect(first.content).not.toContain('## 已激活的技能');
  });
```

**测试 2：仅传入 `allSkills` 时注入"可用技能"章节**

```typescript
  it('传入 allSkills 时 system prompt 包含可用技能列表', async () => {
    const tools: ToolDefinition[] = [];
    const toolRegistry = createMockToolRegistry(tools);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext, undefined, sampleSkills);

    const first = messages[0]!;
    expect(first.content).toContain('## 可用技能');
    expect(first.content).toContain('caveman: Ultra-compressed communication mode');
    expect(first.content).toContain('diagnose: Disciplined diagnosis loop for hard bugs');
    expect(first.content).toContain('你可以使用 `skill` 工具激活以下技能。');
    // 未传 activeSkillNames，不应有"已激活的技能"
    expect(first.content).not.toContain('## 已激活的技能');
  });
```

**测试 3：传入匹配的 `activeSkillNames` 时注入已激活技能 prompt**

```typescript
  it('传入匹配的 activeSkillNames 时注入已激活技能 prompt', async () => {
    const tools: ToolDefinition[] = [];
    const toolRegistry = createMockToolRegistry(tools);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build(
      'conv-1',
      defaultBrowserContext,
      ['caveman'],
      sampleSkills,
    );

    const first = messages[0]!;
    expect(first.content).toContain('## 可用技能');
    expect(first.content).toContain('## 已激活的技能');
    expect(first.content).toContain('### caveman');
    expect(first.content).toContain('Speak in caveman style. Short sentences. No fluff.');
    // diagnose 未激活，不应出现其 prompt
    expect(first.content).not.toContain('### diagnose');
    expect(first.content).not.toContain('When debugging');
  });
```

**测试 4：传入不匹配的 `activeSkillNames` 时不注入该 skill**

```typescript
  it('传入不匹配的 activeSkillNames 时不注入该 skill', async () => {
    const tools: ToolDefinition[] = [];
    const toolRegistry = createMockToolRegistry(tools);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build(
      'conv-1',
      defaultBrowserContext,
      ['nonexistent-skill'],
      sampleSkills,
    );

    const first = messages[0]!;
    // 可用技能列表仍然存在
    expect(first.content).toContain('## 可用技能');
    // 但没有匹配的激活 skill，不应有"已激活的技能"章节
    expect(first.content).not.toContain('## 已激活的技能');
  });
```

**测试 5：多个技能同时激活**

```typescript
  it('多个技能同时激活时全部注入', async () => {
    const tools: ToolDefinition[] = [];
    const toolRegistry = createMockToolRegistry(tools);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build(
      'conv-1',
      defaultBrowserContext,
      ['caveman', 'diagnose'],
      sampleSkills,
    );

    const first = messages[0]!;
    expect(first.content).toContain('### caveman');
    expect(first.content).toContain('Speak in caveman style');
    expect(first.content).toContain('### diagnose');
    expect(first.content).toContain('When debugging');
  });
```

**测试 6：`allSkills` 为空数组时无 skill 相关章节**

```typescript
  it('allSkills 为空数组时不注入任何 skill 章节', async () => {
    const tools: ToolDefinition[] = [];
    const toolRegistry = createMockToolRegistry(tools);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext, ['caveman'], []);

    const first = messages[0]!;
    expect(first.content).not.toContain('## 可用技能');
    expect(first.content).not.toContain('## 已激活的技能');
  });
```

**测试 7：system prompt 中章节顺序正确**

```typescript
  it('system prompt 中章节顺序：基础 prompt → 技能列表 → 已激活技能 → 工具列表', async () => {
    const tools: ToolDefinition[] = [
      {
        name: 'tabs_query',
        description: '查询标签页',
        schema: { type: 'object', properties: {} },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn(),
      },
    ];
    const toolRegistry = createMockToolRegistry(tools);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build(
      'conv-1',
      defaultBrowserContext,
      ['caveman'],
      sampleSkills,
    );

    const content = messages[0]!.content!;

    const baseIdx = content.indexOf('You are a browser assistant.');
    const skillsIdx = content.indexOf('## 可用技能');
    const activeIdx = content.indexOf('## 已激活的技能');
    const toolsIdx = content.indexOf('## Available Tools');

    expect(baseIdx).toBeGreaterThanOrEqual(0);
    expect(skillsIdx).toBeGreaterThan(baseIdx);
    expect(activeIdx).toBeGreaterThan(skillsIdx);
    expect(toolsIdx).toBeGreaterThan(activeIdx);
  });
```

### 5.2 运行测试

```bash
# 运行 ContextBuilder 相关测试
npx vitest run src/agent/__tests__/context-builder.test.ts

# 确保所有已有测试仍然通过
npx vitest run src/agent/__tests__/
```

预期结果：
- 新增 7 个测试用例全部通过
- 原有 5 个测试用例（"正常构建上下文"、"有会话摘要"、"有浏览器上下文"、"有历史消息"、"工具列表正确"）全部通过
- 共 12 个测试用例，零失败

## 6. 验收标准

- [ ] `build()` 方法签名新增 `activeSkillNames?: string[]` 和 `allSkills?: Skill[]` 两个可选参数
- [ ] 不传可选参数时，`build()` 输出与修改前完全一致（向后兼容）
- [ ] 传入 `allSkills` 时，system prompt 包含 `## 可用技能` 章节，列出每个 skill 的 name 和 description
- [ ] 传入匹配的 `activeSkillNames` 时，system prompt 包含 `## 已激活的技能` 章节，注入对应 skill 的完整 prompt
- [ ] 传入不匹配的 `activeSkillNames` 时，静默忽略，不注入该 skill，也不报错
- [ ] system prompt 章节顺序：基础 prompt → 可用技能 → 已激活技能 → Available Tools
- [ ] 新增私有方法 `buildSkillSections()` 不暴露到类外部
- [ ] 单元测试覆盖所有组合（7 个新增用例 + 5 个原有用例 = 12 个）
- [ ] `npx vitest run src/agent/__tests__/context-builder.test.ts` 全部通过
- [ ] `npx tsc --noEmit` 编译通过

## 7. 风险点及对策

| 风险 | 影响 | 对策 |
|------|------|------|
| T1 未完成，`Skill` 类型不存在 | import 编译失败 | 使用 inline `Skill` 类型定义（见 3.1 节），T1 完成后替换为正式 import |
| `activeSkillNames` 包含大量 skill 导致 prompt 过长 | 超出 token 限制 | 当前不做截断，后续可在调用方（AgentLoop）层面控制激活数量上限 |
| `buildSkillSections()` 返回空字符串时的拼接 | 多余的 `\n\n` | `buildSkillSections()` 仅在非空时返回，调用方拼接时用 `\n\n` 作为分隔是安全的（空字符串不会被追加） |
| `allSkills` 中 skill 的 `prompt` 字段为空 | 注入空白章节 | `buildSkillSections()` 不检查 prompt 是否为空，由调用方保证数据完整性 |

## 8. 注意事项

1. **不修改 `ContextBuilder` 构造函数**：Skill 数据通过 `build()` 方法参数传入，而非构造函数注入。这样设计是因为 Skill 列表可能动态变化（用户增删 skill、启用/禁用），每次调用 `build()` 时由调用方（AgentLoop）传入最新数据更灵活。
2. **`activeSkillNames` 和 `allSkills` 解耦**：`allSkills` 是完整的 skill 定义列表，`activeSkillNames` 只是名称引用。调用方负责确保 `activeSkillNames` 中的名称在 `allSkills` 中存在，不存在时静默忽略。
3. **不修改 `AgentRunInput` 接口**：Skill 相关参数不在 `AgentRunInput` 层面传递，而是由 `AgentLoop` 在调用 `ContextBuilder.build()` 时自行组装。这样避免修改 `agent.ts` 类型定义，降低耦合。
4. **与 `AgentLoop` 的集成留到后续任务**：本任务仅修改 `ContextBuilder`，不涉及 `AgentLoop` 如何获取 skill 数据并传入。
5. **保持与现有代码风格一致**：注释使用中文，方法名使用 camelCase，私有方法用 `private` 关键字。
6. **测试文件中的 `TestSkill` 类型**：为了避免测试依赖 `src/shared/types/skill.ts`（T1 可能未完成），测试中 inline 定义 `TestSkill` 接口。T1 完成后可替换为正式 import。
