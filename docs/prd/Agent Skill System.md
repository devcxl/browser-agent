# PRD: Agent Skill System

**项目:** Browser Agent
**日期:** 2026-06-21
**状态:** Draft
**关联:** [Browser Agent PRD](./Browser%20Agent.md)

---

## 1. 概述

### 1.1 问题陈述

当前 Browser Agent 的行为完全由固定的 system prompt 和注册的工具集定义。用户无法根据不同的使用场景（如"翻译助手"、"代码审查"、"标签页整理"）动态调整 agent 的行为模式。agent 在所有对话中都表现得千篇一律，缺乏领域适配能力。

### 1.2 目标用户

- 使用 Browser Agent 的开发者/高级用户
- 希望根据不同场景定制 agent 行为的人
- 希望复用和分享 skill 模板的用户

### 1.3 成功指标

- 用户可以创建、编辑、启用/禁用 skill
- Agent 能在对话中自动识别场景并激活对应 skill
- 激活 skill 后 agent 的行为符合 skill 定义的指令
- Skill 数据通过 chrome.storage.local 持久化，支持浏览器账号同步

---

## 2. 功能需求

### 2.1 核心功能（MVP）

- [ ] **F1: Skill 数据模型** — 每个 skill 包含 `name`（名称）、`description`（描述，用于 agent 自动匹配）、`prompt`（注入的指令内容）、`enabled`（软禁用开关）
- [ ] **F2: Skill 存储** — Skill 数据存储在 `chrome.storage.local`，接入浏览器云服务同步（通过 Chrome 账号自动同步 storage 数据）
- [ ] **F3: Skill CRUD 管理 UI** — 在现有 Sidepanel UI 中新增 skill 管理页面（tab 切换），支持创建、编辑、删除、启用/禁用 skill
- [ ] **F4: Skill 自动匹配** — 在 system prompt 中列出所有已启用 skill 的 name 和 description，让 LLM 自行判断是否需要激活某个 skill
- [ ] **F5: `skill` 伪 tool** — 注册一个名为 `skill` 的特殊 tool，LLM 调用它来声明激活哪些 skill（可多次调用激活多个）。agent loop 拦截该 tool call（不执行 Chrome API），将对应 skill 的 prompt 注入下一轮 system prompt
- [ ] **F6: Prompt 注入** — 激活的 skill prompt 追加到 system prompt 末尾，格式为 `\n\n## 已激活的技能\n### {name}\n{prompt}`
- [ ] **F7: 每轮可切换** — 每轮对话开始时，LLM 可以重新调用 `skill` tool 来激活不同的 skill 组合，上一轮的 skill prompt 自动清除
- [ ] **F8: 软禁用** — 被禁用的 skill 保留在存储中（`enabled: false`），不参与自动匹配，不注入 prompt。用户可以随时重新启用

### 2.2 扩展功能（后续迭代）

- [ ] E1: Skill 模板市场（预设 skill 模板，一键导入）
- [ ] E2: Skill 导入/导出（JSON 格式）
- [ ] E3: 基于对话历史自动推荐 skill
- [ ] E4: Skill prompt 中支持变量替换（如 `{{tab.title}}`）

### 2.3 非功能需求

- **性能：** skill 匹配和 prompt 注入不应增加超过 50ms 的 LLM 调用延迟
- **安全：** 完全信任用户，skill prompt 不受 guardrail 限制（skill 是用户自定义指令，风险自担）
- **可用性：** Skill 管理 UI 应直观简洁，操作延迟 <100ms
- **存储：** `chrome.storage.local` 配额足够（单 skill 预估 <2KB，100 个 skill 约 200KB，远低于 5MB 限制）

---

## 3. 用户故事

### US-1: 创建 Skill

**作为** Browser Agent 用户
**我想要** 创建一个自定义 skill，定义名称、描述和指令内容
**以便** agent 能在特定场景下按照我的指令工作

**验收标准：**
- [ ] 在 skill 管理页面点击"新建 Skill"
- [ ] 填写 name、description、prompt 三个字段
- [ ] 保存后 skill 出现在列表中，默认启用
- [ ] 数据持久化到 chrome.storage.local

