# 开发文档: T6 - AgentLoop 中拦截 skill tool call

**Project:** Agent Skill System
**Task ID:** T6
**Slug:** intercept-skill-in-agent-loop
**Issue:** #79
**类型:** backend
**Batch:** 3
**依赖:** T1 (define-skill-types), T5 (extend-context-builder)

---

## 1. 目标

修改 `AgentLoop.run()` 方法，实现 skill tool call 的拦截逻辑：

1. 接收 `allSkills: Skill[]` 参数（通过 `AgentRunInput.skills`）
2. 维护 `activeSkillNames: Set<string>`，每轮 `run()` 调用时初始化为空
3. 在 tool call 处理循环中，`getTool(name)` 之后、guardrail 之前，拦截 `name === 'skill'` 的调用
4. 匹配到 skill → 加入 `activeSkillNames`，伪造 tool result，`continue` 跳过 guardrail 和 execute
5. 每轮 while 循环开始时重新调用 `contextBuilder.build()`，传入当前 `activeSkillNames`，使 skill prompt 在下一轮生效
6. **关键架构变更**：`messages` 初始化从 while 循环外移到循环内（每轮重建），确保 skill 激活后下一轮 prompt 立即生效

---

## 2. 前置条件

- **T1 必须已完成**：`src/shared/types/skill.ts` 中的 `Skill` 接口已定义且 `index.ts` 已 re-export
- **T5 必须已完成**：`ContextBuilder.build()` 签名已扩展为 `build(conversationId, ctx, activeSkillNames?, allSkills?)`

### 2.1 验证前置条件

```bash
# 检查 T1
test -f src/shared/types/skill.ts && echo "T1 OK" || echo "T1 NOT DONE"

# 检查 T5 — 验证 ContextBuilder.build() 新签名
grep -q 'activeSkillNames' src/agent/context-builder.ts && echo "T5 OK" || echo "T5 NOT DONE"
```

---

## 3. 实现步骤

### 3.1 修改 `AgentRunInput` 类型（`src/shared/types/agent.ts`）

**当前代码（第 21-27 行）：**

```typescript
export interface AgentRunInput {
  conversationId: string;
  userMessage: string;
  providerConfig: ProviderConfig;
  browserContext: LowSensitivityContext;
  abortSignal?: AbortSignal;
}
```

**修改为：**

```typescript
import type { Skill } from './skill';

export interface AgentRunInput {
  conversationId: string;
  userMessage: string;
  providerConfig: ProviderConfig;
  browserContext: LowSensitivityContext;
  abortSignal?: AbortSignal;
  /** 所有已启用的 Skill 列表（T6 新增，T7 负责传入实际数据） */
  skills?: Skill[];
}
```

> **说明**：`skills` 为可选字段，默认 `undefined`。不传时行为与修改前完全一致（无 skill 功能）。
> T7（useAgent 集成）将负责从 `SkillStore` 获取数据并传入。

### 3.2 修改 `AgentLoop` 类（`src/agent/agent-loop.ts`）

#### 3.2.1 新增导入（第 1-13 行区域）

在第 6 行（`IAgentRuntime` 导入）之后新增：

```typescript
import type { Skill } from '@/shared/types/skill';
```

修改后第 1-7 行：

```typescript
import type {
  AgentConfig,
  AgentRunInput,
  AgentRunOutput,
  ToolCallRecord,
  IAgentRuntime,
} from '@/shared/types/agent';
import type { Skill } from '@/shared/types/skill';
import type { IToolRegistry } from '@/registry/types';
```

#### 3.2.2 修改 `run()` 方法 — 整体结构变更

**当前结构（第 50-354 行）关键位置：**

