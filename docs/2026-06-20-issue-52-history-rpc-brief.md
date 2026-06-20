## Agent Brief

**类别：** bug
**摘要：** 补齐 history.search / history.delete / history.deleteAll 的完整 RPC 调用链，从 adapter 接口定义到 background 注册。

**当前行为：**

`history_search`、`history_delete`、`history_deleteAll` 三个工具执行时，通过 `rpc.request()` 分别调用 `history.search`、`history.delete`、`history.deleteAll` 三个 RPC 方法。但 `JsonRpcRouter` 中这三个 handler 均未注册，返回 `-32601 Method not found` 错误。

**期望行为：**

三个工具正常执行：
- `history.search` — 接收 `{ text, startTime?, endTime?, maxResults? }`，调用 `chrome.history.search()` 返回匹配的 `HistoryItem[]`
- `history.delete` — 接收 `{ url, startTime?, endTime? }`，调用 `chrome.history.deleteUrl()` 或 `chrome.history.deleteRange()` 删除历史记录
- `history.deleteAll` — 调用 `chrome.history.deleteAll()` 清空全部历史

Firefox 下使用 `browser.history.*` 对应 API。两个浏览器 API 签名完全兼容。

**关键接口：**

- `IBrowserAdapter`（`src/adapters/types.ts`）— 需新增 `history` 子对象，包含 `search`、`deleteUrl`、`deleteRange`、`deleteAll` 四个方法
- `ChromeAdapter` / `FirefoxAdapter` — 分别实现 `adapter.history.*`，直接委托给 `chrome.history` / `browser.history`
- `HistoryProxy`（新建 `src/background/proxies/history-proxy.ts`）— 遵循 TabsProxy/WindowsProxy/GroupsProxy 模式：构造时接收 `IBrowserAdapter`，方法委托给 `adapter.history.*`
- `initBackground()`（`src/background/index.ts`）— 实例化 `HistoryProxy` 并注册三个方法：`history.search`、`history.delete`、`history.deleteAll`
- 新增类型：`HistoryItem`、`HistorySearchParams`、`HistoryDeleteParams`（`src/shared/types/browser.ts`）

**验收标准：**

- [ ] 修复前能复现 bug — 发送 `{"jsonrpc":"2.0","id":1,"method":"history.search","params":{"text":"test"}}` 返回 `-32601 Method not found`
- [ ] 修复后 `history.search` 路由返回正确 `HistoryItem[]` 结果
- [ ] 修复后 `history.delete` 路由正常执行（按 URL 或时间范围删除）
- [ ] 修复后 `history.deleteAll` 路由正常清空历史
- [ ] 现有 proxy 相关单元测试全部通过（tabs/windows/groups）
- [ ] ChromeAdapter / FirefoxAdapter 的 `history` 属性在两种浏览器上均正确委托
- [ ] 无回归 — tabs/windows/tabGroups 的 RPC 调用不受影响

**不在范围内：**

- 不处理 bookmarks / downloads / cookies / sessions 的 RPC 注册问题（这些可能存在同类 bug，但属于独立 issue）
- 不修改 `history-tools.ts` 中的工具定义（工具层本身正确，只需补齐后台调用链）
- 不添加 history 事件的监听（如 `onVisited`、`onVisitRemoved`）
