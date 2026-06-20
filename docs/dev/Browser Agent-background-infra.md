# 开发文档: T8 - Background JSON-RPC Router + API Proxy + Event Listener

**Project:** Browser Agent
**Task ID:** T8
**Slug:** background-infra
**Issue:** #8
**类型:** backend
**Batch:** 3
**依赖:** T1 (WXT 项目骨架), T2 (Browser Adapter), T3 (JSON-RPC 协议层), T4 (CapabilityDetector)

## 1. 目标

实现 Background Service Worker 的核心基础设施：JSON-RPC Router（请求路由）、TabsProxy / WindowsProxy / GroupsProxy（浏览器 API 代理）、BrowserEventHub（事件监听 + 500ms 防抖推送）、ContentBridge（Content Script 消息转发）。

## 2. 前置条件

- T1: WXT 项目骨架初始化完成，`src/background/` 目录存在
- T2: `src/adapters/` 模块完成，`IBrowserAdapter` 接口就绪
- T3: `src/shared/jsonrpc/` 完成 — `JsonRpcRequest`、`JsonRpcResponse`、`RpcMethodHandler` 类型定义
- T4: `CapabilityDetector` 完成

## 3. 实现步骤

### 3.1 JSON-RPC Router

- **文件:** `src/background/jsonrpc-router.ts`
- **关键逻辑:**
  1. 内部维护 `Map<string, RpcMethodHandler>` 映射 method → handler
  2. `register(method, handler)`: 注册方法处理器
  3. `handle(request)`: 接收 JSON-RPC 请求，路由到对应 handler，返回 response
  4. 错误处理：method 不存在返回 `-32601 Method not found`，handler 抛异常返回 `-32603 Internal error`

```ts
import type { JsonRpcRequest, JsonRpcResponse, RpcMethodHandler } from "../shared/jsonrpc/types";

export class JsonRpcRouter {
  private handlers = new Map<string, RpcMethodHandler>();

  register(method: string, handler: RpcMethodHandler): void {
    this.handlers.set(method, handler);
  }

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const handler = this.handlers.get(request.method);

    if (!handler) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      };
    }

    try {
      const result = await handler(request.params);
      return { jsonrpc: "2.0", id: request.id, result };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Internal error",
        },
      };
    }
  }
}
```

### 3.2 浏览器 API Proxy

- **文件:**
  - `src/background/proxies/tabs-proxy.ts`
  - `src/background/proxies/windows-proxy.ts`
  - `src/background/proxies/groups-proxy.ts`

- **关键逻辑:** 每个 Proxy 封装对应浏览器 API 的调用，统一错误处理和返回格式

#### TabsProxy

```ts
// src/background/proxies/tabs-proxy.ts
import type { IBrowserAdapter } from "../../adapters/types";

export class TabsProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async query(params: { queryInfo: browser.tabs.QueryInfo }) {
    return this.adapter.tabs.query(params.queryInfo);
  }

  async get(params: { tabId: number }) {
    return this.adapter.tabs.get(params.tabId);
  }

  async create(params: { createProperties: browser.tabs.CreateProperties }) {
    return this.adapter.tabs.create(params.createProperties);
  }

  async update(params: { tabId: number; updateProperties: browser.tabs.UpdateProperties }) {
    return this.adapter.tabs.update(params.tabId, params.updateProperties);
  }

  async remove(params: { tabIds: number[] }) {
    await this.adapter.tabs.remove(params.tabIds);
    return { removedCount: params.tabIds.length };
  }

  async move(params: { tabIds: number[]; moveProperties: { windowId?: number; index: number } }) {
    return this.adapter.tabs.move(params.tabIds, params.moveProperties);
  }

  async group(params: { tabIds: number[]; groupId?: number; createProperties?: { windowId?: number } }) {
    const groupId = await this.adapter.tabs.group(params);
    return { groupId };
  }

  async ungroup(params: { tabIds: number[] }) {
    await this.adapter.tabs.ungroup(params.tabIds);
  }
}
```

#### WindowsProxy

```ts
// src/background/proxies/windows-proxy.ts
import type { IBrowserAdapter } from "../../adapters/types";

export class WindowsProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async getAll(params?: { getInfo?: browser.windows.GetInfo }) {
    return this.adapter.windows.getAll(params?.getInfo);
  }

  async get(params: { windowId: number }) {
    return this.adapter.windows.get(params.windowId);
  }

  async create(params?: { createData?: browser.windows.CreateData }) {
    return this.adapter.windows.create(params?.createData);
  }

  async remove(params: { windowId: number }) {
    await this.adapter.windows.remove(params.windowId);
  }
}
```

