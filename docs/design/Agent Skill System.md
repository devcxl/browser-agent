# 技术方案: Agent Skill System

**日期:** 2026-06-21
**状态:** Draft

---

## 1. 技术栈

| 层级 | 技术选型 | 理由 |
|------|---------|------|
| 前端 UI | React 18 + TypeScript 5 + TailwindCSS 4 | 复用项目现有技术栈，与 sidepanel 保持一致 |
| 存储 | `chrome.storage.local` + 项目现有 `ConfigStore` 封装 | 已封装好单例模式、类型安全、变更监听；不引入新依赖 |
| 数据模型 | TypeScript interface `Skill` | 纯前端无后端，类型定义即数据模型 |
| Skill 注册 | `ToolRegistry` 注册 `skill` 伪 tool | 复用现有 tool 注册/发现机制，LLM 通过 function calling 触发 |
| Prompt 注入 | `ContextBuilder.build()` 扩展 | 在构建 system prompt 时动态注入 skill 信息 |
| Agent Loop 拦截 | `AgentLoop.run()` 中特殊处理 `skill` tool call | 最小改动，skill tool 不经过 guardrail/execute |

---

## 2. 架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Sidepanel UI (React)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │ ChatView │  │ SkillPanel│  │ Settings  │  │Conversation│ │
│  │          │  │ (新增)    │  │ Panel    │  │ Sidebar    │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │ hooks
┌────────────────────────▼────────────────────────────────────┐
│                     ChatContext / useAgent                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 AgentLoop (核心循环)                   │  │
│  │                                                       │  │
│  │  activeSkillNames: string[]  ◄── skill tool 拦截      │  │
│  │  allSkills: Skill[]          ◄── SkillStore 提供      │  │
│  │        │                                              │  │
│  │        ▼                                              │  │
│  │  ContextBuilder.build(id, ctx, activeSkills, skills)  │  │
│  │        │                                              │  │
│  │        ▼                                              │  │
│  │  System Prompt 构建:                                   │  │
│  │  1. 基础 system prompt                                │  │
│  │  2. 可用技能列表 (name + description)                  │  │
│  │  3. 已激活技能 prompt 注入                            │  │
│  │  4. Available Tools                                   │  │
│  │  5. Summary + Context + Messages                      │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                     Storage Layer                          │
│  ┌──────────────┐  ┌────────────────────────────────────┐  │
│  │ ConfigStore  │  │ SkillStore (新增)                  │  │
│  │ providers    │  │  - getAll(): Skill[]               │  │
│  │ agentSettings│  │  - save(skills): void              │  │
│  │ expertMode   │  │  - onChange(cb): () => void       │  │
│  │ skills (新增) │  │  - getEnabled(): Skill[]          │  │
│  └──────────────┘  └────────────────────────────────────┘  │
│                         │                                   │
│                  chrome.storage.local                       │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流向

```
用户创建 Skill → SkillPanel → SkillStore.save() → chrome.storage.local
                                                         │
用户发送消息 ────────────────────────────────────────────┼────────
                                                         │
useAgent.run()                                           │
  ├── SkillStore.getEnabled() ──→ 获取启用的 skill 列表   │
  ├── AgentLoop.run()                                    │
  │   ├── ContextBuilder.build()                         │
  │   │   ├── 注入可用 skill 列表到 system prompt         │
  │   │   └── 注入已激活 skill 的 prompt                 │
  │   ├── LLM chat (含 skill tool schema)                │
  │   ├── LLM 返回 tool_calls (含 skill tool call)       │
  │   ├── 拦截 skill tool call → 更新 activeSkillNames   │
  │   ├── 下一轮: ContextBuilder 注入新激活的 skill       │
  │   └── 循环直至 stop                                  │
```

---

## 3. 模块拆分

### 3.1 模块列表

| 序号 | 模块 | 职责 | 依赖 |
|------|------|------|------|
| M1 | `Skill` 类型定义 | 定义 Skill 数据模型 | 无 |
| M2 | `SkillStore` | Skill 数据持久化（CRUD + 变更监听） | M1, ConfigStore |
| M3 | `StorageSchema` 扩展 | 在 chrome.storage.local schema 中加入 skills 字段 | M1 |
| M4 | `skill` 伪 tool 注册 | 创建 ToolDefinition，注册到 ToolRegistry | M1, ToolRegistry |
| M5 | `ContextBuilder` 扩展 | 支持 skill 列表注入和已激活 skill prompt 注入 | M1 |
| M6 | `AgentLoop` skill 拦截 | 在 tool call 处理循环中拦截 skill tool，维护 activeSkillNames | M5 |
| M7 | `SkillPanel` UI 组件 | Skill 管理页面（列表/创建/编辑/删除/启用禁用） | M1, M2 |
| M8 | `AgentConfig` 扩展 | 将 allSkills/activeSkillNames 传递给 AgentLoop | M1 |