```
第 50 行:  async run(input: AgentRunInput): Promise<AgentRunOutput> {
第 51-55 行:   // 初始化 abortController, toolCalls, finalMessage, tokenUsage
第 57-65 行:   // try 块开始，存储 user message
第 66 行:      // 创建 llmClient
第 68-72 行:   // ★ messages 初始化（循环外，只执行一次）
第 74-77 行:   // while 循环初始化（round, invalidRetries）
第 78 行:      while (round < this.config.maxToolRounds) {
第 79-83 行:     // abort 检查
第 84-103 行:    // tools schema + LLM chat
第 104-121 行:   // usage + choice 检查 + reasoning
第 122 行:       if (choice.finish_reason === 'tool_calls' && ...) {
第 123-151 行:     // assistant(tool_calls) 消息持久化
第 152-321 行:    // ★ for each tool_call: JSON解析 → getTool → guardrail → preflight → confirm → execute
第 322-324 行:    // finalMessage check + round++
第 325-332 行:  } else { // stop 响应 }
第 333 行:     }
第 335-337 行: // maxToolRounds 超限
第 339-353 行: // 存储 assistant 最终消息 + summary + return
第 351-353 行: // finally 清理
```

**修改后的结构（关键变更用 ★ 标记）：**

```
第 50 行:  async run(input: AgentRunInput): Promise<AgentRunOutput> {
第 51-55 行:   // 初始化（不变）
第 56 行:      const allSkills = input.skills ?? [];         // ★ 新增
第 57 行:      const activeSkillNames = new Set<string>();   // ★ 新增
第 58-66 行:   // try 块开始，存储 user message（不变）
第 67 行:      // 创建 llmClient（不变）
第 68-70 行:   // ★ messages 初始化移除（原来在此处，现移到 while 循环内）
第 71-72 行:   // while 循环初始化（不变）
第 73 行:      while (round < this.config.maxToolRounds) {
第 74 行:        // ★ messages 每轮重建（新位置）
第 75-80 行:      const messages = await this.contextBuilder.build(
                    input.conversationId,
                    input.browserContext,
                    [...activeSkillNames],   // ★ 传入当前激活的 skill 名称
                    allSkills,               // ★ 传入所有 skill 列表
                  );
第 81 行:        // abort 检查（不变）
第 82-101 行:     // tools schema + LLM chat（不变）
第 102-119 行:    // usage + choice 检查 + reasoning（不变）
第 120 行:        if (choice.finish_reason === 'tool_calls' && ...) {
第 121-149 行:      // assistant(tool_calls) 消息持久化（不变）
第 150-175 行:      // for each tool_call: JSON解析（不变）
第 176-199 行:      // getTool + tool not found（不变）
第 200 行:          // ★★★ SKILL TOOL 拦截（在 getTool 之后、guardrail 之前插入）★★★
第 201-243 行:        if (tc.function.name === 'skill') { ... continue; }
第 244-265 行:      // guardrail（不变，skill tool 已被 continue 跳过）
第 266-303 行:      // preflight + confirm + execute（不变）
第 304-306 行:      // finalMessage check + round++（不变）
第 307-314 行:    } else { // stop 响应（不变）}
第 315 行:       }
第 317-335 行:   // 其余代码不变
```

#### 3.2.3 详细改动点

##### 改动 A：移除循环外的 messages 初始化（第 68-72 行）

**当前代码：**

```typescript
      // 2. Build context messages
      let messages = await this.contextBuilder.build(
        input.conversationId,
        input.browserContext,
      );
```

**修改为：删除这 4 行。messages 改为在 while 循环内每轮重建。**

##### 改动 B：在 while 循环内新增 messages 重建（第 78 行之后，原第 79 行之前）

**在 `while (round < this.config.maxToolRounds) {` 之后、abort 检查之前插入：**

```typescript
        // 每轮重建 messages：将当前 activeSkillNames 注入 system prompt
        const messages = await this.contextBuilder.build(
          input.conversationId,
          input.browserContext,
          [...activeSkillNames],
          allSkills,
        );
```

> **注意**：`messages` 改为 `const`（每轮重新赋值，但数组内容可变如 `push`）。原来的 `let messages` 声明（第 69 行）一并删除。

##### 改动 C：在 `getTool()` 之后插入 skill 拦截逻辑（第 179 行之后，第 203 行之前）

**插入位置**：第 179 行 `const tool = this.toolRegistry.getTool(tc.function.name);` 之后、第 180 行 `if (!tool) {` 之前。

> **关键设计决策**：skill 拦截放在 `getTool()` 之后，意味着 `skill` 伪 tool 必须已注册到 `ToolRegistry`。如果 `getTool('skill')` 返回 `undefined`，则走原有的 "Unknown tool" 错误处理路径。正常情况（skill tool 已注册）下，`tool` 不为 `undefined`，拦截逻辑在此处生效。

