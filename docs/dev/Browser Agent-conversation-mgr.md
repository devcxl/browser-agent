# 开发文档: T14 - Conversation Manager

**Project:** Browser Agent
**Task ID:** T14
**Slug:** conversation-mgr
**Issue:** #14
**类型:** backend
**Batch:** 5
**依赖:** T2 (define-types), T5 (storage-impl)

## 1. 目标

实现 `IConversationManager` 接口，基于 IndexedDB 实现多会话的 CRUD、消息管理、摘要触发与生成。

## 2. 前置条件

- [x] T2: `shared/types/conversation.ts` 中的 `Conversation`、`StoredMessage`、`IConversationManager` 类型已定义
- [x] T5: `shared/db/database.ts` 提供 IndexedDB 实例（含 `conversations`、`messages`、`toolCallLogs` 表的 CRUD 操作）
- [x] T5: `shared/storage/config-store.ts` 提供 `ConfigStore`（本任务不直接依赖，但 LLM Client 配置通过它获取）

## 3. 实现步骤

### 3.1 类型定义复用

T2 中已定义的接口（来自技术方案 4.2.5）：

```ts
// 以下类型已存在于 src/shared/types/conversation.ts

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  summary?: string;
  summaryUpToIndex?: number;
  sensitiveDataGranted: boolean;
}

interface StoredMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{
    name: string;
    params: Record<string, unknown>;
    result?: string; // 只存摘要
  }>;
  timestamp: number;
}

interface IConversationManager {
  create(title?: string): Promise<Conversation>;
  get(id: string): Promise<Conversation | undefined>;
  list(): Promise<Conversation[]>;
  update(id: string, patch: Partial<Conversation>): Promise<void>;
  delete(id: string): Promise<void>;
  addMessage(conversationId: string, message: StoredMessage): Promise<void>;
  getRecentMessages(conversationId: string, count: number): Promise<StoredMessage[]>;
  generateSummary(conversationId: string, llmClient: ILlmClient): Promise<string>;
  needsSummary(conversationId: string): Promise<boolean>;
}
```

### 3.2 摘要阈值常量

```ts
// 在 conversation-manager.ts 顶部定义

const SUMMARY_THRESHOLDS = {
  messageCount: 30,
  estimatedTokens: 12_000,
  toolCallCount: 50,
} as const;

// Token 估算：简单按字符数 / 4 估算（英文）或字符数 / 2（中文），取保守值
function estimateTokens(text: string): number {
  // 保守估算：每个字符约 0.5 token（混合中英文场景）
  return Math.ceil(text.length * 0.5);
}
```

### 3.3 ConversationManager 核心实现

**文件:** `src/conversation/conversation-manager.ts`

**实现伪代码：**