#### GroupsProxy

```ts
// src/background/proxies/groups-proxy.ts
import type { IBrowserAdapter } from "../../adapters/types";

export class GroupsProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async query(params: { queryInfo: browser.tabGroups.QueryInfo }) {
    return this.adapter.tabGroups.query(params.queryInfo);
  }

  async update(params: { groupId: number; updateProperties: browser.tabGroups.UpdateProperties }) {
    return this.adapter.tabGroups.update(params.groupId, params.updateProperties);
  }
}
```

### 3.3 BrowserEventHub（事件监听 + 防抖）

- **文件:** `src/background/browser-event-hub.ts`
- **关键逻辑:**
  1. 监听 `tabs.onCreated/onUpdated/onRemoved/onMoved/onAttached/onDetached`、`windows.onCreated/onRemoved/onFocusChanged`、`tabGroups.onCreated/onUpdated/onRemoved`
  2. 防抖 500ms：收到第一个事件后启动 500ms 定时器，定时器到期前的新事件重置定时器
  3. 定时器到期后全量查询当前状态（`tabs.query({})` + `windows.getAll()` + `tabGroups.query({})`），构造 `BrowserState`
  4. 通过 JSON-RPC 通知发送到 Chat Page：`browser.stateChanged`

```ts
import type { IBrowserAdapter } from "../adapters/types";
import type { BrowserState } from "../shared/types/browser";

export class BrowserEventHub {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 500;
  private notifyCallback: ((state: BrowserState) => void) | null = null;

  constructor(private adapter: IBrowserAdapter) {}

  /** 注册状态变更通知回调（通常由 Background 入口调用，连接 Chat Page RPC） */
  onStateChanged(callback: (state: BrowserState) => void): void {
    this.notifyCallback = callback;
  }

  /** 启动所有事件监听 */
  start(): void {
    const events = [
      browser.tabs.onCreated,
      browser.tabs.onUpdated,
      browser.tabs.onRemoved,
      browser.tabs.onMoved,
      browser.tabs.onAttached,
      browser.tabs.onDetached,
      browser.windows.onCreated,
      browser.windows.onRemoved,
      browser.windows.onFocusChanged,
    ];

    // Chrome 专有事件
    if (this.adapter.browserType === "chrome" && browser.tabGroups) {
      events.push(
        browser.tabGroups.onCreated,
        browser.tabGroups.onUpdated,
        browser.tabGroups.onRemoved,
      );
    }

    for (const event of events) {
      event.addListener(() => this.scheduleSync());
    }
  }

  /** 防抖调度：重置定时器 */
  private scheduleSync(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.syncState(), this.DEBOUNCE_MS);
  }

  /** 全量查询当前状态并推送 */
  private async syncState(): Promise<void> {
    try {
      const [tabs, windows, tabGroups] = await Promise.all([
        this.adapter.tabs.query({}),
        this.adapter.windows.getAll(),
        this.adapter.browserType === "chrome"
          ? this.adapter.tabGroups.query({})
          : Promise.resolve([]),
      ]);

      const state: BrowserState = {
        windows,
        tabs,
        tabGroups,
        capturedAt: Date.now(),
      };

      this.notifyCallback?.(state);
    } catch (err) {
      console.error("[BrowserEventHub] syncState failed:", err);
    }
  }
}
```

### 3.4 ContentBridge（Content Script 消息转发）

- **文件:** `src/background/content-bridge.ts`
- **关键逻辑:**
  1. 提供 `sendToContent(tabId, method, params)` 方法
  2. 通过 `browser.tabs.sendMessage(tabId, { method, params })` 转发到 Content Script
  3. 返回 Content Script 的 JSON-RPC 响应

```ts
export class ContentBridge {
  async sendToContent(tabId: number, method: string, params?: Record<string, unknown>): Promise<unknown> {
    const response = await browser.tabs.sendMessage(tabId, {
      jsonrpc: "2.0",
      method,
      params,
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result;
  }
}
```

### 3.5 Background 入口整合

