# 开发文档: T19 - 单元测试 + E2E 测试

**Project:** Browser Agent
**Task ID:** T19
**Slug:** testing
**Issue:** #19
**类型:** testing
**Batch:** 9
**依赖:** T9-T18（全部功能模块就绪）

---

## 1. 目标

编写单元测试覆盖核心模块（Tool Registry、Guardrail、Agent Runtime、JSON-RPC、Conversation Manager、Provider Client），目标覆盖率 >70%。编写 Playwright E2E 测试覆盖核心用户流程（列出标签页、关闭确认、设置页面、会话管理、刷新不丢消息）。

---

## 2. 前置条件

- [x] T9-T18: 全部功能模块实现完毕
- [x] Vitest 已配置（`vitest.config.ts`）
- [x] Playwright 已安装（`@playwright/test`）
- [x] WXT 构建脚本可用（`npm run build`）

---

## 3. 实现步骤

### 3.1 单元测试基础设施

#### 3.1.1 Vitest 配置

**文件:** `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom", // 需要 DOM 环境的模块（如 Chat UI 组件）
    include: ["src/**/__tests__/**/*.test.ts", "src/**/__tests__/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/__tests__/**",
        "src/**/types.ts",       // 纯类型文件
        "src/**/index.ts",       // 导出文件
        "src/entrypoints/**",    // WXT 入口文件
      ],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70,
      },
    },
  },
});
```

#### 3.1.2 通用 Mock 基础设施

**文件:** `src/__tests__/mocks/browser-mock.ts`

```ts
// Mock chrome/browser API
export function createBrowserMock() {
  return {
    tabs: {
      query: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      move: vi.fn(),
      group: vi.fn(),
      ungroup: vi.fn(),
    },
    windows: {
      getAll: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      getCurrent: vi.fn(),
      getLastFocused: vi.fn(),
    },
    bookmarks: {
      search: vi.fn(),
      getTree: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    history: {
      search: vi.fn(),
      deleteUrl: vi.fn(),
      deleteRange: vi.fn(),
      deleteAll: vi.fn(),
    },
    downloads: {
      search: vi.fn(),
      download: vi.fn(),
      erase: vi.fn(),
      open: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    },
    cookies: {
      get: vi.fn(),
      getAll: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      getAllCookieStores: vi.fn(),
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
    },
  };
}
```

**文件:** `src/__tests__/mocks/jsonrpc-mock.ts`

```ts
// Mock JSON-RPC Client
export function createJsonRpcClientMock() {
  return {
    request: vi.fn(),
    notify: vi.fn(),
    onRequest: vi.fn(),
    onNotification: vi.fn(),
    disconnect: vi.fn(),
  };
}
```

**文件:** `src/__tests__/mocks/llm-mock.ts`

```ts
// Mock LLM Client（用于 Agent Runtime 测试）
export function createLlmClientMock() {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    checkHealth: vi.fn(),
  };
}
```

---

### 3.2 Tool Registry 测试

**文件:** `src/registry/__tests__/tool-registry.test.ts`

| 测试场景 | 测试内容 | 预期结果 |
|----------|----------|----------|
| 注册单个工具 | `register(tool)` | `getTool(name)` 返回该工具 |
| 批量注册 | `registerAll(tools)` | `getAllTools()` 返回全部工具 |
| 按类别过滤 | 注册不同 category 的工具 | `getToolsByCategory("tabs")` 只返回 tabs 工具 |
| OpenAI Schema 导出 | 注册 3 个工具 | `toOpenAISchema()` 返回 3 个 function schema |
| 卸载类别 | `unregisterCategory("bookmarks")` | 该类工具不再出现在 `getAllTools()` |
| 重复注册同名工具 | 两次 `register` 同名 | 抛出错误或覆盖（取决于实现选择） |
| 未注册工具查询 | `getTool("nonexistent")` | 返回 `undefined` |

**测试数据准备:**

```ts
const mockTool: ToolDefinition = {
  name: "tabs_query",
  description: "Query browser tabs",
  schema: {
    type: "object",
    properties: { active: { type: "boolean" } },
  },
  category: "tabs",
  riskLevel: "low",
  confirmationRequired: false,
  resultSensitivity: "low",
  execute: async () => ({ success: true, data: [] }),
};
```

---

### 3.3 Guardrail 测试

**文件:** `src/guardrail/__tests__/guardrail.test.ts`