**插入代码：**

```typescript
            // Skill tool 拦截：不经过 guardrail/execute，直接在 AgentLoop 中处理
            if (tc.function.name === 'skill') {
              const skillName = params.name as string;
              const matchedSkill = allSkills.find(s => s.name === skillName);
              const result = matchedSkill
                ? { success: true, data: { activated: skillName } }
                : { success: false, error: `技能 "${skillName}" 不存在` };

              if (matchedSkill) {
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
              invalidRetries = 0; // skill 调用不算错误，重置重试计数
              continue; // 跳过 guardrail + preflight + confirm + execute
            }
```

**逻辑说明：**

| 步骤 | 行为 |
|------|------|
| `tc.function.name === 'skill'` | 精确匹配，不区分大小写（与 tool registry 的 name 字段一致） |
| `allSkills.find(s => s.name === skillName)` | 在传入的 skill 列表中查找匹配项 |
| 匹配成功 | `activeSkillNames.add(skillName)`，返回 `{ success: true }` |
| 匹配失败 | 不修改 `activeSkillNames`，返回 `{ success: false, error: "..." }` |
| `messages.push(toolMsg)` | 将 tool result 注入当前轮 messages（与 CM 持久化一致） |
| `conversationManager.addMessage(...)` | 持久化 tool 消息，确保下一轮 `contextBuilder.build()` 能读取到 |
| `invalidRetries = 0` | skill 调用成功不算错误，重置计数器 |
| `continue` | 跳过后续的 guardrail → preflight → confirm → execute 全流程 |

##### 改动 D：确保 `allSkills` 默认值安全

在 `run()` 方法 try 块开头（第 57 行 `try {` 之后、第 58 行 user message 存储之前）新增：

```typescript
    const allSkills = input.skills ?? [];
    const activeSkillNames = new Set<string>();
```

#### 3.2.4 完整修改后的 `run()` 方法（前 80 行左右）

```typescript
  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    this.abortController = new AbortController();
    const toolCalls: ToolCallRecord[] = [];
    let finalMessage = '';
    let totalPrompt = 0;
    let totalCompletion = 0;

    try {
      // 0. 提取 skill 数据并初始化激活状态
      const allSkills = input.skills ?? [];
      const activeSkillNames = new Set<string>();

      // 1. Store user message
      await this.conversationManager.addMessage(input.conversationId, {
        id: crypto.randomUUID(),
        role: 'user',
        content: input.userMessage,
        timestamp: Date.now(),
      });

      const llmClient = this.llmClientFactory(input.providerConfig);

      // 2. Agent loop
      let round = 0;
      let invalidRetries = 0;

      while (round < this.config.maxToolRounds) {
        if (this.abortController.signal.aborted) {
          finalMessage = '操作已被中止。';
          break;
        }

        // 每轮重建 messages：将当前 activeSkillNames 注入 system prompt
        const messages = await this.contextBuilder.build(
          input.conversationId,
          input.browserContext,
          [...activeSkillNames],
          allSkills,
        );

        const tools = this.toolRegistry.toOpenAISchema();
        let response: ChatCompletionResponse;

        try {
          response = await llmClient.chat(
            {
              model: input.providerConfig.model,
              messages,
              tools,
              reasoning_effort: this.config.reasoningEffort,
            },
            this.abortController.signal,
          );
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            finalMessage = '操作已被中止。';
            break;
          }
          throw err;
        }
        // ... 后续代码不变 ...
```

---

## 4. 关键设计决策

### 4.1 messages 每轮重建的原因

| 问题 | 说明 |
|------|------|
| **为什么不能继续在循环外初始化？** | 如果 messages 只在循环外初始化一次，`contextBuilder.build()` 只调用一次，system prompt 中的 skill 信息是静态的。LLM 在后续轮次中激活了 skill，但 system prompt 不会更新。 |
| **重建会丢失之前的 tool call 历史吗？** | 不会。`contextBuilder.build()` 内部调用 `conversationManager.getRecentMessages()` 从持久化存储加载历史消息。每轮 tool call 的结果都已通过 `conversationManager.addMessage()` 持久化，所以重建的 messages 包含完整的对话历史。 |
| **性能影响** | `getRecentMessages()` 是异步存储读取，Chrome Storage API 延迟通常 < 5ms。对整体 LLM 调用延迟（通常 > 1s）的影响可忽略。 |

