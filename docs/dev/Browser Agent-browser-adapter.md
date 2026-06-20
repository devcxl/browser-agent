# 开发文档: T3 - Browser Adapter 接口 + Chrome/Firefox 实现

**Project:** Browser Agent
**Task ID:** T3
**Slug:** browser-adapter
**Issue:** #3
**类型:** backend
**Batch:** 2
**依赖:** T1（项目骨架）, T2（共享类型）

## 1. 目标

定义 `IBrowserAdapter` 接口，封装 Chrome/Firefox extensions API 差异。实现 `ChromeAdapter` 和 `FirefoxAdapter`，运行时按 `navigator.userAgent` 自动选择。

## 2. 前置条件

- T1 完成：项目骨架、构建配置就绪
- T2 完成：`Tab`、`Window`、`TabGroup` 等类型已定义

## 3. 实现步骤

### 3.1 接口定义

**文件: `src/adapters/types.ts`**

```ts
import type {
  Tab,
  Window,
  TabGroup,
  TabQueryInfo,
  TabCreateProperties,
  TabUpdateProperties,
  WindowGetInfo,
  WindowCreateData,
  WindowUpdateInfo,
  TabGroupQueryInfo,
  TabGroupUpdateProperties,
} from '@/shared/types';

// ==================== IBrowserAdapter ====================

export interface IBrowserAdapter {
  /** 浏览器标识 */
  readonly browserType: 'chrome' | 'firefox';

  // ── Tabs ────────────────────────────────────────────

  tabs: {
    query(queryInfo: TabQueryInfo): Promise<Tab[]>;
    get(tabId: number): Promise<Tab>;
    create(createProperties: TabCreateProperties): Promise<Tab>;
    update(tabId: number, updateProperties: TabUpdateProperties): Promise<Tab>;
    remove(tabIds: number | number[]): Promise<void>;
    move(
      tabIds: number | number[],
      moveProperties: { windowId?: number; index: number },
    ): Promise<Tab | Tab[]>;
    group(options: {
      tabIds: number | number[];
      groupId?: number;
      createProperties?: { windowId?: number };
    }): Promise<number>;
    ungroup(tabIds: number | number[]): Promise<void>;
    /** 获取当前窗口的活跃标签页 */
    getCurrent(): Promise<Tab>;
    /** 重新加载标签页 */
    reload(tabId: number): Promise<void>;
    /** 复制标签页 */
    duplicate(tabId: number): Promise<Tab>;
    /** 高亮标签页 */
    highlight(highlightInfo: { tabs: number[] | number; windowId?: number }): Promise<Window>;
  };

  // ── Windows ─────────────────────────────────────────

  windows: {
    getAll(getInfo?: WindowGetInfo): Promise<Window[]>;
    get(windowId: number, getInfo?: WindowGetInfo): Promise<Window>;
    create(createData?: WindowCreateData): Promise<Window>;
    update(windowId: number, updateInfo: WindowUpdateInfo): Promise<Window>;
    remove(windowId: number): Promise<void>;
    getCurrent(getInfo?: WindowGetInfo): Promise<Window>;
    getLastFocused(getInfo?: WindowGetInfo): Promise<Window>;
  };

  // ── TabGroups ───────────────────────────────────────

  tabGroups: {
    query(queryInfo: TabGroupQueryInfo): Promise<TabGroup[]>;
    get(groupId: number): Promise<TabGroup>;
    update(groupId: number, updateProperties: TabGroupUpdateProperties): Promise<TabGroup>;
    move(
      groupId: number,
      moveProperties: { windowId?: number; index: number },
    ): Promise<TabGroup>;
  };

  // ── Event 注册 ──────────────────────────────────────

  /** 添加事件监听器，返回取消监听的函数 */
  addListener(event: BrowserEvent, callback: (...args: any[]) => void): () => void;
}

// ==================== 浏览器事件枚举 ====================

export enum BrowserEvent {
  TAB_CREATED = 'tabs.onCreated',
  TAB_UPDATED = 'tabs.onUpdated',
  TAB_REMOVED = 'tabs.onRemoved',
  TAB_MOVED = 'tabs.onMoved',
  TAB_ATTACHED = 'tabs.onAttached',
  TAB_DETACHED = 'tabs.onDetached',
  TAB_ACTIVATED = 'tabs.onActivated',
  WINDOW_CREATED = 'windows.onCreated',
  WINDOW_REMOVED = 'windows.onRemoved',
  WINDOW_FOCUS_CHANGED = 'windows.onFocusChanged',
  TAB_GROUP_UPDATED = 'tabGroups.onUpdated',
  TAB_GROUP_MOVED = 'tabGroups.onMoved',
}

// ==================== 工厂函数类型 ====================

export type AdapterFactory = () => IBrowserAdapter;
```