```ts
// src/conversation/conversation-manager.ts

import type {
  Conversation,
  StoredMessage,
  IConversationManager,
} from '../shared/types/conversation';
import type { ILlmClient } from '../shared/types/llm';
import type { IDatabase } from '../shared/db/database'; // T5 提供的数据库封装

const SUMMARY_THRESHOLDS = {
  messageCount: 30,
  estimatedTokens: 12_000,
  toolCallCount: 50,
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.5);
}

function generateId(): string {
  return crypto.randomUUID();
}

export class ConversationManager implements IConversationManager {
  constructor(private db: IDatabase) {}

  async create(title?: string): Promise<Conversation> {
    const now = Date.now();
    const conversation: Conversation = {
      id: generateId(),
      title: title ?? `新对话 ${new Date(now).toLocaleString()}`,
      createdAt: now,
      updatedAt: now,
      messages: [],
      sensitiveDataGranted: false,
    };

    // 存储到 IndexedDB（仅存储元数据，不含 messages 数组）
    await this.db.conversations.put({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      summary: null,
      summaryUpToIndex: 0,
      sensitiveDataGranted: false,
    });

    return conversation;
  }

  async get(id: string): Promise<Conversation | undefined> {
    const conv = await this.db.conversations.get(id);
    if (!conv) return undefined;

    // 加载关联的消息
    const messages = await this.db.messages
      .where('conversationId')
      .equals(id)
      .sortBy('timestamp');

    return {
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCallName ? [{
          name: m.toolCallName,
          params: m.toolCallParams ? JSON.parse(m.toolCallParams) : {},
          result: m.toolCallResult,
        }] : undefined,
        timestamp: m.timestamp,
      })),
      summary: conv.summary ?? undefined,
      summaryUpToIndex: conv.summaryUpToIndex,
      sensitiveDataGranted: conv.sensitiveDataGranted,
    };
  }

  async list(): Promise<Conversation[]> {
    // 只返回元数据列表，不加载消息（性能考虑）
    const convs = await this.db.conversations
      .orderBy('updatedAt')
      .reverse()
      .toArray();

    return convs.map(c => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messages: [],
      summary: c.summary ?? undefined,
      summaryUpToIndex: c.summaryUpToIndex,
      sensitiveDataGranted: c.sensitiveDataGranted,
    }));
  }

  async update(id: string, patch: Partial<Conversation>): Promise<void> {
    const existing = await this.db.conversations.get(id);
    if (!existing) throw new Error(`会话 ${id} 不存在`);

    await this.db.conversations.put({
      ...existing,
      title: patch.title ?? existing.title,
      summary: patch.summary ?? existing.summary,
      summaryUpToIndex: patch.summaryUpToIndex ?? existing.summaryUpToIndex,
      sensitiveDataGranted: patch.sensitiveDataGranted ?? existing.sensitiveDataGranted,
      updatedAt: Date.now(),
    });
  }

  async delete(id: string): Promise<void> {
    // 级联删除关联消息
    const messages = await this.db.messages
      .where('conversationId')
      .equals(id)
      .toArray();

    const tx = this.db.transaction(['conversations', 'messages', 'toolCallLogs'], 'readwrite');

    await Promise.all([
      this.db.conversations.delete(id),
      ...messages.map(m => this.db.messages.delete(m.id)),
      // 也清理关联的 tool call 日志
      this.db.toolCallLogs.where('conversationId').equals(id).delete(),
    ]);

    await tx.done;
  }

  async addMessage(conversationId: string, message: StoredMessage): Promise<void> {
    // 存储消息到 IndexedDB
    await this.db.messages.put({
      id: message.id,
      conversationId,
      role: message.role,
      content: message.content,
      toolCallName: message.toolCalls?.[0]?.name,
      toolCallParams: message.toolCalls?.[0]?.params
        ? JSON.stringify(message.toolCalls[0].params)
        : undefined,
      toolCallResult: message.toolCalls?.[0]?.result,
      timestamp: message.timestamp,
    });

    // 更新会话的 updatedAt
    await this.db.conversations
      .where('id')
      .equals(conversationId)
      .modify({ updatedAt: Date.now() });
  }

  async getRecentMessages(
    conversationId: string,
    count: number,
  ): Promise<StoredMessage[]> {
    const messages = await this.db.messages
      .where('conversationId')
      .equals(conversationId)
      .reverse()
      .sortBy('timestamp');

    // 取最近 count 条（已按时间降序排列，取前 count 条后反转回升序）
    const recent = messages.slice(0, count).reverse();

    return recent.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCallName ? [{
        name: m.toolCallName,
        params: m.toolCallParams ? JSON.parse(m.toolCallParams) : {},
        result: m.toolCallResult,
      }] : undefined,
      timestamp: m.timestamp,
    }));
  }

  async needsSummary(conversationId: string): Promise<boolean> {
    const messages = await this.db.messages
      .where('conversationId')
      .equals(conversationId)
      .toArray();

    // 检查消息数量
    if (messages.length > SUMMARY_THRESHOLDS.messageCount) return true;

    // 检查估算 token 数
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (estimateTokens(totalChars) > SUMMARY_THRESHOLDS.estimatedTokens) return true;

    // 检查 tool call 数量
    const toolCalls = await this.db.toolCallLogs
      .where('conversationId')
      .equals(conversationId)
      .count();
    if (toolCalls > SUMMARY_THRESHOLDS.toolCallCount) return true;

    return false;
  }

  async generateSummary(
    conversationId: string,
    llmClient: ILlmClient,
  ): Promise<string> {
    const conversation = await this.get(conversationId);
    if (!conversation) throw new Error(`会话 ${conversationId} 不存在`);

    // 获取需要摘要的消息（从上次摘要位置之后或从开头）
    const startIndex = conversation.summaryUpToIndex ?? 0;
    const messagesToSummarize = conversation.messages.slice(startIndex);

    if (messagesToSummarize.length === 0) {
      return conversation.summary ?? '';
    }

    // 构造摘要请求
    const summaryPrompt = `请用 2-3 句话总结以下对话的核心内容和已完成的操作：