| 测试场景 | 测试内容 | 预期结果 |
|----------|----------|----------|
| 低风险工具 | `check("tabs_query", {}, context)` | `riskLevel="low"`, `requiresConfirmation=false`, `requiresPreflight=false` |
| 高风险工具 | `check("tabs_remove", { tabIds: [1,2,3] }, context)` | `riskLevel="high"`, `requiresConfirmation=true`, `requiresPreflight=true` |
| Critical 工具 + 远程 Provider | `check("cookies_get", {}, { isLocalTrusted: false, ... })` | `dataSensitivity="critical"`, `reason` 包含 "禁止发送" |
| Critical 工具 + Local Trusted | `check("cookies_get", {}, { isLocalTrusted: true, ... })` | `allowed=true`, 但 `requiresConfirmation=true` |
| Expert Mode 工具未开启 | `check("proxy_set", {}, { expertModeEnabled: false, ... })` | `allowed=false`, reason 提示 Expert Mode 未开启 |
| Expert Mode 工具已开启 + 子开关关闭 | `check("proxy_set", {}, { expertModeEnabled: true, expertSwitches: { proxy: false } })` | `allowed=false` |
| Expert Mode 工具完全开启 | `check("proxy_set", {}, { expertModeEnabled: true, expertSwitches: { proxy: true } })` | `allowed=true`, `riskLevel="critical"` |
| 不存在的工具 | `check("nonexistent_tool", {}, context)` | `allowed=false`, reason 提示工具不存在 |
| 敏感数据 + 未授权会话 | `check("history_search", {}, { sessionGrants: { sensitiveDataAllowed: false } })` | `dataSensitivity="sensitive"`, `allowed=true`（执行允许，但外发需要授权） |

---

### 3.4 Agent Runtime 测试

**文件:** `src/agent/__tests__/agent-runtime.test.ts`

| 测试场景 | 测试内容 | 预期结果 |
|----------|----------|----------|
| 单轮对话（无工具调用） | LLM 返回 `finish_reason="stop"` | `finalMessage` 为 LLM 回复内容 |
| 单轮工具调用 | LLM 返回 1 个 tool_call | 工具执行 → 结果注入 → LLM 再次调用 → 返回最终回复 |
| 多轮工具调用 | LLM 返回 2 个 tool_call | 依次执行 → 结果注入 → 继续循环 |
| 达到最大轮次 | `maxToolRounds=2`，LLM 持续返回 tool_call | 第 3 轮时停止，返回错误提示 |
| Abort 中止 | 调用 `abort()` | `run()` 抛出 `AbortError`，已执行的工具调用记录在 `toolCalls` |
| LLM 返回无效 tool_call | tool_call name 不存在 | 错误反馈给 LLM，重试最多 3 次 |
| LLM 返回参数格式错误 | tool_call arguments 不是合法 JSON | 错误反馈给 LLM，重试 |
| LLM 调用超时 | fetch 超时 | 返回错误，`toolCalls` 包含已完成的部分 |
| 流式输出 | `chatStream` 模式 | `onStreamChunk` 回调被正确调用 |

**Mock 策略:**

```ts
// 构造模拟 LLM 响应序列
const mockLlmResponses = [
  // 第 1 轮：返回 tool_call
  {
    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "1", type: "function", function: { name: "tabs_query", arguments: '{"active":true}' } }] }, finish_reason: "tool_calls" }],
  },
  // 第 2 轮：返回最终文本
  {
    choices: [{ message: { role: "assistant", content: "你有 5 个活跃标签页" }, finish_reason: "stop" }],
  },
];

mockLlmClient.chat.mockImplementation(async () => mockLlmResponses.shift());
```

---

### 3.5 JSON-RPC 通信层测试

**文件:** `src/shared/jsonrpc/__tests__/jsonrpc-client.test.ts`

| 测试场景 | 测试内容 | 预期结果 |
|----------|----------|----------|
| 请求-响应 | `client.request("method", { key: "val" })` | 返回对端处理结果 |
| 超时处理 | 对端不响应 | Promise reject with timeout error |
| 并发请求 | 同时发 3 个请求 | 各自收到对应响应（通过 id 匹配） |
| 通知发送 | `client.notify("event", params)` | 对端 `onNotification` 被调用 |
| 接收通知 | 对端发通知 | 注册的 handler 被调用 |
| 断开重连 | `disconnect()` 后再 `request()` | 自动重连或抛出明确错误 |
| 错误响应 | 对端返回 `{ error: { code: -1, message: "..." } }` | Promise reject with error |

---

### 3.6 Conversation Manager 测试

**文件:** `src/conversation/__tests__/conversation-manager.test.ts`