### US-2: 自动激活 Skill

**作为** Browser Agent 用户
**我想要** agent 在对话中自动识别我的意图并激活对应的 skill
**以便** 我无需手动切换，agent 就能以合适的模式工作

**验收标准：**
- [ ] 已启用的 skill 在 system prompt 中列出（name + description）
- [ ] 当用户说"帮我翻译这段文字"时，agent 自动调用 `skill("翻译助手")` 激活对应 skill
- [ ] 激活后 agent 的行为符合 skill prompt 中的指令
- [ ] 下一轮对话中，agent 可以根据新意图切换到不同的 skill

### US-3: 管理 Skill

**作为** Browser Agent 用户
**我想要** 在 Sidepanel 中查看、编辑、删除、启用/禁用 skill
**以便** 灵活管理我的 skill 集合

**验收标准：**
- [ ] Sidepanel 中有独立的 Skill 管理 tab
- [ ] 列表展示所有 skill（名称、描述摘要、启用状态）
- [ ] 点击 skill 可编辑 name/description/prompt
- [ ] 点击开关可启用/禁用 skill
- [ ] 删除 skill 需确认

---

## 4. 约束与假设

### 4.1 技术约束

- 项目使用 WXT 框架 + React + TypeScript
- 存储方案为 `chrome.storage.local`（已在项目中用于 Provider 配置）
- Agent loop 在 Chat Page 环境中运行（非 background）
- Tool Registry 支持注册伪 tool（不执行 Chrome API 的 tool）

### 4.2 业务约束

- Skill 系统是 Browser Agent 的 MVP 核心功能
- 不改变现有 guardrail 逻辑，skill prompt 不受 guardrail 过滤
- `chrome.storage.sync` 配额过小（100KB），不适合存储 skill prompt 全文，仅使用 `chrome.storage.local`

### 4.3 假设

- `chrome.storage.local` 的数据会通过 Chrome 账号同步（用户已登录 Chrome 账号）
- 用户理解 skill prompt 会被注入到 LLM 上下文中
- LLM 有能力根据 description 文本判断是否需要激活 skill

---

## 5. 不在范围内

- 不做 skill 模板市场/分享功能
- 不做 skill prompt 中的变量替换
- 不做基于 embedding 的语义匹配
- 不做 skill 的导入/导出
- 不修改 guardrail 机制
- 不做 skill 冲突检测（多个 skill 指令矛盾时不警告）

---

## 6. 附录

### 6.1 Skill 数据模型定义

```typescript
interface Skill {
  id: string;           // UUID
  name: string;         // 技能名称，如 "翻译助手"
  description: string;  // 描述，用于 LLM 自动匹配，如 "当你需要翻译文本时激活此技能"
  prompt: string;       // 注入到 system prompt 的指令内容
  enabled: boolean;     // 是否启用
  createdAt: number;    // 创建时间戳
  updatedAt: number;    // 更新时间戳
}
```

### 6.2 `skill` tool 的 ToolDefinition 结构

```typescript
const skillTool: ToolDefinition = {
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
  category: 'expert' as ToolCategory,  // 复用现有 category 或新增
  riskLevel: 'low',
  confirmationRequired: false,
  resultSensitivity: 'low',
  execute: async () => ({ success: true }),  // 伪 tool，不执行实际操作
};
```

### 6.3 System Prompt 注入格式

```
## 可用技能

你可以使用 `skill` 工具激活以下技能。激活后，技能的指令会注入到你的系统提示中。

{已启用的 skill 列表，格式为 "- {name}: {description}"}

## 已激活的技能

### {name1}
{prompt1}

### {name2}
{prompt2}
```

### 6.4 chrome.storage.local 存储 Key

- Key: `skills` — 值为 `Skill[]` 数组

### 6.5 参考资料

- [Chrome Extension Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- 项目现有 storage 方案：`src/shared/storage/config-store.ts`
- 项目现有 Tool Registry：`src/registry/tool-registry.ts`
