## Agent Brief

**类别：** bug
**摘要：** 修复 `src/entrypoints/background.ts` 未调用 `initBackground()` 导致 RPC 方法注册不全，"Method not found" 错误

**当前行为：**
`src/entrypoints/background.ts`（WXT 实际运行的 background entrypoint）自行实现了残缺的 RPC 注册逻辑，仅注册了 `capability.detect` 一个方法。`src/background/index.ts` 中的 `initBackground()` 注册了全部 16 个方法（tabs.*、windows.*、tabGroups.*、content.*、capability.detect）以及 BrowserEventHub 事件推送，但从未被 entrypoint 调用。此外，`initBackground()` 的端口过滤条件为 `'chat-page'`，而 Chat UI 客户端使用的连接名为 `'chat-agent'`，即使启用也会被过滤。

**期望行为：**
- `src/entrypoints/background.ts` 调用 `initBackground()`，使所有 RPC 方法（tabs.*、windows.*、tabGroups.*、content.*、capability.detect）正确注册
- `initBackground()` 的端口过滤条件与客户端连接名 `'chat-agent'` 一致
- 保留 `browser.action.onClicked` 监听（打开 Chat UI）
- 所有现有测试通过

**关键接口：**
- `initBackground()` — 需要被 `src/entrypoints/background.ts` 调用
- `src/entrypoints/background.ts` — 需要从自定义实现改为调用 `initBackground()`
- `src/background/index.ts:58` — 端口名称过滤条件 `'chat-page'` → `'chat-agent'`

**验收标准：**
- [ ] `initBackground()` 被 `src/entrypoints/background.ts` 调用
- [ ] 端口过滤名称改为 `'chat-agent'` 与客户端一致
- [ ] `browser.action.onClicked` 监听保留
- [ ] `tabs.query` 等 RPC 方法不再返回 Method not found
- [ ] 现有测试全部通过（`npx vitest run src/background/__tests__/`）

**不在范围内：**
- 不修改客户端 `useAgent.ts` 中的连接名（已经是 `'chat-agent'`）
- 不修改 proxy 实现或工具注册逻辑
- 不修改 `src/background/jsonrpc-router.ts` 或 `src/shared/jsonrpc/` 相关代码
- 不涉及 Chat UI 的 UI 变更