### 3.2 ChromeAdapter 实现

**文件: `src/adapters/chrome-adapter.ts`**

```ts
import type {
  Tab,
  Window,
  TabGroup,
  TabQueryInfo,
  TabCreateProperties,
  TabUpdateProperties,
  WindowGetInfo,
  WindowCreateData,
  WindowUpdateInfo,
  TabGroupQueryInfo,
  TabGroupUpdateProperties,
} from '@/shared/types';
import type { IBrowserAdapter } from './types';
import { BrowserEvent } from './types';

/**
 * Chrome 浏览器适配器
 * 直接封装 chrome.tabs / chrome.windows / chrome.tabGroups API
 */
export class ChromeAdapter implements IBrowserAdapter {
  readonly browserType = 'chrome' as const;

  // ── Tabs ────────────────────────────────────────────

  tabs = {
    query: (queryInfo: TabQueryInfo): Promise<Tab[]> =>
      chrome.tabs.query(queryInfo) as Promise<Tab[]>,

    get: (tabId: number): Promise<Tab> =>
      chrome.tabs.get(tabId) as Promise<Tab>,

    create: (createProperties: TabCreateProperties): Promise<Tab> =>
      chrome.tabs.create(createProperties) as Promise<Tab>,

    update: (tabId: number, updateProperties: TabUpdateProperties): Promise<Tab> =>
      chrome.tabs.update(tabId, updateProperties) as Promise<Tab>,

    remove: (tabIds: number | number[]): Promise<void> =>
      chrome.tabs.remove(tabIds),

    move: (
      tabIds: number | number[],
      moveProperties: { windowId?: number; index: number },
    ): Promise<Tab | Tab[]> =>
      chrome.tabs.move(tabIds, moveProperties) as Promise<Tab | Tab[]>,

    group: (options: {
      tabIds: number | number[];
      groupId?: number;
      createProperties?: { windowId?: number };
    }): Promise<number> =>
      chrome.tabs.group(options),

    ungroup: (tabIds: number | number[]): Promise<void> =>
      chrome.tabs.ungroup(tabIds),

    getCurrent: (): Promise<Tab> =>
      chrome.tabs.getCurrent() as Promise<Tab>,

    reload: (tabId: number): Promise<void> =>
      chrome.tabs.reload(tabId),

    duplicate: (tabId: number): Promise<Tab> =>
      chrome.tabs.duplicate(tabId) as Promise<Tab>,

    highlight: (highlightInfo: { tabs: number[] | number; windowId?: number }): Promise<Window> =>
      chrome.tabs.highlight(highlightInfo) as Promise<Window>,
  };

  // ── Windows ─────────────────────────────────────────

  windows = {
    getAll: (getInfo?: WindowGetInfo): Promise<Window[]> =>
      chrome.windows.getAll(getInfo) as Promise<Window[]>,

    get: (windowId: number, getInfo?: WindowGetInfo): Promise<Window> =>
      chrome.windows.get(windowId, getInfo) as Promise<Window>,

    create: (createData?: WindowCreateData): Promise<Window> =>
      chrome.windows.create(createData as chrome.windows.CreateData) as Promise<Window>,

    update: (windowId: number, updateInfo: WindowUpdateInfo): Promise<Window> =>
      chrome.windows.update(windowId, updateInfo) as Promise<Window>,

    remove: (windowId: number): Promise<void> =>
      chrome.windows.remove(windowId),

    getCurrent: (getInfo?: WindowGetInfo): Promise<Window> =>
      chrome.windows.getCurrent(getInfo) as Promise<Window>,

    getLastFocused: (getInfo?: WindowGetInfo): Promise<Window> =>
      chrome.windows.getLastFocused(getInfo) as Promise<Window>,
  };

  // ── TabGroups ───────────────────────────────────────

  tabGroups = {
    query: (queryInfo: TabGroupQueryInfo): Promise<TabGroup[]> =>
      chrome.tabGroups.query(queryInfo) as Promise<TabGroup[]>,

    get: (groupId: number): Promise<TabGroup> =>
      chrome.tabGroups.get(groupId) as Promise<TabGroup>,

    update: (groupId: number, updateProperties: TabGroupUpdateProperties): Promise<TabGroup> =>
      chrome.tabGroups.update(groupId, updateProperties) as Promise<TabGroup>,

    move: (
      groupId: number,
      moveProperties: { windowId?: number; index: number },
    ): Promise<TabGroup> =>
      chrome.tabGroups.move(groupId, moveProperties) as Promise<TabGroup>,
  };

  // ── Event ───────────────────────────────────────────

  addListener(event: BrowserEvent, callback: (...args: any[]) => void): () => void {
    const api = this.resolveEventApi(event);
    api.addListener(callback);
    return () => api.removeListener(callback);
  }

  private resolveEventApi(event: BrowserEvent): chrome.events.Event<any> {
    const [namespace, eventName] = event.split('.') as [string, string];
    switch (namespace) {
      case 'tabs': return (chrome.tabs as any)[eventName];
      case 'windows': return (chrome.windows as any)[eventName];
      case 'tabGroups': return (chrome.tabGroups as any)[eventName];
      default:
        throw new Error(`Unknown event namespace: ${namespace}`);
    }
  }
}
```