| 测试场景 | 测试内容 | 预期结果 |
|----------|----------|----------|
| 创建会话 | `create("标题")` | 返回 Conversation，title 正确 |
| 创建会话（无标题） | `create()` | 自动生成标题（如 "新会话"） |
| 获取会话 | `get(id)` | 返回对应 Conversation |
| 获取不存在的会话 | `get("nonexistent")` | 返回 `undefined` |
| 列出会话 | `list()` | 返回所有会话，按 updatedAt 降序 |
| 更新会话 | `update(id, { title: "新标题" })` | updatedAt 自动更新 |
| 删除会话 | `delete(id)` | 会话和关联消息都被删除 |
| 添加消息 | `addMessage(convId, msg)` | 消息保存成功，会话 updatedAt 更新 |
| 获取最近消息 | `getRecentMessages(convId, 10)` | 返回最近 10 条，按时间升序 |
| 摘要触发判断 | `needsSummary(convId)` | 超过阈值返回 true |
| 生成摘要 | `generateSummary(convId, llmClient)` | 返回摘要文本，保存到会话 |

---

### 3.7 Provider Client 测试

**文件:** `src/provider/__tests__/llm-client.test.ts`

| 测试场景 | 测试内容 | 预期结果 |
|----------|----------|----------|
| 非流式聊天 | `chat(request)` | 返回 `ChatCompletionResponse` |
| 流式聊天 | `chatStream(request, onChunk)` | `onChunk` 被多次调用，最终 `finish_reason="stop"` |
| 流式 tool_call | `chatStream` 包含 tool_call | 正确拼接 tool_call arguments |
| 健康检查成功 | `checkHealth(config)` | 返回 `true` |
| 健康检查失败 | 端点不可达 | 返回 `false` |
| 请求超时 | 端点无响应 | Promise reject with timeout |
| Abort 中断 | 传入 AbortSignal → abort | Promise reject with AbortError |
| 非标准端点 | Ollama 格式响应 | 适配为标准 `ChatCompletionResponse` |

**Mock 策略:** 使用 `vi.fn()` Mock `fetch`，返回模拟的 `Response` 对象。

```ts
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve(mockResponse),
});
```

---

### 3.8 Chat UI 组件测试

**文件:** `src/app/components/__tests__/`

| 组件 | 测试场景 | 预期结果 |
|------|----------|----------|
| MessageBubble | 渲染用户消息 | 右对齐，蓝色背景 |
| MessageBubble | 渲染助手消息 | 左对齐，灰色背景 |
| MessageBubble | 流式渲染中 | 显示光标动画 |
| MessageBubble | XSS 内容 | HTML 标签被转义为文本 |
| ToolCallCard | 低风险工具 | 绿色边框 |
| ToolCallCard | 高风险工具 | 橙色边框 |
| ToolCallCard | 执行中 | 显示 loading spinner |
| ToolCallCard | 执行成功 | 显示绿色勾 |
| ToolCallCard | 执行失败 | 显示红色叉 |
| ConfirmDialog | 渲染影响对象列表 | 表格显示 title/url/reason |
| ConfirmDialog | 超过 10 个对象 | 折叠显示 "还有 N 个..." |
| ConfirmDialog | 点击确认 | `onConfirm` 被调用 |
| ConfirmDialog | 点击取消 | `onCancel` 被调用 |
| MessageInput | 空输入 | 发送按钮禁用 |
| MessageInput | 输入文本后发送 | `onSend(text)` 被调用 |
| MessageInput | 运行中 | 显示 Abort 按钮 |
| MessageInput | 点击 Abort | `onAbort()` 被调用 |

**测试环境:** `@testing-library/react` + `jsdom`

---

### 3.9 E2E 测试

**文件:** `e2e/` 目录

#### 3.9.1 Playwright 配置

**文件:** `playwright.config.ts`

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 1,
  use: {
    headless: false, // 浏览器扩展需要非 headless 模式
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chrome",
      use: {
        browserName: "chromium",
        // 加载已构建的扩展
        launchOptions: {
          args: [`--load-extension=${__dirname}/dist/chrome`],
        },
      },
    },
  ],
});
```

#### 3.9.2 E2E 测试用例

**文件:** `e2e/chat-flow.spec.ts`

| 测试名称 | 流程 | 验收点 |
|----------|------|--------|
| **E2E: 列出标签页** | 打开 Chat Page → 输入 "列出所有标签页" → 发送 | Agent 调用 `tabs_query` → 显示标签页列表 |
| **E2E: 关闭确认** | 输入 "关闭标签页 X" → 发送 → Agent 触发 `tabs_remove` | 弹出 ConfirmDialog → 显示影响清单 → 点击确认 → 标签页关闭 |
| **E2E: 设置页面** | 打开设置 → 添加 Provider 配置 → 保存 → 关闭设置 → 重新打开 | 配置已持久化 |
| **E2E: 会话管理** | 新建会话 → 发送消息 → 切换到其他会话 → 切回 | 消息隔离，会话正确切换 |
| **E2E: 刷新不丢消息** | 发送消息 → 等待回复 → 刷新页面 | 消息仍然存在（IndexedDB 持久化） |
| **E2E: Abort 中止** | 发送长任务请求 → 立即点击 Abort | Agent 停止运行，输入框恢复 |
| **E2E: 工具调用卡片** | 输入需要工具调用的请求 | 消息列表显示 ToolCallCard，含工具名称和状态 |

**E2E 测试实现要点:**

```ts
// e2e/chat-flow.spec.ts 示例