### 4.2 skill 拦截位置的选择

放在 `getTool()` 之后、`guardrail.check()` 之前的原因：

1. **`getTool()` 之后**：确保 `skill` 伪 tool 已在 ToolRegistry 中注册。如果未注册，`getTool('skill')` 返回 `undefined`，走原有的 "Unknown tool" 错误路径（LLM 会收到错误反馈并重试）。
2. **`guardrail.check()` 之前**：skill 激活无副作用、无安全风险，不需要 guardrail 检查。跳过 guardrail 避免了不必要的权限校验开销。
3. **`tool.execute()` 之前**：skill tool 的 `execute` 是伪实现（永远返回 success），真正逻辑在 AgentLoop 拦截中完成。跳过 execute 避免调用无意义的伪实现。

### 4.3 `activeSkillNames` 的生命周期

- **初始化**：每轮 `run()` 调用时创建新的 `Set<string>()`
- **更新**：LLM 调用 `skill` tool 且 skill 名称匹配时，`activeSkillNames.add(skillName)`
- **使用**：每轮 `contextBuilder.build()` 调用时传入 `[...activeSkillNames]`（展开为数组）
- **清除**：`run()` 方法返回后，局部变量 `activeSkillNames` 被 GC 回收

> 这符合 PRD 要求：每轮对话开始时 skill 激活状态清空，LLM 需要重新激活。

### 4.4 向后兼容性

| 场景 | 行为 |
|------|------|
| `input.skills` 为 `undefined`（不传） | `allSkills = []`，`activeSkillNames` 为空，`contextBuilder.build()` 的 `allSkills` 为空数组 → T5 的 `buildSkillSections()` 不注入任何 skill 内容，行为与修改前完全一致 |
| `input.skills` 为 `[]`（空数组） | 同上 |
| skill tool 未注册到 ToolRegistry | `getTool('skill')` 返回 `undefined`，走原有 "Unknown tool" 路径 |

---

## 5. 测试指引

### 5.1 测试文件修改

**文件：`src/agent/__tests__/agent-loop.test.ts`（修改）**

#### 5.1.1 新增测试辅助数据和工厂函数

在现有 fixture 区域（`defaultInput` 之后，`describe('AgentLoop', ...)` 之前）新增：

```typescript
// ==================== Skill 测试数据 ====================

interface TestSkill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

const sampleSkills: TestSkill[] = [
  {
    id: 'skill-1',
    name: 'caveman',
    description: 'Ultra-compressed communication mode',
    prompt: 'Speak in caveman style. Short sentences. No fluff.',
    enabled: true,
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: 'skill-2',
    name: 'diagnose',
    description: 'Disciplined diagnosis loop',
    prompt: 'When debugging: reproduce → minimise → hypothesise → instrument → fix.',
    enabled: true,
    createdAt: 2000,
    updatedAt: 2000,
  },
];

// 创建包含 skill tool 的 toolRegistry
function createMockToolRegistryWithSkill(
  tools: ToolDefinition[],
  skillTool?: ToolDefinition,
): IToolRegistry {
  const allTools = skillTool ? [...tools, skillTool] : tools;
  const map = new Map(allTools.map((t) => [t.name, t]));
  return {
    getAllTools: vi.fn().mockReturnValue(allTools),
    getTool: vi.fn().mockImplementation((name: string) => map.get(name)),
    register: vi.fn(),
    registerAll: vi.fn(),
    getToolsByCategory: vi.fn().mockReturnValue([]),
    toOpenAISchema: vi.fn().mockReturnValue([]),
    unregisterCategory: vi.fn(),
  };
}

// skill 伪 tool 定义
const skillToolDef: ToolDefinition = {
  name: 'skill',
  description: '激活一个技能',
  schema: {
    type: 'object',
    properties: { name: { type: 'string', description: '技能名称' } },
    required: ['name'],
  },
  category: 'expert',
  riskLevel: 'low',
  confirmationRequired: false,
  resultSensitivity: 'low',
  execute: vi.fn().mockResolvedValue({ success: true, data: { activated: 'test' } }),
};

// 带 skills 的 AgentRunInput
function skillRunInput(overrides?: Partial<AgentRunInput>): AgentRunInput {
  return {
    ...defaultInput,
    skills: sampleSkills as unknown as AgentRunInput['skills'],
    ...overrides,
  };
}
```