### 3.3 FirefoxAdapter 实现

**文件: `src/adapters/firefox-adapter.ts`**

```ts
import type {
  Tab,
  Window,
  TabGroup,
  TabQueryInfo,
  TabCreateProperties,
  TabUpdateProperties,
  WindowGetInfo,
  WindowCreateData,
  WindowUpdateInfo,
  TabGroupQueryInfo,
  TabGroupUpdateProperties,
} from '@/shared/types';
import type { IBrowserAdapter } from './types';
import { BrowserEvent } from './types';

/**
 * Firefox 浏览器适配器
 * Firefox 使用 `browser.*` 命名空间，且不支持 tabGroups API
 */
export class FirefoxAdapter implements IBrowserAdapter {
  readonly browserType = 'firefox' as const;

  // Firefox 的 browser API 通过全局 browser 对象暴露
  private get browser() {
    return (globalThis as any).browser;
  }

  // ── Tabs ────────────────────────────────────────────

  tabs = {
    query: (queryInfo: TabQueryInfo): Promise<Tab[]> =>
      this.browser.tabs.query(queryInfo),

    get: (tabId: number): Promise<Tab> =>
      this.browser.tabs.get(tabId),

    create: (createProperties: TabCreateProperties): Promise<Tab> =>
      this.browser.tabs.create(createProperties),

    update: (tabId: number, updateProperties: TabUpdateProperties): Promise<Tab> =>
      this.browser.tabs.update(tabId, updateProperties),

    remove: (tabIds: number | number[]): Promise<void> =>
      this.browser.tabs.remove(tabIds),

    move: (
      tabIds: number | number[],
      moveProperties: { windowId?: number; index: number },
    ): Promise<Tab | Tab[]> =>
      this.browser.tabs.move(tabIds, moveProperties),

    // Firefox 不支持 tabGroups
    group: (_options: {
      tabIds: number | number[];
      groupId?: number;
      createProperties?: { windowId?: number };
    }): Promise<number> =>
      Promise.reject(new Error('tabGroups is not supported in Firefox')),

    ungroup: (_tabIds: number | number[]): Promise<void> =>
      Promise.reject(new Error('tabGroups is not supported in Firefox')),

    getCurrent: (): Promise<Tab> =>
      this.browser.tabs.getCurrent(),

    reload: (tabId: number): Promise<void> =>
      this.browser.tabs.reload(tabId),

    duplicate: (tabId: number): Promise<Tab> =>
      this.browser.tabs.duplicate(tabId),

    highlight: (highlightInfo: { tabs: number[] | number; windowId?: number }): Promise<Window> =>
      this.browser.tabs.highlight(highlightInfo),
  };

  // ── Windows ─────────────────────────────────────────

  windows = {
    getAll: (getInfo?: WindowGetInfo): Promise<Window[]> =>
      this.browser.windows.getAll(getInfo),

    get: (windowId: number, getInfo?: WindowGetInfo): Promise<Window> =>
      this.browser.windows.get(windowId, getInfo),

    create: (createData?: WindowCreateData): Promise<Window> =>
      this.browser.windows.create(createData),

    update: (windowId: number, updateInfo: WindowUpdateInfo): Promise<Window> =>
      this.browser.windows.update(windowId, updateInfo),

    remove: (windowId: number): Promise<void> =>
      this.browser.windows.remove(windowId),

    getCurrent: (getInfo?: WindowGetInfo): Promise<Window> =>
      this.browser.windows.getCurrent(getInfo),

    getLastFocused: (getInfo?: WindowGetInfo): Promise<Window> =>
      this.browser.windows.getLastFocused(getInfo),
  };

  // ── TabGroups (Firefox: 全部 no-op) ────────────────

  tabGroups = {
    query: (_queryInfo: TabGroupQueryInfo): Promise<TabGroup[]> =>
      Promise.resolve([]),

    get: (_groupId: number): Promise<TabGroup> =>
      Promise.reject(new Error('tabGroups is not supported in Firefox')),

    update: (_groupId: number, _updateProperties: TabGroupUpdateProperties): Promise<TabGroup> =>
      Promise.reject(new Error('tabGroups is not supported in Firefox')),

    move: (
      _groupId: number,
      _moveProperties: { windowId?: number; index: number },
    ): Promise<TabGroup> =>
      Promise.reject(new Error('tabGroups is not supported in Firefox')),
  };

  // ── Event ───────────────────────────────────────────

  addListener(event: BrowserEvent, callback: (...args: any[]) => void): () => void {
    const api = this.resolveEventApi(event);
    if (!api) {
      // Firefox 不支持 tabGroups 事件，返回 no-op
      return () => {};
    }
    api.addListener(callback);
    return () => api.removeListener(callback);
  }

  private resolveEventApi(event: BrowserEvent): any {
    const [namespace, eventName] = event.split('.') as [string, string];
    const ns = (this.browser as any)[namespace];
    if (!ns) return undefined;
    return ns[eventName];
  }
}
```