import { test, expect } from "@playwright/test";

// 辅助函数：打开扩展的 Chat Page
async function openChatPage(page) {
  // 扩展 ID 在构建后固定，需要从 manifest.json 获取
  // 或通过 chrome.management API 查询
  const extensionId = "your-extension-id"; // CI 中通过环境变量传入
  await page.goto(`chrome-extension://${extensionId}/chat.html`);
  await page.waitForSelector('[data-testid="chat-page"]');
}

test.describe("Chat Page", () => {
  test("E2E: 列出标签页", async ({ page }) => {
    await openChatPage(page);
    
    // 等待 Chat Page 加载完毕
    await page.waitForSelector('[data-testid="message-input"]');
    
    // 输入消息
    await page.fill('[data-testid="message-input"] textarea', "列出所有标签页");
    await page.click('[data-testid="send-button"]');
    
    // 等待 Agent 回复（超时 30s）
    await page.waitForSelector('[data-testid="message-bubble"][data-role="assistant"]', {
      timeout: 30000,
    });
    
    // 验证回复包含标签页信息
    const messages = await page.$$eval('[data-testid="message-bubble"]', els =>
      els.map(el => el.textContent)
    );
    expect(messages.some(m => m?.includes("标签页"))).toBeTruthy();
  });

  test("E2E: 关闭确认", async ({ page }) => {
    await openChatPage(page);
    
    // 先确保有标签页可关闭（创建测试标签页）
    // ...
    
    await page.fill('[data-testid="message-input"] textarea', "关闭所有标签页");
    await page.click('[data-testid="send-button"]');
    
    // 等待确认弹窗
    await page.waitForSelector('[data-testid="confirm-dialog"]', { timeout: 30000 });
    
    // 验证影响对象列表
    const affectedItems = await page.$$('[data-testid="affected-item"]');
    expect(affectedItems.length).toBeGreaterThan(0);
    
    // 点击确认
    await page.click('[data-testid="confirm-button"]');
    
    // 验证确认弹窗消失
    await page.waitForSelector('[data-testid="confirm-dialog"]', { state: "hidden" });
  });

  test("E2E: 设置页面", async ({ page }) => {
    await openChatPage(page);
    
    // 打开设置
    await page.click('[data-testid="settings-button"]');
    await page.waitForSelector('[data-testid="settings-panel"]');
    
    // 添加 Provider
    await page.click('[data-testid="add-provider-button"]');
    await page.fill('[data-testid="provider-name-input"]', "Test Provider");
    await page.fill('[data-testid="provider-endpoint-input"]', "http://localhost:11434/v1");
    await page.fill('[data-testid="provider-apikey-input"]', "ollama");
    await page.fill('[data-testid="provider-model-input"]', "llama3");
    await page.click('[data-testid="save-provider-button"]');
    
    // 关闭设置
    await page.click('[data-testid="close-settings-button"]');
    
    // 重新打开，验证持久化
    await page.click('[data-testid="settings-button"]');
    await page.waitForSelector('[data-testid="settings-panel"]');
    
    const nameValue = await page.inputValue('[data-testid="provider-name-input"]');
    expect(nameValue).toBe("Test Provider");
  });

  test("E2E: 刷新不丢消息", async ({ page }) => {
    await openChatPage(page);
    
    // 发送一条消息
    await page.fill('[data-testid="message-input"] textarea', "测试消息");
    await page.click('[data-testid="send-button"]');
    
    // 等待消息出现在列表中
    await page.waitForSelector('[data-testid="message-bubble"][data-role="user"]');
    
    // 刷新页面
    await page.reload();
    await page.waitForSelector('[data-testid="chat-page"]');
    
    // 验证消息仍然存在
    const messages = await page.$$('[data-testid="message-bubble"][data-role="user"]');
    expect(messages.length).toBeGreaterThan(0);
  });
});
```

#### 3.9.3 testid 标注

为支持 E2E 测试，所有关键 UI 元素需要添加 `data-testid` 属性：

| 元素 | data-testid |
|------|-------------|
| Chat Page 根节点 | `chat-page` |
| 消息气泡 | `message-bubble` + `data-role`（user/assistant/tool） |
| 消息输入区 | `message-input` |
| 发送按钮 | `send-button` |
| Abort 按钮 | `abort-button` |
| 确认弹窗 | `confirm-dialog` |
| 确认按钮 | `confirm-button` |
| 取消按钮 | `cancel-button` |
| 影响对象项 | `affected-item` |
| 设置按钮 | `settings-button` |
| 设置面板 | `settings-panel` |
| Provider 名称输入 | `provider-name-input` |
| Provider 端点输入 | `provider-endpoint-input` |
| API Key 输入 | `provider-apikey-input` |
| 模型输入 | `provider-model-input` |
| 保存 Provider | `save-provider-button` |
| 添加 Provider | `add-provider-button` |
| 关闭设置 | `close-settings-button` |
| 工具调用卡片 | `tool-call-card` |
| 侧边栏 | `conversation-sidebar` |
| 新建会话按钮 | `new-conversation-button` |
| 会话列表项 | `conversation-item` |

---

## 4. 接口/契约

### 4.1 测试命令

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed"
  }
}
```