#### 5.1.2 新增测试用例

在现有 `describe('AgentLoop', ...)` 块末尾（第 1217 行 `});` 之前）新增以下 `describe` 块：

```typescript
  // ==================== Skill 拦截测试（T6） ====================

  describe('Skill tool 拦截', () => {
    it('skill tool call 匹配成功 → 返回 success，不经过 guardrail 和 execute', async () => {
      const toolRegistry = createMockToolRegistryWithSkill([], skillToolDef);
      const guardrail = createMockGuardrail();
      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_1', 'skill', { name: 'caveman' })),
        stopResponse('已激活 caveman 技能。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        guardrail,
        conversationManager,
        llmFactory,
      );

      const output = await loop.run(skillRunInput());

      // skill tool 被拦截，返回 success
      expect(output.toolCalls).toHaveLength(1);
      expect(output.toolCalls[0]!.toolName).toBe('skill');
      expect(output.toolCalls[0]!.result.success).toBe(true);
      expect(output.toolCalls[0]!.result.data).toEqual({ activated: 'caveman' });

      // guardrail.check 不应被调用（skill tool 被拦截）
      expect(guardrail.check).not.toHaveBeenCalled();

      // skillToolDef.execute 不应被调用
      expect(skillToolDef.execute).not.toHaveBeenCalled();
    });

    it('skill tool call 匹配失败 → 返回 error，不修改 activeSkillNames', async () => {
      const toolRegistry = createMockToolRegistryWithSkill([], skillToolDef);
      const guardrail = createMockGuardrail();
      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_1', 'skill', { name: 'nonexistent' })),
        stopResponse('技能不存在。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        guardrail,
        conversationManager,
        llmFactory,
      );

      const output = await loop.run(skillRunInput());

      // skill tool 返回失败
      expect(output.toolCalls).toHaveLength(1);
      expect(output.toolCalls[0]!.toolName).toBe('skill');
      expect(output.toolCalls[0]!.result.success).toBe(false);
      expect(output.toolCalls[0]!.result.error).toContain('不存在');

      // guardrail 和 execute 仍不应被调用
      expect(guardrail.check).not.toHaveBeenCalled();
      expect(skillToolDef.execute).not.toHaveBeenCalled();
    });

    it('skill 激活后下一轮 contextBuilder 传入更新后的 activeSkillNames', async () => {
      // 这个测试验证核心联动：skill 激活 → 下一轮 build() 参数正确
      // 通过检查第二轮 LLM chat 的 messages 中是否包含 skill prompt 来验证

      const toolRegistry = createMockToolRegistryWithSkill([], skillToolDef);
      const guardrail = createMockGuardrail();

      // 第一轮：激活 caveman skill
      // 第二轮：stop 响应
      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_1', 'skill', { name: 'caveman' })),
        stopResponse('Me caveman. You ask. Me answer.'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      // conversationManager 需要能返回持久化的消息
      // contextBuilder.build() 调用 getRecentMessages() 时返回空（简化）
      vi.mocked(conversationManager.get).mockResolvedValue(undefined);
      vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        guardrail,
        conversationManager,
        llmFactory,
      );

      await loop.run(skillRunInput());

      // 验证第二轮 LLM chat 的 messages 中包含已激活 skill 的 prompt
      const chatCalls = vi.mocked(llmClient.chat).mock.calls;
      expect(chatCalls.length).toBeGreaterThanOrEqual(2);

      // 第二轮（index 1）的 system prompt 应包含 caveman 的 prompt 内容
      const round2Messages = chatCalls[1]![0]!.messages;
      const systemMsg = round2Messages.find(m => m.role === 'system');
      expect(systemMsg).toBeDefined();
      expect(systemMsg!.content).toContain('Speak in caveman style');
      expect(systemMsg!.content).toContain('## 已激活的技能');
      expect(systemMsg!.content).toContain('### caveman');
    });

    it('多个 skill 依次激活 → 下一轮 contextBuilder 传入所有已激活 skill', async () => {
      const toolRegistry = createMockToolRegistryWithSkill([], skillToolDef);
      const guardrail = createMockGuardrail();

      // 第一轮：激活 caveman
      // 第二轮：激活 diagnose
      // 第三轮：stop
      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_1', 'skill', { name: 'caveman' })),
        toolCallsResponse(toolCallDelta('call_2', 'skill', { name: 'diagnose' })),
        stopResponse('完成。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      vi.mocked(conversationManager.get).mockResolvedValue(undefined);
      vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        guardrail,
        conversationManager,
        llmFactory,
      );

      await loop.run(skillRunInput());

      const chatCalls = vi.mocked(llmClient.chat).mock.calls;

      // 第三轮（index 2）的 system prompt 应包含两个 skill
      const round3Messages = chatCalls[2]![0]!.messages;
      const systemMsg = round3Messages.find(m => m.role === 'system');
      expect(systemMsg!.content).toContain('### caveman');
      expect(systemMsg!.content).toContain('### diagnose');
    });

    it('skill tool call 正常持久化到 conversation message', async () => {
      const toolRegistry = createMockToolRegistryWithSkill([], skillToolDef);
      const guardrail = createMockGuardrail();
      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_skill_1', 'skill', { name: 'caveman' })),
        stopResponse('完成。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        guardrail,
        conversationManager,
        llmFactory,
      );

      await loop.run(skillRunInput());

      // addMessage 调用序列：user → assistant(tool_calls) → tool(skill result) → assistant(final)
      const addMsgCalls = vi.mocked(conversationManager.addMessage).mock.calls;
      expect(addMsgCalls.length).toBeGreaterThanOrEqual(3);

      // 第 3 次调用（index 2）应为 skill tool result
      const toolMsgCall = addMsgCalls[2];
      expect(toolMsgCall).toBeDefined();
      expect(toolMsgCall![1].role).toBe('tool');
      expect(toolMsgCall![1].toolCallId).toBe('call_skill_1');
      const content = JSON.parse(toolMsgCall![1].content);
      expect(content.success).toBe(true);
      expect(content.data.activated).toBe('caveman');
    });

    it('非 skill tool call 流程不受影响（回归测试）', async () => {
      // 使用普通 tool（非 skill），验证 guardrail + execute 正常执行
      const normalToolDef: ToolDefinition = {
        name: 'tabs_query',
        description: '查询标签页',
        schema: { type: 'object', properties: {} },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: [{ id: 1, title: 'Example' }],
        } satisfies ToolResult),
      };

      const toolRegistry = createMockToolRegistryWithSkill([normalToolDef], skillToolDef);
      const guardrail = createMockGuardrail();
      const llmClient = createMockLlmClient([
        toolCallsResponse(toolCallDelta('call_1', 'tabs_query', {})),
        stopResponse('查询完成。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        guardrail,
        conversationManager,
        llmFactory,
      );

      const output = await loop.run(skillRunInput());

      // 正常 tool 仍然经过 guardrail 和 execute
      expect(guardrail.check).toHaveBeenCalled();
      expect(normalToolDef.execute).toHaveBeenCalled();
      expect(output.toolCalls[0]!.toolName).toBe('tabs_query');
      expect(output.toolCalls[0]!.result.success).toBe(true);
    });

    it('skill 和普通 tool 在同一轮 assistant 消息中混合出现 → 分别正确处理', async () => {
      const normalToolDef: ToolDefinition = {
        name: 'tabs_query',
        description: '查询标签页',
        schema: { type: 'object', properties: {} },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: [{ id: 1, title: 'Example' }],
        } satisfies ToolResult),
      };

      const toolRegistry = createMockToolRegistryWithSkill([normalToolDef], skillToolDef);
      const guardrail = createMockGuardrail();
      // 同一轮 assistant 消息同时调用 skill 和普通 tool
      const llmClient = createMockLlmClient([
        toolCallsResponse(
          toolCallDelta('call_1', 'skill', { name: 'caveman' }),
          toolCallDelta('call_2', 'tabs_query', {}),
        ),
        stopResponse('完成。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        guardrail,
        conversationManager,
        llmFactory,
      );

      const output = await loop.run(skillRunInput());

      // 两个 tool call 都应记录
      expect(output.toolCalls).toHaveLength(2);
      // skill tool：不经过 guardrail + execute
      expect(output.toolCalls[0]!.toolName).toBe('skill');
      expect(output.toolCalls[0]!.result.success).toBe(true);
      // 普通 tool：经过 guardrail + execute
      expect(output.toolCalls[1]!.toolName).toBe('tabs_query');
      expect(output.toolCalls[1]!.result.success).toBe(true);
      expect(guardrail.check).toHaveBeenCalledTimes(1); // 只对普通 tool 调用
      expect(skillToolDef.execute).not.toHaveBeenCalled();
      expect(normalToolDef.execute).toHaveBeenCalledTimes(1);
    });

    it('input.skills 为 undefined 时正常运行（向后兼容）', async () => {
      const normalToolDef: ToolDefinition = {
        name: 'tabs_query',
        description: '查询标签页',
        schema: { type: 'object', properties: {} },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: [],
        } satisfies ToolResult),
      };

      const toolRegistry = createMockToolRegistry([normalToolDef]);
      const guardrail = createMockGuardrail();
      const llmClient = createMockLlmClient([
        stopResponse('查询完成。'),
      ]);
      const llmFactory = vi.fn().mockReturnValue(llmClient);

      const loop = new AgentLoop(
        defaultConfig,
        toolRegistry,
        guardrail,
        conversationManager,
        llmFactory,
      );

      // 不传 skills 字段
      const output = await loop.run(defaultInput);

      expect(output.finalMessage).toBe('查询完成。');
      // 验证 contextBuilder.build() 被调用时 allSkills 为空数组
      // （无法直接验证，但通过无异常来间接证明）
    });
  });
```