### 3.2 模块接口设计

#### M1: Skill 类型定义

文件: `src/shared/types/skill.ts`（新增）

```typescript
/** Skill 数据模型 */
export interface Skill {
  id: string;           // UUID
  name: string;         // 技能名称
  description: string;  // 描述，用于 LLM 自动匹配
  prompt: string;       // 注入到 system prompt 的指令内容
  enabled: boolean;     // 是否启用
  createdAt: number;    // 创建时间戳
  updatedAt: number;    // 更新时间戳
}

/** Skill Store 接口 */
export interface ISkillStore {
  getAll(): Promise<Skill[]>;
  getEnabled(): Promise<Skill[]>;
  save(skills: Skill[]): Promise<void>;
  add(skill: Skill): Promise<void>;
  update(id: string, patch: Partial<Skill>): Promise<void>;
  remove(id: string): Promise<void>;
  onChange(callback: (skills: Skill[]) => void): () => void;
}
```

#### M2: SkillStore 实现

文件: `src/shared/storage/skill-store.ts`（新增）

```typescript
export class SkillStore implements ISkillStore {
  private static instance: SkillStore | null = null;
  static getInstance(): SkillStore { /* 单例 */ }

  // 存储 key: 'skills'
  async getAll(): Promise<Skill[]> { /* 从 chrome.storage.local 读取 */ }
  async getEnabled(): Promise<Skill[]> { /* 过滤 enabled: true */ }
  async save(skills: Skill[]): Promise<void> { /* 全量替换 */ }
  async add(skill: Skill): Promise<void> { /* 追加 */ }
  async update(id: string, patch: Partial<Skill>): Promise<void> { /* 部分更新 */ }
  async remove(id: string): Promise<void> { /* 删除 */ }
  onChange(callback: (skills: Skill[]) => void): () => void { /* 监听变更 */ }
}
```

#### M3: StorageSchema 扩展

文件: `src/shared/types/storage.ts`（修改）

在 `StorageSchema` 接口中新增字段：
```typescript
export interface StorageSchema {
  // ... 现有字段
  /** Skill 列表 */
  skills: Skill[];
}
```

#### M4: skill 伪 tool 定义

文件: `src/tools/skill-tool.ts`（新增）

```typescript
import type { ToolDefinition } from '@/registry/types';

export function createSkillTool(): ToolDefinition {
  return {
    name: 'skill',
    description: '激活一个技能（skill），加载该技能的上下文指令。当你识别到用户意图匹配某个技能时，调用此工具激活它。可以多次调用以激活多个技能。',
    schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '要激活的技能名称',
        },
      },
      required: ['name'],
    },
    category: 'expert',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low',
    execute: async (params) => {
      // 伪 tool: 实际拦截在 AgentLoop 中，这里只返回成功
      return { success: true, data: { activated: params.name } };
    },
  };
}
```

#### M5: ContextBuilder 扩展

文件: `src/agent/context-builder.ts`（修改）

`build()` 方法签名变更：
```typescript
async build(
  conversationId: string,
  currentBrowserContext: LowSensitivityContext,
  activeSkillNames?: string[],   // 新增: 当前激活的 skill 名称列表
  allSkills?: Skill[],           // 新增: 所有已启用的 skill 列表
): Promise<ChatMessage[]>
```

System prompt 构建顺序：
1. `this.config.systemPrompt`（基础 system prompt）
2. 可用技能列表（如 `## 可用技能\n- {name}: {description}`）
3. 已激活技能 prompt（如 `## 已激活的技能\n### {name}\n{prompt}`）
4. Available Tools（现有逻辑）
5. Conversation Summary（现有逻辑）
6. Browser Context（现有逻辑）
7. Recent Messages（现有逻辑）

#### M6: AgentLoop skill 拦截

文件: `src/agent/agent-loop.ts`（修改）

关键改动点：

