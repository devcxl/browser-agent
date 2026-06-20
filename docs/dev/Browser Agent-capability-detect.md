# 开发文档: T7 - Capability Detector

**Project:** Browser Agent
**Task ID:** T7
**Slug:** capability-detect
**Issue:** #7
**类型:** backend
**Batch:** 3
**依赖:** T2 (Browser Adapter), T3 (Browser API Proxy 基础)

## 1. 目标

实现 `CapabilityDetector`，在 Background Service Worker 中检测当前浏览器可用的扩展 API 能力，覆盖 17 个能力域，通过 JSON-RPC 对外暴露 `capability.detect` 方法。

## 2. 前置条件

- T2: `src/adapters/` 模块完成 — `IBrowserAdapter` 接口就绪，能判断 `browserType`
- T3: `src/background/` 基础结构就绪 — JSON-RPC Router 可接收请求
- T5: `src/shared/jsonrpc/` 完成 — RPC 通信正常

## 3. 实现步骤

### 3.1 类型定义

- **文件:** `src/shared/types/browser.ts`（追加）
- **关键逻辑:** 定义 `Capabilities` 接口，覆盖 17 个能力域

```ts
interface Capabilities {
  // 核心能力（MVP 阶段必需）
  tabs: boolean;
  windows: boolean;
  tabGroups: boolean;       // Firefox 为 false
  bookmarks: boolean;
  history: boolean;
  downloads: boolean;
  cookies: boolean;
  sessions: boolean;
  scripting: boolean;
  clipboard: boolean;
  notifications: boolean;
  contextMenus: boolean;
  sidePanel: boolean;       // Firefox 为 false
  alarms: boolean;

  // Expert 能力
  proxy: boolean;
  privacy: boolean;
  management: boolean;
  debugger: boolean;
  webRequest: boolean;
  declarativeNetRequest: boolean;
  nativeMessaging: boolean;
  identity: boolean;
}
```

### 3.2 检测实现

- **文件:** `src/background/capability-detector.ts`
- **关键逻辑:**

```ts
import type { IBrowserAdapter } from "../adapters/types";
import type { Capabilities } from "../shared/types/browser";

export class CapabilityDetector {
  private cache: Capabilities | null = null;

  constructor(private adapter: IBrowserAdapter) {}

  /**
   * 检测当前浏览器所有扩展 API 能力。
   * 结果缓存，后续调用直接返回缓存。
   * 如果需强制刷新，调用 invalidateCache() 后再 detect()。
   */
  detect(): Capabilities {
    if (this.cache) return { ...this.cache };

    const isChrome = this.adapter.browserType === "chrome";

    this.cache = {
      tabs: true,
      windows: true,
      tabGroups: isChrome,          // Firefox 不支持 tabGroups API
      bookmarks: true,
      history: true,
      downloads: true,
      cookies: true,
      sessions: this.checkApi("sessions"),
      scripting: this.checkApi("scripting"),
      clipboard: isChrome,          // clipboardRead/clipboardWrite 仅 Chrome
      notifications: this.checkApi("notifications"),
      contextMenus: this.checkApi("contextMenus"),
      sidePanel: isChrome,          // sidePanel 仅 Chrome
      alarms: this.checkApi("alarms"),

      // Expert 能力
      proxy: this.checkApi("proxy"),
      privacy: this.checkApi("privacy"),
      management: this.checkApi("management"),
      debugger: this.checkApi("debugger"),
      webRequest: this.checkApi("webRequest"),
      declarativeNetRequest: this.checkApi("declarativeNetRequest"),
      nativeMessaging: this.checkApi("runtime") && "connectNative" in browser.runtime,
      identity: this.checkApi("identity"),
    };

    return { ...this.cache };
  }

  /** 清除缓存，下次 detect() 重新检测 */
  invalidateCache(): void {
    this.cache = null;
  }

  /** 检查全局 browser 对象上是否存在某 API 命名空间 */
  private checkApi(namespace: string): boolean {
    return typeof (browser as any)?.[namespace] !== "undefined";
  }
}
```

**检测策略说明：**

| 能力域 | 检测方式 | 说明 |
|--------|----------|------|
| `tabs`, `windows`, `bookmarks`, `history`, `downloads`, `cookies` | 硬编码 `true` | 双浏览器核心 API，manifest 中声明权限即认为可用 |
| `tabGroups` | `isChrome` | Firefox 完全不支持此 API |
| `sidePanel` | `isChrome` | Chrome 专有 API |
| `clipboard` | `isChrome` | Chrome 有 clipboardRead/clipboardWrite，Firefox 无对应 API |
| `sessions`, `scripting`, `notifications`, `contextMenus`, `alarms` | `checkApi()` | 运行时检查 `browser.*` 命名空间 |
| `proxy`, `privacy`, `management`, `debugger`, `webRequest`, `declarativeNetRequest`, `identity` | `checkApi()` | Expert 能力，运行时检查 |
| `nativeMessaging` | `checkApi("runtime")` + `connectNative` | 检查 `browser.runtime.connectNative` 是否存在 |