### 3.4 工厂函数 + 统一导出

**文件: `src/adapters/index.ts`**

```ts
import type { IBrowserAdapter } from './types';
import { ChromeAdapter } from './chrome-adapter';
import { FirefoxAdapter } from './firefox-adapter';

export type { IBrowserAdapter } from './types';
export { BrowserEvent } from './types';
export { ChromeAdapter } from './chrome-adapter';
export { FirefoxAdapter } from './firefox-adapter';

/**
 * 根据 userAgent 自动选择浏览器适配器
 * 单例模式：同一运行时只创建一个实例
 */
let _adapter: IBrowserAdapter | null = null;

export function getAdapter(): IBrowserAdapter {
  if (_adapter) return _adapter;

  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes('firefox')) {
    _adapter = new FirefoxAdapter();
  } else {
    // Chrome / Edge / Opera / Brave 等都使用 Chromium 内核
    _adapter = new ChromeAdapter();
  }

  return _adapter;
}

/**
 * 重置适配器（仅用于测试）
 */
export function resetAdapter(): void {
  _adapter = null;
}
```

## 4. 接口/契约

### 4.1 IBrowserAdapter 完整接口

| 域 | 方法 | Chrome | Firefox |
|----|------|--------|---------|
| tabs | query | chrome.tabs.query | browser.tabs.query |
| tabs | get | chrome.tabs.get | browser.tabs.get |
| tabs | create | chrome.tabs.create | browser.tabs.create |
| tabs | update | chrome.tabs.update | browser.tabs.update |
| tabs | remove | chrome.tabs.remove | browser.tabs.remove |
| tabs | move | chrome.tabs.move | browser.tabs.move |
| tabs | group | chrome.tabs.group | reject Error |
| tabs | ungroup | chrome.tabs.ungroup | reject Error |
| tabs | getCurrent | chrome.tabs.getCurrent | browser.tabs.getCurrent |
| tabs | reload | chrome.tabs.reload | browser.tabs.reload |
| tabs | duplicate | chrome.tabs.duplicate | browser.tabs.duplicate |
| tabs | highlight | chrome.tabs.highlight | browser.tabs.highlight |
| windows | getAll | chrome.windows.getAll | browser.windows.getAll |
| windows | get | chrome.windows.get | browser.windows.get |
| windows | create | chrome.windows.create | browser.windows.create |
| windows | update | chrome.windows.update | browser.windows.update |
| windows | remove | chrome.windows.remove | browser.windows.remove |
| windows | getCurrent | chrome.windows.getCurrent | browser.windows.getCurrent |
| windows | getLastFocused | chrome.windows.getLastFocused | browser.windows.getLastFocused |
| tabGroups | query | chrome.tabGroups.query | resolve [] |
| tabGroups | get | chrome.tabGroups.get | reject Error |
| tabGroups | update | chrome.tabGroups.update | reject Error |
| tabGroups | move | chrome.tabGroups.move | reject Error |
| events | addListener | 正常注册 | tabGroups 事件返回 no-op |