1. 构造函数或 `run()` 中接收 `allSkills: Skill[]` 参数
2. `run()` 内部维护 `activeSkillNames: Set<string>`
3. 在 tool call 处理循环中，`getTool(name)` 之后、guardrail 之前，增加判断：
```typescript
if (tc.function.name === 'skill') {
  const skillName = params.name as string;
  const skill = allSkills.find(s => s.name === skillName);
  if (skill) {
    activeSkillNames.add(skillName);
    // 伪造 tool result: { success: true, data: { activated: skillName } }
    const toolMsg = { role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ success: true, data: { activated: skillName } }) };
    messages.push(toolMsg);
    // 持久化 tool 消息
    await this.conversationManager.addMessage(...);
    // 下一轮 contextBuilder.build() 时传入 activeSkillNames
    continue; // 跳过 guardrail + execute
  }
}
```
4. 每轮开始时，重新调用 `contextBuilder.build(conversationId, ctx, [...activeSkillNames], allSkills)`，使 skill prompt 注入生效

#### M7: SkillPanel UI 组件

文件: `src/entrypoints/sidepanel/components/SkillPanel.tsx`（新增）

Props:
```typescript
interface SkillPanelProps {
  onClose: () => void;
}
```

内部状态管理：
- 使用 `useState` 管理 skill 列表、编辑状态
- 使用 `useEffect` 从 `SkillStore` 加载数据
- 使用 `SkillStore.onChange` 监听外部变更（如其他窗口修改）

UI 布局：
- 模态弹窗（与 SettingsPanel 风格一致）
- 顶部标题栏："技能管理"
- Skill 列表：每行显示 name、description 摘要、启用开关、编辑/删除按钮
- 底部"新建技能"按钮
- 编辑模式：表单（name/description/prompt），保存/取消按钮
- 删除需确认

#### M8: AgentConfig 扩展 + useAgent 适配

文件: `src/shared/types/agent.ts`（修改）

`AgentConfig` 新增可选字段（或通过 `AgentRunInput` 传递）：
```typescript
// 不修改 AgentConfig，改为在 AgentRunInput 中新增
export interface AgentRunInput {
  // ... 现有字段
  skills?: Skill[];          // 新增: 所有已启用 skill
  activeSkills?: string[];   // 新增: 初始激活的 skill 名称（预留，MVP 始终为空）
}
```

文件: `src/entrypoints/sidepanel/hooks/useAgent.ts`（修改）

在 `run()` 方法中：
1. 调用 `SkillStore.getInstance().getEnabled()` 获取启用的 skill 列表
2. 传递给 `AgentLoop.run()` 的 `AgentRunInput`

---

## 4. 接口设计

### 4.1 Skill Store 内部接口（非 HTTP API，同进程调用）

| 方法 | 描述 | 参数 | 返回值 |
|------|------|------|--------|
| `getAll()` | 获取所有 skill | - | `Promise<Skill[]>` |
| `getEnabled()` | 获取已启用的 skill | - | `Promise<Skill[]>` |
| `save(skills)` | 全量保存 | `Skill[]` | `Promise<void>` |
| `add(skill)` | 添加单个 skill | `Skill` | `Promise<void>` |
| `update(id, patch)` | 部分更新 | `string, Partial<Skill>` | `Promise<void>` |
| `remove(id)` | 删除 | `string` | `Promise<void>` |
| `onChange(cb)` | 监听变更 | `(Skill[]) => void` | `() => void`（取消监听） |

### 4.2 Skill Tool Schema（OpenAI Function Calling 格式）

```json
{
  "type": "function",
  "function": {
    "name": "skill",
    "description": "激活一个技能（skill），加载该技能的上下文指令。当你识别到用户意图匹配某个技能时，调用此工具激活它。可以多次调用以激活多个技能。",
    "parameters": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "要激活的技能名称"
        }
      },
      "required": ["name"]
    }
  }
}
```

### 4.3 System Prompt 注入格式

```
{基础 system prompt}

## 可用技能

你可以使用 `skill` 工具激活以下技能。激活后，技能的指令会注入到你的系统提示中。

- 翻译助手: 当你需要翻译文本时激活此技能
- 代码审查: 当你需要审查代码时激活此技能

## 已激活的技能

### 翻译助手
你是一个专业的翻译助手。翻译时遵循以下原则：
1. 保持原文的语气和风格
2. 优先使用地道的中文表达
3. 对于专业术语，保留英文原文并附中文翻译

## Available Tools
- tabs_query: ...
- ...
```

### 4.4 关键数据模型