${messagesToSummarize.map(m => `[${m.role}]: ${m.content}`).join('\n')}

已有摘要（如有）：${conversation.summary ?? '无'}

请输出合并后的简洁摘要：`;

    const response = await llmClient.chat({
      model: '', // 使用默认 model，由 LlmClient 配置决定
      messages: [{ role: 'user', content: summaryPrompt }],
      temperature: 0.3,
      max_tokens: 500,
    });

    const newSummary = response.choices[0]?.message?.content ?? '';

    // 存储摘要
    await this.update(conversationId, {
      summary: newSummary,
      summaryUpToIndex: conversation.messages.length,
    });

    return newSummary;
  }
}
```

### 3.4 导出

**文件:** `src/conversation/index.ts`

```ts
export { ConversationManager } from './conversation-manager';
export type {
  Conversation,
  StoredMessage,
  IConversationManager,
} from '../shared/types/conversation';
```

## 4. 接口/契约

### 4.1 IConversationManager 接口

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `create` | `title?: string` | `Promise<Conversation>` | 新建会话，自动生成 UUID 和时间戳 |
| `get` | `id: string` | `Promise<Conversation \| undefined>` | 获取会话（含所有消息） |
| `list` | — | `Promise<Conversation[]>` | 列出所有会话，按 `updatedAt` 降序，不含消息 |
| `update` | `id, patch` | `Promise<void>` | 部分更新会话属性 |
| `delete` | `id` | `Promise<void>` | 删除会话及其所有消息 |
| `addMessage` | `conversationId, message` | `Promise<void>` | 添加消息并更新 `updatedAt` |
| `getRecentMessages` | `conversationId, count` | `Promise<StoredMessage[]>` | 获取最近 N 条消息（时间升序） |
| `generateSummary` | `conversationId, llmClient` | `Promise<string>` | 调用 LLM 生成摘要并存储 |
| `needsSummary` | `conversationId` | `Promise<boolean>` | 检查是否超过阈值 |

### 4.2 摘要阈值

| 维度 | 阈值 | 说明 |
|------|------|------|
| 消息数量 | > 30 条 | 会话中消息总数 |
| 估算 token | > 12,000 | 所有消息内容 token 估算值 |
| 工具调用次数 | > 50 次 | 该会话累计 tool call 次数 |

三个条件满足任意一个即触发摘要。

## 5. 测试指引

### 5.1 单元测试

**文件:** `src/conversation/__tests__/conversation-manager.test.ts`

**Mock 策略：** Mock `IDatabase`（T5 产物），提供 `conversations`、`messages`、`toolCallLogs` 的内存实现。Mock `ILlmClient.chat()`。

**测试场景及预期：**