### 4.2 CI 测试流程

```yaml
# .github/workflows/test.yml（示意）
test:
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npm run build:chrome   # E2E 需要构建产物
    - run: npm run test -- --coverage
    - run: npx playwright install chromium
    - run: npm run test:e2e
```

---

## 5. 测试指引

### 5.1 运行单元测试

```bash
# 运行所有单元测试
npm run test

# 运行单个模块测试
npx vitest run src/registry

# 生成覆盖率报告
npm run test:coverage
# 报告在 coverage/index.html
```

### 5.2 运行 E2E 测试

```bash
# 先构建扩展
npm run build:chrome

# 运行 E2E
npm run test:e2e

# 带 UI 调试
npm run test:e2e:ui

# 单个测试文件
npx playwright test e2e/chat-flow.spec.ts
```

---

## 6. 验收标准

- [ ] 单元测试覆盖率 >70%（`lines`, `branches`, `functions`, `statements`）
- [ ] `src/registry/` 测试覆盖所有 ToolRegistry 方法
- [ ] `src/guardrail/` 测试覆盖所有风险等级和场景组合
- [ ] `src/agent/` 测试覆盖单轮/多轮/Abort/错误重试
- [ ] `src/shared/jsonrpc/` 测试覆盖请求/响应/通知/超时/错误
- [ ] `src/conversation/` 测试覆盖 CRUD + 消息管理
- [ ] `src/provider/` 测试覆盖流式/非流式/健康检查/超时
- [ ] `src/tools/` 每个工具域至少 3 个测试
- [ ] E2E: 列出标签页 流程通过
- [ ] E2E: 关闭确认 流程通过
- [ ] E2E: 设置页面 流程通过
- [ ] E2E: 会话管理 流程通过
- [ ] E2E: 刷新不丢消息 流程通过

---

## 7. 注意事项

1. **Mock 策略:** 单元测试不依赖真实浏览器 API。所有 `browser.*` 调用通过 Mock 的 `IBrowserAdapter` 实现。JSON-RPC Client 使用 Mock，不实际建立 Port 连接。
2. **LLM Mock:** Agent Runtime 测试使用预定义的 Mock LLM 响应序列，不发送真实 HTTP 请求。
3. **E2E 环境:** E2E 需要非 headless 模式（浏览器扩展限制）。CI 中使用 `xvfb-run` 或配置 `headless: "shell"` 可能不可用，需要确认 Playwright 对扩展的支持。
4. **扩展 ID:** E2E 测试中 `chrome-extension://{id}/chat.html` 的扩展 ID 需要在 CI 中固定。WXT 支持通过 `wxt.config.ts` 中的 `manifestKey` 固定扩展 ID（仅开发模式）。
5. **E2E 数据准备:** 测试前需要确保有标签页、书签等数据可供操作。可以在测试的 `beforeEach` 中创建测试数据。
6. **覆盖率阈值:** 70% 是最低要求。核心模块（Tool Registry、Guardrail、Agent Runtime）应尽量达到 85%+。
7. **测试文件位置:** 遵循约定——每个模块的测试放在 `src/{module}/__tests__/` 目录下。E2E 测试放在根目录 `e2e/` 下。
8. **不测试的代码:** 纯类型定义文件（`types.ts`）、WXT 入口文件（`entrypoints/`）、纯导出文件（`index.ts`）不要求测试覆盖。