```typescript
// 已在上文 M1 中定义，此处不重复
interface Skill { ... }
interface ISkillStore { ... }
```

### 4.5 错误处理

| 场景 | 处理方式 |
|------|----------|
| Skill 名称重复 | 创建/更新时检查，返回错误提示 |
| 激活不存在的 skill | skill tool 返回 `{ success: false, error: "技能 'xxx' 不存在" }` |
| 存储配额超限 | chrome.storage.local 5MB 配额，100 个 skill ≈ 200KB，不会超限；若超限则提示用户清理 |
| 并发编辑冲突 | `SkillStore.update()` 基于最新数据做部分更新，避免覆盖 |

---

## 5. 关键决策

| 决策 | 方案 | 备选方案 | 理由 |
|------|------|----------|------|
| skill tool 拦截位置 | AgentLoop 中判断 `name === 'skill'` 后 continue，跳过 guardrail/execute | 在 guardrail 中为 skill 添加豁免规则 | AgentLoop 是唯一需要感知 skill 激活的地方，集中处理更清晰 |
| activeSkillNames 生命周期 | 每轮对话开始时清空，LLM 可重新激活 | 跨轮累积，需手动 deactivate | PRD 要求"每轮可切换"，清空重激活最简单 |
| skill prompt 注入位置 | ContextBuilder 的 system prompt 中，在 tools 列表之前 | 作为独立 system message | 减少 message 数量，且 skill 指令应该与 system prompt 同层级 |
| 存储方案 | `chrome.storage.local`，复用 `ConfigStore` 模式 | 新建独立 storage helper | 复用现有封装，风格一致 |
| UI 入口 | 独立模态弹窗（`SkillPanel`），从 Header 或 Settings 入口打开 | 在 SettingsPanel 中增加 tab | 独立弹窗交互更清晰，与 SettingsPanel 风格一致但不耦合 |
| 是否修改 AgentConfig | 不修改，通过 `AgentRunInput` 传递 skill 数据 | 修改 AgentConfig 增加 skills 字段 | skills 是运行时上下文，不是 Agent 的静态配置 |

---

## 6. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| LLM 不理解 skill 匹配机制 | skill 从未被激活 | 中 | 在 system prompt 中提供清晰的匹配指引；可后续添加 few-shot 示例 |
| LLM 过度激活 skill | 无关 skill 被激活，浪费 token | 中 | skill prompt 一般较短（<1KB），影响有限；可在 prompt 中强调"仅在明确需要时激活" |
| 多轮对话中 skill prompt 累积 | 上下文窗口被占满 | 低 | 每轮清除上一轮激活的 skill；单个 skill prompt 应 <2KB |
| chrome.storage.local 同步延迟 | 跨设备 skill 不同步 | 低 | Chrome 账号同步通常 <1 分钟；`onChange` 监听可实时同步同设备内的变更 |
| Skill 数据迁移 | 未来字段变更导致旧数据不兼容 | 低 | 在 `SkillStore.getAll()` 中添加数据校验和默认值填充 |

---

## 7. 实施计划

### 7.1 子任务拆分

| 阶段 | 任务 | 预估改动量 | 验收标准 | 依赖 |
|------|------|-----------|----------|------|
| **Phase 1: 数据层** | | | | |
| T1 | 创建 `Skill` 类型定义 (`skill.ts`) | 1 个新文件 | TypeScript 编译通过 | 无 |
| T2 | 扩展 `StorageSchema` 增加 `skills` 字段 | 修改 1 个文件 | 类型检查通过 | T1 |
| T3 | 实现 `SkillStore` | 1 个新文件 | 单元测试通过（CRUD + 监听） | T1, T2 |
| **Phase 2: 后端逻辑** | | | | |
| T4 | 创建 `skill` 伪 tool (`skill-tool.ts`) | 1 个新文件 | 注册到 ToolRegistry 后 `toOpenAISchema()` 包含 skill tool | T1 |
| T5 | 扩展 `ContextBuilder.build()` 支持 skill 注入 | 修改 1 个文件 | 单元测试：验证 system prompt 包含 skill 信息 | T1 |
| T6 | 在 `AgentLoop` 中拦截 skill tool call | 修改 1 个文件 | 集成测试：模拟 skill tool call，验证 prompt 注入 | T1, T5 |
| T7 | 在 `useAgent` 中集成 SkillStore | 修改 1 个文件 | 端到端：发送消息后 LLM 能调用 skill tool | T3, T4, T6 |
| **Phase 3: 前端 UI** | | | | |
| T8 | 创建 `SkillPanel` 组件 | 1 个新文件 | UI 截图/手动测试：创建/编辑/删除/启禁用 | T3 |
| T9 | 在 `App.tsx` 中集成 SkillPanel 入口 | 修改 1 个文件 | 手动测试：从 Header 打开 SkillPanel | T8 |
| **Phase 4: 测试** | | | | |
| T10 | 端到端测试 | 修改 E2E 测试 | E2E 测试通过 | T1-T9 |