- **文件:** `src/background/index.ts`
- **关键逻辑:**
  1. 初始化 BrowserAdapter（根据 UA 选择 Chrome/Firefox）
  2. 初始化 JsonRpcRouter，注册所有 RPC 方法
  3. 初始化 TabsProxy / WindowsProxy / GroupsProxy，注册对应 RPC handler
  4. 初始化 CapabilityDetector，注册 `capability.detect`
  5. 初始化 BrowserEventHub，启动事件监听
  6. 初始化 ContentBridge，注册 `content.execute`
  7. 处理 `browser.runtime.onConnect`，建立与 Chat Page 的 Port 连接

```ts
// src/background/index.ts 伪代码结构
import { JsonRpcRouter } from "./jsonrpc-router";
import { TabsProxy } from "./proxies/tabs-proxy";
import { WindowsProxy } from "./proxies/windows-proxy";
import { GroupsProxy } from "./proxies/groups-proxy";
import { BrowserEventHub } from "./browser-event-hub";
import { CapabilityDetector } from "./capability-detector";
import { ContentBridge } from "./content-bridge";
import { createAdapter } from "../adapters";

const adapter = createAdapter();
const router = new JsonRpcRouter();
const tabsProxy = new TabsProxy(adapter);
const windowsProxy = new WindowsProxy(adapter);
const groupsProxy = new GroupsProxy(adapter);
const eventHub = new BrowserEventHub(adapter);
const capabilityDetector = new CapabilityDetector(adapter);
const contentBridge = new ContentBridge();

// 注册 RPC 方法
router.register("tabs.query", (p) => tabsProxy.query(p as any));
router.register("tabs.get", (p) => tabsProxy.get(p as any));
router.register("tabs.create", (p) => tabsProxy.create(p as any));
router.register("tabs.update", (p) => tabsProxy.update(p as any));
router.register("tabs.remove", (p) => tabsProxy.remove(p as any));
router.register("tabs.move", (p) => tabsProxy.move(p as any));
router.register("tabs.group", (p) => tabsProxy.group(p as any));
router.register("tabs.ungroup", (p) => tabsProxy.ungroup(p as any));
router.register("windows.getAll", (p) => windowsProxy.getAll(p as any));
router.register("windows.get", (p) => windowsProxy.get(p as any));
router.register("windows.create", (p) => windowsProxy.create(p as any));
router.register("windows.remove", (p) => windowsProxy.remove(p as any));
router.register("tabGroups.query", (p) => groupsProxy.query(p as any));
router.register("tabGroups.update", (p) => groupsProxy.update(p as any));
router.register("capability.detect", () => capabilityDetector.detect());
router.register("content.execute", (p) => contentBridge.sendToContent(
  (p as any).tabId, (p as any).method, (p as any).params
));

// 监听 Chat Page 连接
browser.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener(async (message) => {
    if (message.jsonrpc === "2.0" && message.id !== undefined) {
      const response = await router.handle(message);
      port.postMessage(response);
    }
  });
});

// 事件推送：Chat Page 连接后发送初始状态
eventHub.onStateChanged((state) => {
  // 广播到所有已连接的 Chat Page Port
  // 实现方式：维护一个 ports Set，遍历发送通知
});

eventHub.start();
```

## 4. 接口/契约

### 4.1 JSON-RPC 方法

| 方法 | Proxy | 参数 | 返回 |
|------|-------|------|------|
| `tabs.query` | TabsProxy | `{ queryInfo }` | `Tab[]` |
| `tabs.get` | TabsProxy | `{ tabId }` | `Tab` |
| `tabs.create` | TabsProxy | `{ createProperties }` | `Tab` |
| `tabs.update` | TabsProxy | `{ tabId, updateProperties }` | `Tab` |
| `tabs.remove` | TabsProxy | `{ tabIds }` | `{ removedCount }` |
| `tabs.move` | TabsProxy | `{ tabIds, moveProperties }` | `Tab[]` |
| `tabs.group` | TabsProxy | `{ tabIds, groupId?, createProperties? }` | `{ groupId }` |
| `tabs.ungroup` | TabsProxy | `{ tabIds }` | `void` |
| `windows.getAll` | WindowsProxy | `{ getInfo? }` | `Window[]` |
| `windows.get` | WindowsProxy | `{ windowId }` | `Window` |
| `windows.create` | WindowsProxy | `{ createData? }` | `Window` |
| `windows.remove` | WindowsProxy | `{ windowId }` | `void` |
| `tabGroups.query` | GroupsProxy | `{ queryInfo }` | `TabGroup[]` |
| `tabGroups.update` | GroupsProxy | `{ groupId, updateProperties }` | `TabGroup` |
| `capability.detect` | - | 无 | `Capabilities` |
| `content.execute` | ContentBridge | `{ tabId, method, params }` | `unknown` |