### 3.3 JSON-RPC 注册

- **文件:** `src/background/index.ts`（Background 入口）
- **关键逻辑:** 在 JSON-RPC Router 中注册 `capability.detect` 方法

```ts
import { CapabilityDetector } from "./capability-detector";

const capabilityDetector = new CapabilityDetector(adapter);

router.register("capability.detect", async () => {
  return capabilityDetector.detect();
});
```

### 3.4 模块导出

- **文件:** `src/background/index.ts`
- 导出 `CapabilityDetector` 类，供 Background 入口初始化

## 4. 接口/契约

### 4.1 JSON-RPC 方法

| 方法 | 描述 | 参数 | 返回 |
|------|------|------|------|
| `capability.detect` | 检测浏览器能力 | 无 | `Capabilities` |

**响应示例（Chrome）：**
```json
{
  "tabs": true,
  "windows": true,
  "tabGroups": true,
  "sidePanel": true,
  "clipboard": true,
  ...
}
```

**响应示例（Firefox）：**
```json
{
  "tabs": true,
  "windows": true,
  "tabGroups": false,
  "sidePanel": false,
  "clipboard": false,
  ...
}
```

### 4.2 依赖关系

```
background/capability-detector.ts → adapters/types.ts (IBrowserAdapter)
                                  → shared/types/browser.ts (Capabilities)
```

## 5. 测试指引

### 5.1 单元测试

- **文件:** `src/background/__tests__/capability-detector.test.ts`
- **测试框架:** Vitest + mock `IBrowserAdapter`

**测试场景：**

1. **Chrome 环境检测**
   - Mock `IBrowserAdapter`，`browserType = "chrome"`
   - 预期：`tabGroups: true`，`sidePanel: true`，`clipboard: true`

2. **Firefox 环境检测**
   - Mock `IBrowserAdapter`，`browserType = "firefox"`
   - 预期：`tabGroups: false`，`sidePanel: false`，`clipboard: false`

3. **缓存生效**
   - 首次调用 `detect()` 后修改 mock adapter 的 browserType
   - 再次调用 `detect()` 
   - 预期：返回缓存结果（与首次一致），不响应 adapter 变更

4. **缓存失效**
   - 首次调用 `detect()` → 调用 `invalidateCache()` → 修改 mock adapter → 再次 `detect()`
   - 预期：返回新结果

5. **checkApi 运行时检测**
   - Mock `browser` 全局对象，设置 `browser.scripting` 为 undefined
   - 预期：`scripting: false`
   - Mock `browser.scripting` 存在
   - 预期：`scripting: true`

6. **JSON-RPC 方法正常**
   - 通过 RPC Client 调用 `capability.detect`
   - 预期：返回 Capabilities 对象，字段完整

7. **返回结果独立性**
   - 调用 `detect()` 获取结果，修改返回值中的字段
   - 再次调用 `detect()`
   - 预期：两次返回对象不共享引用（缓存返回的是浅拷贝）

## 6. 验收标准

- [ ] Chrome 环境检测：`tabGroups`、`sidePanel` 为 `true`
- [ ] Firefox 环境检测：`tabGroups`、`sidePanel` 为 `false`
- [ ] JSON-RPC 方法 `capability.detect` 正常响应
- [ ] 缓存生效：首次检测后缓存结果，后续调用返回缓存
- [ ] `invalidateCache()` 后重新检测
- [ ] 17 个能力域全部覆盖，无遗漏

## 7. 注意事项

1. **运行环境**：CapabilityDetector 运行在 Background Service Worker，使用 `browser` 全局对象（WXT 自动 polyfill Chrome 的 `chrome` API 为 `browser`）。
2. **缓存策略**：浏览器能力在扩展生命周期内不会改变，缓存是安全的。不需要定时刷新。
3. **Firefox 特殊处理**：`tabGroups`、`sidePanel`、`clipboard` 直接用 `browserType` 判断，不做运行时检查，因为 Firefox 文档明确不支持这些 API。
4. **Expert 能力**：`proxy`、`privacy` 等 Expert 能力即使 `checkApi` 返回 `true`，也需要在 manifest 中声明对应权限才能真正使用。检测结果仅表示"API 命名空间存在"，不表示"权限已授权"。
5. **缓存返回拷贝**：`detect()` 返回 `{ ...this.cache }` 浅拷贝，防止调用方修改缓存对象。
6. **与 Tool Registry 的集成**：CapabilityDetector 的结果由调用方在工具注册前使用。例如在 `src/tools/index.ts` 中：
   ```ts
   const capabilities = await rpcClient.request("capability.detect");
   if (capabilities.tabGroups) {
     registry.registerAll(tabGroupTools);
   }
   ```