### 5.2 运行测试

```bash
# 运行 agent-loop 相关测试
npx vitest run src/agent/__tests__/agent-loop.test.ts

# 确保所有已有测试仍然通过（回归验证）
npx vitest run src/agent/__tests__/
```

预期结果：
- 新增 8 个 skill 拦截测试用例全部通过
- 原有 25 个测试用例全部通过（回归验证）
- 共 33 个测试用例，零失败

### 5.3 类型检查

```bash
npx tsc --noEmit
```

---

## 6. 验收标准

- [ ] `AgentRunInput` 新增 `skills?: Skill[]` 字段
- [ ] `run()` 方法中 `allSkills = input.skills ?? []` 和 `activeSkillNames = new Set<string>()` 正确初始化
- [ ] `messages` 初始化从 while 循环外移到循环内，每轮重新调用 `contextBuilder.build(conversationId, ctx, [...activeSkillNames], allSkills)`
- [ ] `skill` tool call 在 `getTool()` 之后被正确拦截，返回 `{ success: true, data: { activated: skillName } }`
- [ ] 匹配到 skill 时，`activeSkillNames.add(skillName)` 正确执行
- [ ] 不匹配的 skill 名称返回 `{ success: false, error: "技能 \"xxx\" 不存在" }`
- [ ] skill 拦截块中 `continue` 正确跳过 guardrail、preflight、confirm、execute
- [ ] `skill` tool call 的 tool result 正常持久化到 `conversationManager`
- [ ] `skill` tool call 记录到 `toolCalls` 数组（含 `toolCallId`）
- [ ] `hooks.onToolCall` 在 skill 拦截后正确触发
- [ ] `invalidRetries` 在 skill 激活成功后重置为 0
- [ ] 非 `skill` tool call 流程不受影响：guardrail → preflight → confirm → execute 正常执行
- [ ] `input.skills` 为 `undefined` 时正常运行（向后兼容，等同于 `allSkills = []`）
- [ ] 单元测试 8 个新增用例 + 25 个原有用例 = 33 个全部通过
- [ ] `npx tsc --noEmit` 编译通过