| # | 场景 | 输入 | 预期结果 |
|---|------|------|----------|
| 1 | `create()` 无标题 | `create()` | 返回 Conversation，title 为 "新对话 {时间}"，id 为 UUID |
| 2 | `create()` 带标题 | `create("测试会话")` | title 为 "测试会话" |
| 3 | `get()` 存在 | `get(id)` | 返回完整 Conversation 含 messages |
| 4 | `get()` 不存在 | `get("nonexistent")` | 返回 `undefined` |
| 5 | `list()` 多会话 | 创建 3 个会话 | 按 `updatedAt` 降序返回 3 个，不含 messages |
| 6 | `update()` 修改标题 | `update(id, { title: "新标题" })` | get 后 title 变为 "新标题"，updatedAt 更新 |
| 7 | `update()` 不存在的 id | `update("nonexistent", ...)` | 抛出错误 |
| 8 | `delete()` 级联删除 | 添加 3 条消息后 delete | 会话和 3 条消息均被删除 |
| 9 | `addMessage()` | 添加 user 消息 | 消息持久化，会话 `updatedAt` 更新 |
| 10 | `addMessage()` 含 toolCalls | 添加 assistant 消息含 toolCalls | toolCallName/toolCallParams/toolCallResult 正确存储 |
| 11 | `getRecentMessages()` | 添加 50 条消息，取 20 条 | 返回最近 20 条，按时间升序 |
| 12 | `getRecentMessages()` count 大于总数 | 添加 5 条消息，取 20 条 | 返回全部 5 条 |
| 13 | `needsSummary()` 消息超阈值 | 添加 35 条消息 | `true` |
| 14 | `needsSummary()` token 超阈值 | 添加 10 条长消息（总字符 > 24000） | `true` |
| 15 | `needsSummary()` toolCall 超阈值 | 添加 60 条 toolCallLog | `true` |
| 16 | `needsSummary()` 未超阈值 | 添加 10 条短消息 | `false` |
| 17 | `generateSummary()` | mock LLM 返回摘要文本 | 返回摘要字符串，存储到 conversation.summary |
| 18 | `generateSummary()` 增量 | 已有 summary，新增消息后再次生成 | 摘要请求包含已有摘要，summaryUpToIndex 更新 |

## 6. 验收标准

- [ ] `create()` 创建新会话，返回 Conversation 对象（含 UUID、时间戳）
- [ ] `get(id)` 获取会话，包含所有消息
- [ ] `list()` 按 `updatedAt` 降序返回所有会话（不含消息体，性能考虑）
- [ ] `update(id, patch)` 部分更新会话属性（title、summary、summaryUpToIndex、sensitiveDataGranted）
- [ ] `delete(id)` 级联删除会话及其所有消息和 tool call 日志
- [ ] `addMessage(conversationId, message)` 添加消息并更新 `updatedAt`
- [ ] `getRecentMessages(conversationId, 20)` 返回最近 20 条消息（时间升序）
- [ ] `needsSummary(conversationId)` 任一维度超阈值返回 `true`
- [ ] `generateSummary(conversationId, llmClient)` 调用 LLM 生成并存储摘要
- [ ] 单元测试覆盖所有 CRUD 操作及阈值判断

## 7. 注意事项

1. **`list()` 不加载消息** — 列表视图只需元数据，消息按需通过 `get()` 加载。这避免列表页性能问题。
2. **`getRecentMessages` 返回升序** — 先按时间降序取 N 条，再反转为升序。LLM 上下文需要按时间顺序排列。
3. **摘要增量更新** — `generateSummary` 只摘要 `summaryUpToIndex` 之后的新消息，已有摘要作为上下文传入，实现增量合并。
4. **消息内容安全** — 存入 IndexedDB 的 `toolCallResult` 只存摘要字符串（由 Agent Loop 在存入前处理），不存敏感原文。ConversationManager 不负责过滤，只负责存储。
5. **事务处理** — `delete` 操作使用 IndexedDB 事务确保原子性（通过 `idb` 库的 transaction API）。
6. **Token 估算** — 使用字符数 × 0.5 的保守估算。后续可替换为更精确的 tokenizer（如 `gpt-tokenizer` 库），但 MVP 阶段避免引入额外依赖。
7. **UUID 生成** — 使用 `crypto.randomUUID()`，浏览器原生支持，无需引入 `uuid` 库。