### 4.2 行为差异说明

| 差异点 | Chrome | Firefox | 影响 |
|--------|--------|---------|------|
| API 命名空间 | `chrome.*` | `browser.*` | 适配器封装差异，上层无感 |
| tabGroups | 完整支持 | 完全不支持 | `group()`/`ungroup()` reject，`query()` 返回空数组 |
| tabGroups 事件 | 触发 `onUpdated`/`onMoved` | 无事件 | `addListener` 返回 no-op |
| API 返回类型 | 回调式 + Promise | Promise-first | 适配器统一返回 Promise |

## 5. 测试指引

### 5.1 ChromeAdapter 单元测试

**文件: `src/adapters/__tests__/chrome-adapter.test.ts`**

测试场景：

| 场景 | 测试方法 | 预期 |
|------|----------|------|
| browserType | `adapter.browserType` | 返回 `"chrome"` |
| tabs.query | mock `chrome.tabs.query` 返回 `[{id:1, title:"test"}]` | 返回相同数组 |
| tabs.create | mock `chrome.tabs.create` | 传入参数正确转发 |
| tabs.remove | mock `chrome.tabs.remove` 调用 | 传入 tabIds 正确 |
| tabs.group | mock `chrome.tabs.group` 返回 `42` | 返回 `42` |
| tabs.ungroup | mock `chrome.tabs.ungroup` 调用 | 无报错 |
| windows.getAll | mock `chrome.windows.getAll` 返回 `[{id:1}]` | 返回相同数组 |
| windows.create | mock `chrome.windows.create` | 传入参数正确 |
| windows.remove | mock `chrome.windows.remove` 调用 | 无报错 |
| tabGroups.query | mock `chrome.tabGroups.query` 返回 `[{id:1, color:"blue"}]` | 返回相同数组 |
| tabGroups.update | mock `chrome.tabGroups.update` | 传入参数正确 |
| addListener | mock `chrome.tabs.onCreated.addListener` | callback 被注册 |

Mock 策略：使用 `vi.mock('chrome')` 或直接替换 `globalThis.chrome`。

### 5.2 FirefoxAdapter 单元测试

**文件: `src/adapters/__tests__/firefox-adapter.test.ts`**

测试场景：