---

## 7. 风险点及对策

| 风险 | 影响 | 对策 |
|------|------|------|
| messages 每轮重建导致性能下降 | 每轮多一次 `chrome.storage.local.get()` 调用 | 延迟 < 5ms，相对 LLM 调用延迟（> 1s）可忽略 |
| messages 重建时 conversationManager 返回的消息序列不完整 | assistant(tool_calls) 和 tool(result) 消息顺序错乱，LLM 报错 | 每轮 tool 处理完成后立即 `await addMessage()`，确保持久化完成后再进入下一轮。当前代码已使用 `await` |
| `getRecentMessages()` 的 count 限制截断历史 | 丢失早期的消息 | 当前 `maxContextMessages = 20`，每轮新增 2-3 条消息，足够覆盖多轮对话 |
| skill 名称大小写不匹配 | LLM 传入的名称与 skill.name 不一致 | 当前做精确匹配（`===`），不做大小写转换。skill 名称由用户在 UI 中定义，LLM 看到的是 system prompt 中的名称，通常能精确匹配 |
| `allSkills` 数组很大（如 100 个 skill） | `find()` 遍历耗时 | 100 个元素的 `find()` 耗时 < 0.1ms。如需优化，后续可改为 `Map<string, Skill>` |
| T1 未完成导致 `Skill` 类型不存在 | 编译失败 | 文档第 3.1 节已标注依赖 T1。如 T1 未完成，可在 `agent-loop.ts` 中 inline 定义最小 Skill 类型 |
| 与 T5 的 `ContextBuilder.build()` 签名不一致 | `build()` 调用参数不匹配 | T6 依赖 T5，T5 的签名变更已在此文档中引用。实现前先确认 T5 已完成 |

