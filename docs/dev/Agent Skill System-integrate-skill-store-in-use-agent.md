# 开发文档: T7 - Skill 系统最终集成到 useAgent

**Project:** Agent Skill System
**Task ID:** T7
**Slug:** `integrate-skill-store-in-use-agent`
**Issue:** #81
**类型:** fullstack
**Batch:** 4
**依赖:** T3 (#77), T4 (#75), T6 (#79)

---

## 1. 目标

修改 `src/entrypoints/sidepanel/hooks/useAgent.ts`，将 Skill 系统的三个关键环节串联起来：

1. **`AgentRunInput` 新增 `skills` 字段** — 在 T6 的类型定义上追加
2. **ToolRegistry 注册 skill 伪 tool** — 在 `getDeps()` 中注册 `createSkillTool()`
3. **run() 传入 enabled skills** — 每次对话时从 `SkillStore` 获取已启用的 skill 列表

---

## 2. 前置条件 — 状态检查

截至 2026-06-23，所有依赖均 **未执行**：

| 依赖 | 文件 | 状态 |
|------|------|------|
| T1 | `src/shared/types/skill.ts` | ❌ 不存在 |
| T3 | `src/shared/storage/skill-store.ts` | ❌ 不存在 |
| T4 | `src/tools/skill-tool.ts` | ❌ 不存在 |
| T5 | `src/agent/context-builder.ts` 扩展签名 | ❌ 未修改（当前 `build(convId, ctx)`） |
| T6 | `src/agent/agent-loop.ts` skill 拦截 | ❌ 未修改（无 skill 相关代码） |
| T6 | `src/shared/types/agent.ts` `skills` 字段 | ❌ 未修改（无 `skills` 字段） |

**执行前验证脚本：**

```bash
# 全部通过 = 所有依赖已就绪
test -f src/shared/types/skill.ts && echo "T1 OK" || echo "T1 MISSING"
test -f src/shared/storage/skill-store.ts && echo "T3 OK" || echo "T3 MISSING"
test -f src/tools/skill-tool.ts && echo "T4 OK" || echo "T4 MISSING"
grep -q 'activeSkillNames' src/agent/context-builder.ts && echo "T5 OK" || echo "T5 MISSING"
grep -q "name === 'skill'" src/agent/agent-loop.ts && echo "T6 OK" || echo "T6 MISSING"
grep -q 'skills\?' src/shared/types/agent.ts && echo "T6-types OK" || echo "T6-types MISSING"
```

---

## 3. 改动一：`AgentRunInput` 新增 `skills` 字段

### 3.1 文件：`src/shared/types/agent.ts`

> ⚠️ **注意**：此改动已在 T6 的设计文档中定义。如果 T6 先执行并已修改此文件，则 T7 无需重复修改。如果 T6 未执行，T7 需要执行此改动。

**当前代码（第 1-3 行，导入区）：**

```typescript
import type { ProviderConfig, ILlmClient, ReasoningEffort } from './llm';
import type { LowSensitivityContext } from './browser';
import type { RiskLevel, ToolResult } from './tool';
```

**修改为（第 1 行后插入新导入）：**

```typescript
import type { ProviderConfig, ILlmClient, ReasoningEffort } from './llm';
import type { LowSensitivityContext } from './browser';
import type { RiskLevel, ToolResult } from './tool';
import type { Skill } from './skill';
```

> `ReasoningEffort` 当前未在 `agent.ts` 中使用，但保留以维持原有导入结构。

**当前代码（第 21-27 行，`AgentRunInput`）：**

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

**改动量**：+2 行（1 行 import + 1 行字段 + 1 行注释）

**验收**：`npx tsc --noEmit` 编译通过。`AgentRunInput` 的 `skills` 字段类型为 `Skill[] | undefined`。

---

## 4. 改动二：`getDeps()` 中注册 `createSkillTool()`

### 4.1 文件：`src/entrypoints/sidepanel/hooks/useAgent.ts`

### 4.2 当前 `getDeps()` 结构（第 34-86 行）

当前的动态导入列表（第 37-63 行）：

```typescript
    const [
      { AgentLoop },
      { ToolRegistry },
      { Guardrail },
      { ConversationManager },
      { JsonRpcClient },
      { LlmClient },
      { Database },
      { createTabsTools },
      { createWindowsTools },
      { createTabGroupsTools },
      { registerPhase2Tools },
      { createPageTools },
    ] = await Promise.all([
      import('@/agent/agent-loop'),
      import('@/registry'),
      import('@/guardrail'),
      import('@/conversation'),
      import('@/shared/jsonrpc/client'),
      import('@/provider'),
      import('@/shared/db/database'),
      import('@/tools/tabs'),
      import('@/tools/windows'),
      import('@/tools/tabgroups'),
      import('@/tools/phase2-register'),
      import('@/tools/page'),
    ]);
```

当前工具注册区（第 69-79 行）：

```typescript
    const registry = new ToolRegistry();
    registry.registerAll(createTabsTools(rpc));
    registry.registerAll(createWindowsTools(rpc));
    registry.registerAll(createTabGroupsTools(rpc));
    registerPhase2Tools(registry, rpc);
    registry.registerAll(
      createPageTools(async (params) => {
        const result = await rpc.request('content.execute', params as Record<string, unknown>);
        return { success: true, data: result };
      }),
    );
```

### 4.3 需要修改的位置

#### 4.3.1 新增动态导入（第 49 行之后）

在 `{ createPageTools },` 解构之后，`] = await Promise.all([` 之前，新增一行：

```typescript
      { createSkillTool },
```

修改后第 49-51 行：

```typescript
      { createPageTools },
      { createSkillTool },
    ] = await Promise.all([
```

#### 4.3.2 新增 import 调用（第 62 行之后）

在 `import('@/tools/page'),` 之后，`]);` 之前，新增一行：

```typescript
      import('@/tools/skill-tool'),
```

修改后第 62-64 行：

```typescript
      import('@/tools/page'),
      import('@/tools/skill-tool'),
    ]);
```

#### 4.3.3 注册 skill tool（第 79 行之后）

在 `createPageTools` 注册块（第 74-79 行）之后，`const guardrail = new Guardrail(registry);` 之前，新增：

```typescript
    registry.register(createSkillTool());
```

修改后第 74-82 行：

```typescript
    registry.registerAll(
      createPageTools(async (params) => {
        const result = await rpc.request('content.execute', params as Record<string, unknown>);
        return { success: true, data: result };
      }),
    );

    // Skill 伪 tool：注册到 ToolRegistry 使 LLM 可通过 function calling 调用
    registry.register(createSkillTool());

    const guardrail = new Guardrail(registry);
```

> **设计决策**：使用 `registry.register()`（单个注册）而非 `registry.registerAll()`。`createSkillTool()` 只返回一个 `ToolDefinition`，与 `registerPhase2Tools` 内部调用 `register` 的批量模式不同。

### 4.4 完整修改后的 `getDeps()` 函数

```typescript
async function getDeps(): Promise<AgentDeps> {
  if (_deps) return _deps;
  _deps = (async () => {
    const [
      { AgentLoop },
      { ToolRegistry },
      { Guardrail },
      { ConversationManager },
      { JsonRpcClient },
      { LlmClient },
      { Database },
      { createTabsTools },
      { createWindowsTools },
      { createTabGroupsTools },
      { registerPhase2Tools },
      { createPageTools },
      { createSkillTool },
    ] = await Promise.all([
      import('@/agent/agent-loop'),
      import('@/registry'),
      import('@/guardrail'),
      import('@/conversation'),
      import('@/shared/jsonrpc/client'),
      import('@/provider'),
      import('@/shared/db/database'),
      import('@/tools/tabs'),
      import('@/tools/windows'),
      import('@/tools/tabgroups'),
      import('@/tools/phase2-register'),
      import('@/tools/page'),
      import('@/tools/skill-tool'),
    ]);

    const db = Database.getInstance();
    const convManager = new ConversationManager(db);
    const rpc = new JsonRpcClient({ name: 'chat-agent' });

    const registry = new ToolRegistry();
    registry.registerAll(createTabsTools(rpc));
    registry.registerAll(createWindowsTools(rpc));
    registry.registerAll(createTabGroupsTools(rpc));
    registerPhase2Tools(registry, rpc);
    registry.registerAll(
      createPageTools(async (params) => {
        const result = await rpc.request('content.execute', params as Record<string, unknown>);
        return { success: true, data: result };
      }),
    );

    // Skill 伪 tool：注册到 ToolRegistry 使 LLM 可通过 function calling 调用
    registry.register(createSkillTool());

    const guardrail = new Guardrail(registry);

    return { AgentLoop, ToolRegistry, Guardrail, ConversationManager, JsonRpcClient, LlmClient, registry, guardrail, convManager, rpc };
  })();
  return _deps;
}
```

**改动量**：+4 行（2 行导入 + 1 行 import 调用 + 1 行注册）

---

## 5. 改动三：`run()` 中从 SkillStore 获取 enabled skills 并传入 AgentLoop

### 5.1 文件：`src/entrypoints/sidepanel/hooks/useAgent.ts`

### 5.2 当前 `run()` 中 `loop.run()` 调用（第 230-239 行）

```typescript
        const output = await loop.run({
          conversationId,
          userMessage,
          providerConfig,
          browserContext: {
            currentWindow: { tabs: [] },
            allWindows: [],
            tabGroups: [],
          },
        });
```

### 5.3 改动方案

在 `loop.run()` 调用之前，获取 `SkillStore` 的 enabled skills。

**插入位置**：第 228 行 `loopRef.current = loop;` 之后、第 230 行 `const output = await loop.run({` 之前。

**插入代码**：

```typescript
        // 从 SkillStore 获取已启用的 skills，传入 AgentLoop
        const { SkillStore } = await import('@/shared/storage');
        const skillStore = SkillStore.getInstance();
        const enabledSkills = await skillStore.getEnabled();
```

> **设计决策**：使用动态 `import()` 而非在 `getDeps()` 中预加载。理由：
> 1. `SkillStore` 仅在 `run()` 调用时需要，不在初始化时加载减少首屏开销
> 2. `SkillStore` 依赖 `browser.storage.local`，可能在 extension context 未就绪时 import 报错
> 3. 动态 import 有浏览器端原生支持，无需修改 `AgentDeps` 接口

### 5.4 修改 `loop.run()` 调用

```typescript
        const output = await loop.run({
          conversationId,
          userMessage,
          providerConfig,
          browserContext: {
            currentWindow: { tabs: [] },
            allWindows: [],
            tabGroups: [],
          },
          skills: enabledSkills,
        });
```

### 5.5 完整修改后的 `loop.run()` 调用区（第 228-241 行）

```typescript
        loopRef.current = loop;

        // 从 SkillStore 获取已启用的 skills，传入 AgentLoop
        const { SkillStore } = await import('@/shared/storage');
        const skillStore = SkillStore.getInstance();
        const enabledSkills = await skillStore.getEnabled();

        const output = await loop.run({
          conversationId,
          userMessage,
          providerConfig,
          browserContext: {
            currentWindow: { tabs: [] },
            allWindows: [],
            tabGroups: [],
          },
          skills: enabledSkills,
        });
```

**改动量**：+6 行

> **边界情况**：`skillStore.getEnabled()` 返回 `[]` 时，`skills: []` 等价于不传。AgentLoop 中 `input.skills ?? []` 得到空数组，skill 拦截逻辑不触发任何激活。正常流程不受影响。

---

## 6. 涉及依赖导入的确认

### 6.1 `@/shared/storage` 的导出

T3 完成后，`src/shared/storage/index.ts` 应变为：

```typescript
export { ConfigStore } from './config-store';
export { SkillStore } from './skill-store';
```

当前（T3 未执行）只有 `ConfigStore` 导出。T7 执行时需确认 `SkillStore` 已导出。

### 6.2 `@/tools/skill-tool` 的导出

T4 完成后，`src/tools/skill-tool.ts` 应导出：

```typescript
export function createSkillTool(): ToolDefinition { ... }
```

T7 的 `import('@/tools/skill-tool')` 解构 `{ createSkillTool }` 依赖此导出。

### 6.3 `@/shared/types/skill` 的导出

T1 完成后，`src/shared/types/skill.ts` 应导出 `Skill` 和 `ISkillStore`。T7 自身不直接导入此文件，但 `agent.ts` 中的 `import type { Skill } from './skill'` 依赖此文件存在。

---

## 7. 数据流全景

```
用户发起对话
  │
  ├─ useAgent.run() 被调用
  │   │
  │   ├─ getDeps() → ToolRegistry 中包含 skill 伪 tool（T7 改动二）
  │   │
  │   ├─ import('@/shared/storage') → SkillStore.getInstance().getEnabled()
  │   │   └─ 返回 Skill[]（T7 改动三）
  │   │
  │   ├─ new AgentLoop(config, registry, guardrail, convManager, llmFactory, hooks)
  │   │
  │   └─ loop.run({ ..., skills: enabledSkills })  （T7 改动三）
  │       │
  │       ├─ AgentRunInput.skills 字段接收数据（T6/T7 改动一）
  │       │
  │       ├─ AgentLoop.run() 内部：
  │       │   ├─ allSkills = input.skills ?? []
  │       │   ├─ activeSkillNames = new Set()
  │       │   ├─ while 循环每轮：contextBuilder.build(convId, ctx, [...activeSkillNames], allSkills)
  │       │   │   └─ system prompt 注入已激活 skill 的 prompt 内容
  │       │   │
  │       │   ├─ LLM 返回 tool_calls 包含 name='skill'
  │       │   ├─ getTool('skill') → 从 ToolRegistry 获取（T4 注册的伪 tool）
  │       │   ├─ skill 拦截：匹配 → activeSkillNames.add(name)，返回 success
  │       │   └─ 下一轮 while：contextBuilder 重新 build，注入更新后的 skill prompt
  │       │
  │       └─ 返回 AgentRunOutput
  │
  └─ UI 渲染最终回复
```

---

## 8. 验收标准

- [ ] `AgentRunInput` 包含 `skills?: Skill[]` 字段
- [ ] `createSkillTool()` 在 `getDeps()` 中通过 `import('@/tools/skill-tool')` 动态加载
- [ ] `registry.register(createSkillTool())` 将 skill 伪 tool 注册到 ToolRegistry
- [ ] `run()` 中通过 `import('@/shared/storage')` 动态加载 `SkillStore`
- [ ] `SkillStore.getInstance().getEnabled()` 获取已启用 skill 列表
- [ ] `skills: enabledSkills` 传入 `loop.run()` 调用
- [ ] 无 skill 时 `getEnabled()` 返回 `[]`，`skills: []` 不影响正常流程
- [ ] `npx tsc --noEmit` 编译通过
- [ ] 手动测试：开启一个 skill → 发送消息 → LLM 返回的 tool_calls 中包含 `skill` 调用

---

## 9. 手动验证计划

由于 T7 涉及完整的 end-to-end 流程，需要以下手动验证：

### 9.1 基础验证

```bash
# 类型检查
npx tsc --noEmit

# 构建检查
npm run build
```

### 9.2 功能验证步骤

1. 在浏览器中加载扩展
2. 打开 side panel
3. 进入 Skill 管理面板（T2 创建的 UI）
4. 创建一个测试 skill（如 `caveman`，prompt: "Speak in caveman style"）
5. 启用该 skill
6. 发送消息："用 caveman 风格回复我"
7. 预期行为：
   - LLM 识别到需要激活 caveman skill
   - 返回 `skill` tool call（name='caveman'）
   - AgentLoop 拦截并激活
   - 下一轮 LLM 回复使用 caveman 风格
   - UI 中 tool call 气泡显示 "skill" 工具调用（成功状态）

### 9.3 边界验证

| 场景 | 预期行为 |
|------|---------|
| 无 skill 可用 | `getEnabled()` 返回 `[]`，对话正常进行 |
| skill 未启用 | `getEnabled()` 不返回该 skill，LLM 调用 `skill` tool 时 AgentLoop 返回 "技能不存在" |
| 多个 skill 依次激活 | 每激活一个，下一轮 system prompt 包含已激活的全部 skill prompt |
| 对话间 skill 变更 | 每次 `run()` 调用都重新从 `SkillStore` 获取，反映最新状态 |

---

## 10. 风险点及对策

| 风险 | 影响 | 对策 |
|------|------|------|
| T3 `SkillStore` 未完成 → `import('@/shared/storage')` 找不到 `SkillStore` | `run()` 抛异常 | 执行前运行前置条件验证脚本；如确实未完成，暂时用 try-catch 降级为空数组 |
| T4 `createSkillTool` 未完成 → `import('@/tools/skill-tool')` 失败 | `getDeps()` 抛异常 | 同上；可暂时注释掉注册行，不影响其他 tool 运行 |
| T6 `AgentRunInput.skills` 字段不存在 → 类型错误 | 编译失败 | T6 文档已定义此字段，确保 T6 先执行 |
| `SkillStore.getInstance()` 在 extension context 外调用 | 运行时错误 | `run()` 只在用户发送消息时触发，此时 extension context 必然存在 |
| `getEnabled()` 返回大量 skill（> 50 个） | system prompt 过长，超过 token 限制 | 当前 skill 数量预期 < 20，可接受。后续可加截断逻辑 |
| `import('@/shared/storage')` 动态导入失败（如路径别名未配置） | `run()` 抛异常 | 项目已有 `@/` 别名配置，其他模块正常使用 |

---

## 11. 文件变更清单

| 文件 | 操作 | 改动量 | 说明 |
|------|------|--------|------|
| `src/shared/types/agent.ts` | 修改 | +2 行 | 新增 `skills?: Skill[]` 字段 + import（如 T6 未执行） |
| `src/entrypoints/sidepanel/hooks/useAgent.ts` | 修改 | +10 行 | `getDeps()` 中注册 skill tool（+4 行），`run()` 中获取并传入 skills（+6 行） |

---

## 12. 与其他任务的协作关系

```
T1 (Skill 类型定义)
 ├─ T3 (SkillStore 实现) ────────────┐
 ├─ T4 (createSkillTool) ────────────┤
 ├─ T5 (ContextBuilder 扩展)          │
 │   └─ T6 (AgentLoop skill 拦截) ────┤
 │       ├─ AgentRunInput.skills ◄────┤ T7 改动一：类型字段
 │       └─ AgentLoop.run(skills) ◄───┤ T7 改动三：传入数据
 └────────────────────────────────────┤
                                     T7 (useAgent 集成)
                                       ├─ 改动一：AgentRunInput.skills 字段（与 T6 共享）
                                       ├─ 改动二：registry.register(createSkillTool())
                                       └─ 改动三：SkillStore.getEnabled() → loop.run(skills)
```

T7 是 Skill 系统的 **最后一环**，将所有前置模块串联起来形成完整的端到端流程。

---

## 13. 注意事项

1. **T6 重复改动问题**：`src/shared/types/agent.ts` 的 `skills` 字段在 T6 和 T7 文档中都被定义为改动项。如果 T6 先执行并已添加此字段，T7 跳过此改动；如果 T6 未执行，T7 负责添加。**建议 T6 执行时完成此改动，T7 仅做 `useAgent.ts` 的修改。**

2. **动态 import 的缓存**：`getDeps()` 使用 `_deps` 缓存，整个 side panel 生命周期只执行一次。这意味着 `createSkillTool()` 的注册也只执行一次。ToolRegistry 中的 skill tool 在整个 session 中持续有效。

3. **每次 `run()` 重新获取 skills**：虽然 `SkillStore` 实例是单例，但每次 `run()` 都调用 `getEnabled()` 确保获取最新的 skill 列表（用户可能在两次对话之间增删 skill）。

4. **`@/shared/storage` 的导出路径**：确认 T3 完成后 `src/shared/storage/index.ts` 已导出 `SkillStore`。当前（T3 未执行）只有 `ConfigStore` 导出。

5. **不要修改 `AgentDeps` 接口**：当前方案使用动态 import 而非将 `SkillStore` 加入 `AgentDeps`，保持接口稳定，减少改动面。
