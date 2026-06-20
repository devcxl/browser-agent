## 诊断报告

### 发现
Agent 调用 `notifications_create` 工具时，后台 RPC 路由器返回 `Method not found: notifications.create`（JSON-RPC 错误码 -32601），无法弹出桌面通知。

### 原因
调用链上存在三层缺失，导致 `rpc.request('notifications.create', params)` 无法抵达 `chrome.notifications.create()`：

1. **RPC 方法未注册**（`src/background/index.ts:25-50`）
   `initBackground()` 注册了 `tabs.*`、`windows.*`、`tabGroups.*`、`capability.detect`、`content.execute` 共 14 个 RPC 方法，但**没有 `notifications.create`**。`JsonRpcRouter.handle()` 在找不到 handler 时返回 `-32601 Method not found`。

2. **IBrowserAdapter 接口缺少 `notifications` 属性**（`src/adapters/types.ts:17-77`）
   接口定义了 `tabs`、`windows`、`tabGroups`、`addListener` 四个成员，没有 `notifications`。`initBackground()` 无法通过 adapter 层调用浏览器通知 API。

3. **ChromeAdapter / FirefoxAdapter 未实现通知 API**（`src/adapters/chrome-adapter.ts`、`firefox-adapter.ts`）
   两个适配器均未封装 `chrome.notifications.create()` / `browser.notifications.create()`。

权限已在 `wxt.config.ts:28-31` 中为 Chrome 声明（`notifications` 权限），且 `CapabilityDetector` 正确检测了 `notifications` 能力（`capability-detector.ts:38`），但权限和能力检测从未被实际使用。

### 修复建议
按以下顺序修改三个文件：

1. **`src/adapters/types.ts`** — 在 `IBrowserAdapter` 接口中新增 `notifications` 属性：
```ts
notifications: {
  create(options: { type?: string; iconUrl?: string; title: string; message: string; priority?: number }): Promise<string>;
};
```

2. **`src/adapters/chrome-adapter.ts`** — 实现 `notifications.create`，直接委托 `chrome.notifications.create`。

3. **`src/adapters/firefox-adapter.ts`** — 实现 `notifications.create`，Firefox 不支持 `requireInteraction` 等高级选项，但 `browser.notifications.create` 基本 API 可用。如果确实不可用，返回明确的功能不支持错误（而非静默失败）。

4. **`src/background/index.ts`** — 在 `initBackground()` 中注册 `notifications.create` RPC handler，通过 `adapter.notifications.create()` 调用。

5. **测试补充**：
   - `background-init.test.ts` 的 mockAdapter 中补充 `notifications` 属性
   - 新增 `notifications.create` RPC handler 的集成测试

### 验证方法
1. 修复前：通过 RPC 调用 `notifications.create`，确认返回 `-32601 Method not found`
2. 修复后：
   - 单元测试：`background-init.test.ts` 验证 mockAdapter 包含 `notifications`
   - 集成测试：通过 `router.handle({ method: 'notifications.create', params: {...} })` 确认返回成功
   - 手工验证：Chrome 下触发通知工具调用，确认桌面弹窗出现
   - Firefox 验证：确认不报 `-32601`，优雅返回功能状态
3. 运行 `pnpm test` 确认无回归