---

## 8. 与后续任务的接口约定

### 8.1 为 T7（useAgent 集成）提供的接口

T7 负责在 `useAgent.ts` 中将 skill 数据传入 `AgentLoop.run()`：

```typescript
// T7 中的调用方式（参考，本任务不实现）
const skillStore = SkillStore.getInstance();
const enabledSkills = await skillStore.getEnabled();

const output = await loop.run({
  conversationId,
  userMessage,
  providerConfig,
  browserContext,
  skills: enabledSkills, // ← T6 新增的字段
});
```

### 8.2 `AgentRunInput.skills` 字段约定

| 属性 | 约定 |
|------|------|
| 类型 | `Skill[] \| undefined` |
| 来源 | `SkillStore.getInstance().getEnabled()` — 只包含 `enabled: true` 的 skill |
| 默认值 | `undefined` → `run()` 内部转为 `[]` |
| 更新时机 | 每次 `run()` 调用时重新获取（用户可能在对话间增删 skill） |

---

## 9. 文件变更汇总

| 文件 | 操作 | 改动量 |
|------|------|--------|
| `src/shared/types/agent.ts` | 修改 | +2 行（import + skills 字段） |
| `src/agent/agent-loop.ts` | 修改 | +30 行，-4 行（核心逻辑） |
| `src/agent/__tests__/agent-loop.test.ts` | 修改 | +200 行（8 个新测试用例 + 辅助函数） |

---

## 10. 注意事项

1. **`messages` 从 `let` 改为 `const`**：因为每轮重新赋值（`const messages = await this.contextBuilder.build(...)`），但数组内容仍然可变（`messages.push(...)`）。

2. **skill 拦截位置与 `!tool` 检查的顺序**：skill 拦截在 `getTool()` 之后、`if (!tool)` 之前。如果 skill tool 未注册到 ToolRegistry，`getTool('skill')` 返回 `undefined`，走原有的 "Unknown tool" 错误处理。这是预期行为——skill tool 必须先在 T7 中注册才能被拦截。

3. **`contextBuilder.build()` 的新签名**：确认 T5 已将签名改为 `build(conversationId, ctx, activeSkillNames?, allSkills?)`。如果 T5 未完成，本任务无法正确实现。

4. **不要修改 `AgentLoop` 构造函数**：skill 数据通过 `AgentRunInput.skills` 在 `run()` 时传入，而非构造函数注入。这样每次 `run()` 调用都能获取最新的 skill 列表。

5. **`invalidRetries` 的处理**：skill 拦截成功后重置 `invalidRetries = 0`，与普通 tool 执行成功后的行为一致（第 320 行）。

6. **`allSkills` 的类型转换**：在测试中，`TestSkill` 和 `Skill` 类型不完全一致（测试用的 `TestSkill` 缺少完整字段）。使用 `as unknown as AgentRunInput['skills']` 进行类型转换。T1 完成后可直接使用正式类型。
