## Agent Brief

**类别：** bug
**摘要：** notifications.create RPC 方法未注册导致工具调用失败（Method not found: -32601）

**当前行为：**
Agent 调用 `notifications_create` 工具时，`rpc.request('notifications.create', params)` 经由 `JsonRpcRouter.handle()` 查找 handler，因 `initBackground()` 中未注册该方法，路由器返回 `{ error: { code: -32601, message: "Method not found: notifications.create" } }`。

**期望行为：**
- `notifications.create` RPC 方法在 `initBackground()` 中注册
- Handler 通过 `adapter.notifications.create()` 调用浏览器原生 API
- Chrome 下通过 `chrome.notifications.create()` 创建桌面通知
- Firefox 下优雅降级（`browser.notifications.create` 不可用时返回明确错误信息）
- `IBrowserAdapter` 接口包含 `notifications` 属性，`ChromeAdapter` / `FirefoxAdapter` 均实现

**关键接口：**

1. `IBrowserAdapter`（`src/adapters/types.ts`）新增：
```ts
notifications: {
  create(options: NotificationsCreateOptions): Promise<string>;
};
```

2. `ChromeAdapter`（`src/adapters/chrome-adapter.ts`）新增：
```ts
notifications = {
  create: (options) => {
    // 需要先解析 iconUrl，Chrome 要求 iconUrl 存在时也指定 type
    return new Promise((resolve) => {
      chrome.notifications.create('', options as any, (id) => resolve(id));
    });
  },
};
```

3. `FirefoxAdapter`（`src/adapters/firefox-adapter.ts`）新增：
```ts
notifications = {
  create: (options) => {
    if (typeof this.browser?.notifications?.create !== 'function') {
      return Promise.reject(new Error('notifications API not available in this Firefox version'));
    }
    return this.browser.notifications.create(options);
  },
};
```

4. `initBackground()`（`src/background/index.ts`）新增注册：
```ts
router.register('notifications.create', (p) => adapter.notifications.create(p as any));
```

**受影响文件：**
- `src/adapters/types.ts` — 新增 `notifications` 属性到 `IBrowserAdapter`
- `src/adapters/chrome-adapter.ts` — 实现 `notifications.create`
- `src/adapters/firefox-adapter.ts` — 实现 `notifications.create`（含降级）
- `src/background/index.ts` — 注册 `notifications.create` RPC handler
- `src/background/__tests__/background-init.test.ts` — mockAdapter 补充 `notifications`
- `src/tools/misc/__tests__/misc-tools.test.ts` — 无需修改（仅测试工具定义层，不测试 RPC 路由层）

**验收标准：**
- [ ] 修复前可复现：`router.handle({ method: 'notifications.create', ... })` 返回 `-32601`
- [ ] 修复后 `router.handle({ method: 'notifications.create', ... })` 返回成功 result
- [ ] `background-init.test.ts` 的 mockAdapter 包含 `notifications` 属性，测试通过
- [ ] Chrome 下 `adapter.notifications.create()` 调用 `chrome.notifications.create`
- [ ] Firefox 下不抛出未捕获异常，返回语义化错误
- [ ] `pnpm test` 全部通过，无回归

**不在范围内：**
- 不实现 `notifications.clear`、`notifications.getAll`、`notifications.update` 等其他通知 API
- 不修改 `wxt.config.ts`（权限已声明）
- 不修改 `CapabilityDetector`（检测逻辑已有）
- 不添加通知点击事件处理
