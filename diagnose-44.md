## 诊断报告

### 发现

Chat UI 中 Agent 调用浏览器工具（如 `tabs.query`、`tabs.create`、`windows.getAll` 等）时，后台返回 JSON-RPC 错误 `Method not found: tabs.query`（错误码 -32601）。

### 原因

项目中存在**两条并行的 JSON-RPC 注册链路**，但实际运行的那条链路注册不全：

1. **`src/background/index.ts`** — 包含完整的 `initBackground()` 函数，注册了 16 个 RPC 方法（tabs.*、windows.*、tabGroups.*、capability.detect、content.execute），以及 BrowserEventHub 事件推送。但 **`initBackground()` 仅在测试文件中被调用**，从未在真正的 entrypoint 中被引用。

2. **`src/entrypoints/background.ts`** — 这是 WXT 实际运行的 background entrypoint。它只注册了 `capability.detect` 一个方法，没有注册 tabs/windows/tabGroups/content 等其他方法。

3. **客户端连接名不匹配**：Chat UI 中的 `JsonRpcClient` 使用连接名 `'chat-agent'`，而 `initBackground()` 的端口过滤条件是 `'chat-page'`。即使启用了 `initBackground()`，连接也会被过滤掉。

调用链：
```
工具执行 → rpc.request("tabs.query", params)
  → port.postMessage({ method: "tabs.query" })
    → BackgroundRpcServer.handleMessage()
      → requestHandlers.get("tabs.query") → undefined
        → 返回 METHOD_NOT_FOUND (-32601)
```

### 修复建议

将 `src/entrypoints/background.ts` 改为调用 `initBackground()`，并修复连接名不匹配的问题：

1. **替换实现**：在 `src/entrypoints/background.ts` 中调用 `src/background/index.ts` 的 `initBackground()`，而非自行实现残缺的注册逻辑
2. **连接名对齐**：将 `initBackground()` 中的端口过滤条件从 `'chat-page'` 改为 `'chat-agent'`（与客户端保持一致），或移除名称过滤
3. **保留副作用**：保留 `browser.action.onClicked` 监听（打开 Chat UI）

### 验证方法

1. 启动插件后，执行 `tabs.query`、`tabs.create` 等 RPC 调用，确认返回正确结果而非 Method not found
2. 运行现有测试：`npx vitest run src/background/__tests__/`
3. Chat UI 中 Agent 能正常执行工具操作