### 7.2 风险点及对策

- **T6 AgentLoop 拦截**：是核心改动，需要仔细处理 tool call 循环中的 continue 逻辑，避免影响正常 tool call 流程。对策：先写单元测试覆盖 skill tool 分支。
- **T5 ContextBuilder 扩展**：签名变更影响 `AgentLoop` 中的调用点。对策：新增参数设为可选，默认 `undefined`，向后兼容。
- **T9 App.tsx 集成**：需要在不破坏现有 UI 布局的前提下添加入口。对策：在 Header 区域添加图标按钮，复用现有按钮样式。

---

## 8. 非功能需求实现方案

- **性能**：skill 匹配和 prompt 注入在 `ContextBuilder.build()` 中同步完成（纯字符串拼接），延迟 <1ms，不影响 LLM 调用延迟。
- **安全**：skill tool 不经过 guardrail（在 guardrail 之前被拦截），skill prompt 不经过 guardrail 过滤。完全信任用户。
- **可用性**：SkillPanel UI 操作均为同步存储操作（chrome.storage.local.set），延迟 <10ms。
- **存储**：`chrome.storage.local` 配额 5MB，单 skill <2KB，100 个 skill ≈ 200KB，远低于限制。

---

## 9. 不在范围内

- 不做 skill 模板市场/分享功能
- 不做 skill prompt 中的变量替换
- 不做基于 embedding 的语义匹配
- 不做 skill 的导入/导出
- 不修改 guardrail 机制
- 不做 skill 冲突检测

---

## 10. 附录: 关键代码片段

### A. Skill tool 在 AgentLoop 中的拦截逻辑

```typescript
// 在 agent-loop.ts 的 run() 方法中，getTool() 之后、guardrail 之前插入：

if (tc.function.name === 'skill') {
  const skillName = params.name as string;
  const skill = this.allSkills.find(s => s.name === skillName);
  const result = skill
    ? { success: true, data: { activated: skillName } }
    : { success: false, error: `技能 "${skillName}" 不存在` };

  if (skill) {
    activeSkillNames.add(skillName);
  }

  toolCalls.push({
    toolName: 'skill',
    params,
    result,
    riskLevel: 'low',
    confirmed: false,
    timestamp: Date.now(),
    toolCallId: tc.id,
  });

  const toolMsg = {
    role: 'tool' as const,
    tool_call_id: tc.id,
    content: JSON.stringify(result),
  };
  messages.push(toolMsg);
  await this.conversationManager.addMessage(input.conversationId, {
    id: crypto.randomUUID(),
    role: 'tool',
    content: toolMsg.content,
    toolCallId: tc.id,
    timestamp: Date.now(),
  });
  this.hooks?.onToolCall?.(toolCalls[toolCalls.length - 1]);
  continue; // 跳过 guardrail 和 execute
}
```

### B. ContextBuilder 中 skill prompt 注入逻辑

```typescript
// 在 build() 方法中，system prompt 之后、tools 列表之前：

// 注入可用技能列表
if (allSkills && allSkills.length > 0) {
  const skillList = allSkills
    .map(s => `- ${s.name}: ${s.description}`)
    .join('\n');
  systemContent += `\n\n## 可用技能\n\n你可以使用 \`skill\` 工具激活以下技能。激活后，技能的指令会注入到你的系统提示中。\n\n${skillList}`;
}

// 注入已激活技能的 prompt
if (activeSkillNames && activeSkillNames.length > 0) {
  const activePrompts = activeSkillNames
    .map(name => {
      const skill = allSkills?.find(s => s.name === name);
      return skill ? `### ${skill.name}\n${skill.prompt}` : null;
    })
    .filter(Boolean)
    .join('\n\n');
  if (activePrompts) {
    systemContent += `\n\n## 已激活的技能\n\n${activePrompts}`;
  }
}
```