| 场景 | 测试方法 | 预期 |
|------|----------|------|
| browserType | `adapter.browserType` | 返回 `"firefox"` |
| tabs.query | mock `browser.tabs.query` 返回 `[{id:1, title:"test"}]` | 返回相同数组 |
| tabs.group | 调用 `tabs.group(...)` | reject with Error("tabGroups is not supported...") |
| tabs.ungroup | 调用 `tabs.ungroup(...)` | reject with Error("tabGroups is not supported...") |
| tabGroups.query | 调用 `tabGroups.query({})` | resolve 空数组 `[]` |
| tabGroups.get | 调用 `tabGroups.get(1)` | reject with Error |
| tabGroups.update | 调用 `tabGroups.update(1, {})` | reject with Error |
| tabGroups.move | 调用 `tabGroups.move(1, {})` | reject with Error |
| addListener(TAB_GROUP_UPDATED) | 注册 tabGroups 事件 | 返回 no-op 函数，不抛异常 |
| addListener(TAB_CREATED) | 注册 tabs 事件 | 正常注册 |

### 5.3 工厂函数测试

测试场景：

| 场景 | 测试方法 | 预期 |
|------|----------|------|
| Chrome UA | mock `navigator.userAgent` 含 `Chrome` | 返回 `ChromeAdapter` 实例 |
| Firefox UA | mock `navigator.userAgent` 含 `Firefox` | 返回 `FirefoxAdapter` 实例 |
| 单例 | 连续两次调用 `getAdapter()` | 返回同一个实例 |
| resetAdapter | `resetAdapter()` 后再次 `getAdapter()` | 返回新实例 |

### 5.4 运行测试

```bash
npm run test -- src/adapters/
# 或
npx vitest run src/adapters/
```

## 6. 验收标准

- [ ] `IBrowserAdapter` 接口定义完整，覆盖 tabs 12 个方法、windows 7 个方法、tabGroups 4 个方法
- [ ] `ChromeAdapter` 正确调用 `chrome.tabs/windows/tabGroups` API
- [ ] `FirefoxAdapter` 正确调用 `browser.tabs/windows` API
- [ ] `FirefoxAdapter` 的 `tabGroups.group()`/`ungroup()`/`get()`/`update()`/`move()` reject Error
- [ ] `FirefoxAdapter` 的 `tabGroups.query()` resolve 空数组（方便调用方统一处理）
- [ ] `getAdapter()` 工厂函数根据 userAgent 返回正确实例
- [ ] 单例模式：同一运行时多次调用返回同一实例
- [ ] `resetAdapter()` 可重置单例（测试用）
- [ ] 单元测试覆盖 ChromeAdapter 和 FirefoxAdapter（mock chrome/browser 全局对象）

## 7. 注意事项

- **全局对象 mock**：测试中需要 mock `chrome` 和 `browser` 全局对象。Vitest 的 `vi.stubGlobal('chrome', mockChrome)` 可实现。
- **Firefox 的 `browser` 对象**：在 WXT 中，`browser` 全局变量由 WXT 自动 polyfill。Firefox 原生支持 `browser`，Chrome 通过 WXT 的 webextension-polyfill 提供。
- **tabGroups 行为差异**：FirefoxAdapter 的 `tabGroups.query()` 返回空数组而非 reject，这样调用方可以统一用 `adapter.tabGroups.query({})` 而不需要 try/catch。而 `get()`/`update()`/`move()` reject，因为它们是针对特定 groupId 的操作。
- **类型安全**：`chrome.tabs.query()` 返回 `chrome.tabs.Tab[]`，直接 cast 为 `Tab[]`（两者结构在 T2 中已确保兼容）。
- **后续扩展**：Phase 2 工具需要 bookmarks/history/downloads/cookies 等 API。这些在后续任务中扩展 `IBrowserAdapter` 接口。当前 T3 仅实现 tabs/windows/tabGroups 三个域。
- **Edge/Opera/Brave**：这些浏览器基于 Chromium，`userAgent` 中不含 `Firefox`，会被 `getAdapter()` 识别为 Chrome 分支，使用 `ChromeAdapter` 即可。