### 4.2 通知（Background → Chat Page）

| 方法 | 参数 | 说明 |
|------|------|------|
| `browser.stateChanged` | `{ state: BrowserState }` | 浏览器状态变更全量推送 |

### 4.3 关键类型

```ts
interface BrowserState {
  windows: Window[];
  tabs: Tab[];
  tabGroups: TabGroup[];
  capturedAt: number;
}
```

## 5. 测试指引

### 5.1 单元测试

- **文件:** `src/background/__tests__/`

**测试场景：**

1. **JsonRpcRouter 路由正常**
   - 注册 handler，发送匹配的 request
   - 预期：返回 handler 的结果
   - 发送不匹配的 request
   - 预期：返回 `-32601 Method not found`

2. **JsonRpcRouter handler 抛异常**
   - 注册会 throw 的 handler
   - 预期：返回 `-32603 Internal error`，message 为 Error.message

3. **TabsProxy 透传调用**
   - Mock `IBrowserAdapter`，调用 `tabsProxy.query({ queryInfo: {} })`
   - 预期：`adapter.tabs.query` 被调用，参数正确

4. **BrowserEventHub 防抖生效**
   - 快速触发 3 次事件（间隔 < 500ms）
   - 预期：`syncState` 只被调用 1 次（在最后一次事件后 500ms）

5. **BrowserEventHub 推送 BrowserState**
   - Mock adapter 的 query 方法返回预设数据
   - 触发事件，等待 500ms
   - 预期：`onStateChanged` 回调被调用，state 包含 tabs/windows/tabGroups

6. **ContentBridge 转发**
   - Mock `browser.tabs.sendMessage`
   - 调用 `contentBridge.sendToContent(1, "page.getContent")`
   - 预期：`browser.tabs.sendMessage` 被调用，参数包含 tabId 和 JSON-RPC 格式消息

7. **Service Worker 休眠后唤醒**
   - 模拟 `browser.runtime.onConnect` 触发
   - 预期：Router 能正常处理请求（WXT 框架层面保证，测试验证 Port 连接建立和消息处理流程）

## 6. 验收标准

- [ ] JSON-RPC Router 正常路由请求到对应 handler
- [ ] TabsProxy / WindowsProxy / GroupsProxy 正确封装浏览器 API 调用
- [ ] BrowserEventHub 防抖 500ms 生效，批量事件合并为一次全量推送
- [ ] ContentBridge 正确转发消息到 Content Script
- [ ] Service Worker 休眠后能被 `browser.runtime.connect()` 唤醒
- [ ] `browser.stateChanged` 通知正常推送到 Chat Page

## 7. 注意事项

1. **Service Worker 生命周期**：Chrome MV3 的 Service Worker 会在空闲时被休眠。关键操作前应通过 `browser.runtime.connect()` 唤醒。WXT 框架已处理部分细节，但仍需注意：
   - 不要在 Service Worker 中保存内存状态（如会话数据、聊天记录）
   - 所有持久化状态存 IndexedDB 或 `chrome.storage.local`
   - BrowserEventHub 的事件监听器会在 SW 唤醒后重新注册

2. **Firefox 事件兼容**：`browser.tabGroups` 在 Firefox 中为 undefined，`BrowserEventHub.start()` 中需要检查 `browser.tabGroups` 是否存在再注册监听。

3. **防抖 vs 节流**：这里使用防抖（debounce）而非节流（throttle），因为我们要的是"连续事件停止后再同步"，而非"每隔固定时间同步一次"。防抖可以避免频繁的全量查询。

4. **全量同步 vs 增量更新**：采用全量同步（`tabs.query({})`）而非增量事件驱动，原因：
   - 增量状态机容易出错（事件丢失、顺序错乱）
   - 全量查询在本地执行，性能开销很小
   - 简单可靠

5. **Port 连接管理**：Background 需要维护已连接的 Chat Page Port 集合，用于事件广播。Chat Page 断开时需从集合中移除。

6. **错误隔离**：单个 Proxy 方法的异常不应导致整个 Router 崩溃。Router 的 try/catch 已确保异常被转换为 JSON-RPC 错误响应。
