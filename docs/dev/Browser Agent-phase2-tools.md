# 开发文档: T18 - 第二阶段工具集

**Project:** Browser Agent
**Task ID:** T18
**Slug:** phase2-tools
**Issue:** #18
**类型:** backend
**Batch:** 8
**依赖:** T2（Tool Registry）, T6（Capability Detector）

---

## 1. 目标

实现 6 个工具域（Bookmarks、History、Downloads、Cookies、Sessions、Misc），注册到 Tool Registry，高风险操作实现 preflight，Cookies 标记 `sensitivity=critical`。

---

## 2. 前置条件

- [x] T2: Tool Registry 实现完成，`IToolRegistry` 接口可用，`register`/`registerAll`/`toOpenAISchema` 正常
- [x] T6: Capability Detector 就绪，可检测各浏览器能力
- [x] T3: JSON-RPC 通信层就绪，Chat Page 可通过 RPC 调用 Background
- [x] T4: Browser Adapter 接口 + Chrome/Firefox 实现完成
- [x] Background JSON-RPC Router 已就绪（T2 产物）

---

## 3. 实现步骤

### 3.1 Bookmarks 工具域

**文件:** `src/tools/bookmarks/bookmarks-tools.ts`

| 工具名 | 风险等级 | 确认要求 | Preflight | 描述 |
|--------|---------|---------|-----------|------|
| `bookmarks_search` | medium | 否 | 否 | 搜索书签，按 query 关键词匹配 |
| `bookmarks_create` | low | 否 | 否 | 创建书签（title, url, parentId?） |
| `bookmarks_update` | medium | 否 | 否 | 更新书签（id, title?, url?） |
| `bookmarks_delete` | high | 是 | 是 | 删除书签（id 或 idList） |
| `bookmarks_getTree` | low | 否 | 否 | 获取书签树结构 |

**关键逻辑:**

```ts
// bookmarks_search 实现
async function bookmarksSearch(params: { query: string }): Promise<ToolResult> {
  const results = await browserAdapter.bookmarks.search(params.query);
  // 只返回 title + url，不返回完整树
  const safeResults = results.map(b => ({ id: b.id, title: b.title, url: b.url }));
  return {
    success: true,
    data: safeResults,
    sensitivityMap: { data: "sensitive" }, // 标记为敏感，Guardrail 控制外发
  };
}

// bookmarks_delete preflight
async function bookmarksDeletePreflight(params: { id?: string; idList?: string[] }): Promise<PreflightResult> {
  const ids = params.idList || (params.id ? [params.id] : []);
  const affectedObjects: PreflightAffectedObject[] = [];
  
  for (const id of ids) {
    try {
      const [bookmark] = await browserAdapter.bookmarks.get(id); // 注意：实际是 getSubTree
      if (bookmark) {
        affectedObjects.push({
          type: "bookmark",
          id,
          title: bookmark.title,
          url: bookmark.url,
        });
      }
    } catch { /* 书签可能已不存在 */ }
  }
  
  return {
    affectedObjects,
    warnings: ids.length > 10 ? [`将删除 ${ids.length} 个书签，此操作不可撤销`] : [],
  };
}
```

**Firefox 差异:** Firefox 的 `bookmarks.get()` 返回 `BookmarkTreeNode[]`，Chrome 返回 `BookmarkTreeNode[]`，接口一致。

**Capability 检测:**
```ts
// 在 capability detector 中
bookmarks: typeof browser.bookmarks !== "undefined",
```

---

### 3.2 History 工具域

**文件:** `src/tools/history/history-tools.ts`

| 工具名 | 风险等级 | 确认要求 | Preflight | 描述 |
|--------|---------|---------|-----------|------|
| `history_search` | medium | 否 | 否 | 搜索历史记录（text, startTime?, endTime?, maxResults?） |
| `history_delete` | high | 是 | 是 | 删除历史记录（url 或 range: {startTime, endTime}） |
| `history_deleteAll` | critical | 是 | 是 | 清空全部历史记录 |

**关键逻辑:**

```ts
// history_search 实现
async function historySearch(params: {
  text: string;
  startTime?: number;
  endTime?: number;
  maxResults?: number;
}): Promise<ToolResult> {
  const items = await browserAdapter.history.search({
    text: params.text,
    startTime: params.startTime,
    endTime: params.endTime,
    maxResults: params.maxResults || 50, // 限制最大 50 条，防止 LLM 上下文爆炸
  });
  
  const safeResults = items.map(h => ({
    id: h.id,
    url: h.url,
    title: h.title,
    lastVisitTime: h.lastVisitTime,
    visitCount: h.visitCount,
  }));
  
  return {
    success: true,
    data: safeResults,
    sensitivityMap: { data: "sensitive" },
  };
}

// history_delete preflight
async function historyDeletePreflight(params: {
  url?: string;
  startTime?: number;
  endTime?: number;
}): Promise<PreflightResult> {
  if (params.url) {
    return {
      affectedObjects: [{
        type: "history",
        url: params.url,
        reason: "将删除该 URL 的所有历史记录",
      }],
      warnings: ["删除历史记录不可撤销"],
    };
  }
  
  // 按时间范围删除：先查询影响数量
  const items = await browserAdapter.history.search({
    text: "",
    startTime: params.startTime,
    endTime: params.endTime,
    maxResults: 1,
  });
  
  return {
    affectedObjects: [{
      type: "history",
      reason: `将删除 ${params.startTime ? new Date(params.startTime).toISOString() : "最早"} 到 ${params.endTime ? new Date(params.endTime).toISOString() : "现在"} 的历史记录`,
    }],
    warnings: ["此操作不可撤销", "将删除该时间段内所有历史记录"],
  };
}
```

**Firefox 差异:** Firefox `history.search()` 返回的 `HistoryItem` 没有 `id` 字段，需要适配。

```ts
// firefox-adapter.ts 中处理
history: {
  search: async (query) => {
    const results = await browser.history.search(query);
    return results.map((item, index) => ({
      ...item,
      id: item.id || `ff-history-${index}-${item.lastVisitTime}`, // Firefox 可能无 id
    }));
  },
}
```

---

### 3.3 Downloads 工具域

**文件:** `src/tools/downloads/downloads-tools.ts`

| 工具名 | 风险等级 | 确认要求 | Preflight | 描述 |
|--------|---------|---------|-----------|------|
| `downloads_search` | medium | 否 | 否 | 搜索下载记录（query?, state?, limit?） |
| `downloads_download` | medium | 是 | 否 | 下载文件（url, filename?, saveAs?） |
| `downloads_erase` | high | 是 | 是 | 清除下载记录（id 或 idList） |
| `downloads_open` | low | 否 | 否 | 打开已下载文件（id） |
| `downloads_cancel` | low | 否 | 否 | 取消进行中的下载（id） |
| `downloads_pause` | low | 否 | 否 | 暂停下载（id） |
| `downloads_resume` | low | 否 | 否 | 恢复下载（id） |

**关键逻辑:**

```ts
// downloads_search 实现
async function downloadsSearch(params: {
  query?: string;
  state?: "in_progress" | "interrupted" | "complete";
  limit?: number;
}): Promise<ToolResult> {
  const items = await browserAdapter.downloads.search({
    query: params.query ? [params.query] : undefined,
    state: params.state,
    limit: params.limit || 50,
  });
  
  const safeResults = items.map(d => ({
    id: d.id,
    url: d.url,
    filename: d.filename,
    state: d.state,
    fileSize: d.fileSize,
    bytesReceived: d.bytesReceived,
    mime: d.mime,
    startTime: d.startTime,
    endTime: d.endTime,
  }));
  
  return {
    success: true,
    data: safeResults,
    sensitivityMap: { data: "sensitive" },
  };
}

// downloads_download 实现
async function downloadsDownload(params: {
  url: string;
  filename?: string;
  saveAs?: boolean;
}): Promise<ToolResult> {
  // 下载不需要 preflight，但标记为 medium 风险（可能下载恶意文件）
  const downloadId = await browserAdapter.downloads.download({
    url: params.url,
    filename: params.filename,
    saveAs: params.saveAs || false,
  });
  return { success: true, data: { downloadId } };
}

// downloads_erase preflight
async function downloadsErasePreflight(params: {
  id?: number;
  idList?: number[];
}): Promise<PreflightResult> {
  const ids = params.idList || (params.id !== undefined ? [params.id] : []);
  const affectedObjects: PreflightAffectedObject[] = [];
  
  for (const id of ids) {
    try {
      const [item] = await browserAdapter.downloads.search({ id });
      if (item) {
        affectedObjects.push({
          type: "download",
          id: String(id),
          title: item.filename,
          url: item.url,
        });
      }
    } catch { /* skip */ }
  }
  
  return {
    affectedObjects,
    warnings: ["清除下载记录不会删除已下载的文件"],
  };
}
```

---

### 3.4 Cookies 工具域

**文件:** `src/tools/cookies/cookies-tools.ts`

| 工具名 | 风险等级 | 确认要求 | Preflight | 描述 |
|--------|---------|---------|-----------|------|
| `cookies_get` | critical | 是 | 是 | 获取指定 Cookie（name, url, storeId?） |
| `cookies_getAll` | critical | 是 | 是 | 获取所有匹配 Cookie（details） |
| `cookies_set` | critical | 是 | 是 | 设置 Cookie（details） |
| `cookies_remove` | critical | 是 | 是 | 删除 Cookie（details） |
| `cookies_getAllCookieStores` | medium | 否 | 否 | 获取所有 Cookie Store ID |

**关键逻辑:**

```ts
// cookies_get 实现
async function cookiesGet(params: {
  name: string;
  url: string;
  storeId?: string;
}): Promise<ToolResult> {
  const cookie = await browserAdapter.cookies.get({
    name: params.name,
    url: params.url,
    storeId: params.storeId,
  });
  
  if (!cookie) {
    return { success: false, error: "Cookie 不存在" };
  }
  
  // 返回时脱敏：不返回 value 字段
  const { value, ...safeCookie } = cookie;
  
  return {
    success: true,
    data: safeCookie,
    sensitivityMap: { data: "critical" },
  };
}

// cookies_getAll preflight
async function cookiesGetAllPreflight(params: {
  domain?: string;
  name?: string;
  storeId?: string;
  url?: string;
}): Promise<PreflightResult> {
  // 先查询数量
  const cookies = await browserAdapter.cookies.getAll(params);
  
  return {
    affectedObjects: cookies.slice(0, 10).map(c => ({
      type: "cookie" as const,
      title: `${c.name}@${c.domain}`,
      reason: "Cookie 值包含敏感信息",
    })),
    warnings: [
      "Cookie 数据包含认证凭据等敏感信息",
      "远程 Provider 可能泄露这些数据",
      ...(cookies.length > 10 ? [`共 ${cookies.length} 个 Cookie，仅显示前 10 个`] : []),
    ],
  };
}

// cookies_set preflight
async function cookiesSetPreflight(params: {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  storeId?: string;
}): Promise<PreflightResult> {
  return {
    affectedObjects: [{
      type: "cookie",
      title: `${params.name}@${params.domain || params.url}`,
      reason: "设置 Cookie 可能影响网站登录状态或追踪行为",
    }],
    warnings: [
      "修改 Cookie 可能影响网站功能",
      "请确认 domain 和 url 正确",
    ],
  };
}

// cookies_remove preflight
async function cookiesRemovePreflight(params: {
  name: string;
  url: string;
  storeId?: string;
}): Promise<PreflightResult> {
  return {
    affectedObjects: [{
      type: "cookie",
      title: `${params.name}@${params.url}`,
      reason: "删除 Cookie 将清除该网站的登录状态和偏好设置",
    }],
    warnings: ["此操作不可撤销"],
  };
}
```

**所有 Cookies 工具的 riskLevel 必须是 `"critical"`，resultSensitivity 必须是 `"critical"`。**

Guardrail 在处理 critical 级别时会：
1. 远程 Provider：默认拒绝发送结果
2. Local Trusted Provider：需要用户确认 + 会话级授权

---

### 3.5 Sessions 工具域

**文件:** `src/tools/sessions/sessions-tools.ts`

| 工具名 | 风险等级 | 确认要求 | Preflight | 描述 |
|--------|---------|---------|-----------|------|
| `sessions_save` | low | 否 | 否 | 保存当前标签页/窗口快照（name） |
| `sessions_restore` | medium | 是 | 否 | 恢复会话快照（sessionId） |
| `sessions_list` | low | 否 | 否 | 列出所有已保存会话 |
| `sessions_delete` | medium | 否 | 是 | 删除会话快照（sessionId） |

**存储方案:**

使用 `chrome.storage.local` 存储会话快照（因为 sessions 数据量可控，且需要同步读写）：

```ts
// 存储结构
interface SavedSession {
  id: string;         // UUID
  name: string;
  createdAt: number;
  tabs: Array<{
    url: string;
    title: string;
    pinned: boolean;
    windowId: number;
    index: number;
  }>;
  windows: Array<{
    id: number;
    tabs: number[];  // tab index 引用
    focused: boolean;
    type?: string;
  }>;
}

// 存储 key: "sessions:{sessionId}"
```

**关键逻辑:**

```ts
// sessions_save 实现
async function sessionsSave(params: { name: string }): Promise<ToolResult> {
  // 1. 通过 JSON-RPC 获取当前浏览器状态
  const state = await jsonRpcClient.request("browser.getState") as BrowserState;
  
  const session: SavedSession = {
    id: crypto.randomUUID(),
    name: params.name,
    createdAt: Date.now(),
    tabs: state.tabs.map(t => ({
      url: t.url || "",
      title: t.title || "",
      pinned: t.pinned,
      windowId: t.windowId,
      index: t.index,
    })),
    windows: state.windows.map(w => ({
      id: w.id!,
      tabs: state.tabs.filter(t => t.windowId === w.id).map(t => t.index),
      focused: w.focused,
      type: w.type,
    })),
  };
  
  await ConfigStore.set(`sessions:${session.id}`, session);
  return { success: true, data: { sessionId: session.id, tabCount: session.tabs.length } };
}

// sessions_restore 实现
async function sessionsRestore(params: { sessionId: string }): Promise<ToolResult> {
  const session = await ConfigStore.get<SavedSession>(`sessions:${params.sessionId}`);
  if (!session) {
    return { success: false, error: "会话不存在" };
  }
  
  // 通过 JSON-RPC 委托 Background 执行恢复
  const result = await jsonRpcClient.request("session.restore", {
    sessionId: params.sessionId,
  });
  
  return { success: true, data: result };
}

// sessions_delete preflight
async function sessionsDeletePreflight(params: { sessionId: string }): Promise<PreflightResult> {
  const session = await ConfigStore.get<SavedSession>(`sessions:${params.sessionId}`);
  
  return {
    affectedObjects: [{
      type: "tab",
      id: params.sessionId,
      title: session?.name || params.sessionId,
      reason: `将删除会话快照"${session?.name || params.sessionId}"（${session?.tabs.length || 0} 个标签页）`,
    }],
    warnings: ["删除快照不影响当前打开的标签页"],
  };
}
```

**Background 端 Session 恢复逻辑（`src/background/session-restore.ts`）:**

```ts
// 处理 "session.restore" JSON-RPC 方法
async function handleSessionRestore(params: { sessionId: string }) {
  const session = await ConfigStore.get<SavedSession>(`sessions:${params.sessionId}`);
  if (!session) throw new Error("会话不存在");
  
  // 按 window 分组恢复
  const restoredCount = { tabs: 0 };
  
  for (const win of session.windows) {
    const winTabs = session.tabs
      .filter(t => t.windowId === win.id)
      .sort((a, b) => a.index - b.index);
    
    if (winTabs.length === 0) continue;
    
    const newWindow = await browser.windows.create({
      focused: win.focused,
      type: win.type as any,
      url: winTabs.map(t => t.url),
    });
    
    restoredCount.tabs += winTabs.length;
  }
  
  return { restoredCount: restoredCount.tabs };
}
```

**Firefox 差异:** Firefox 的 `sessions` API 不同于 Chrome。Firefox 没有 `chrome.sessions` API，但我们的 Sessions 工具使用 `chrome.storage.local` 存储快照 + `windows.create` + `tabs.create` 恢复，因此两个浏览器都可用。

---

### 3.6 Misc 工具域

**文件:** `src/tools/misc/misc-tools.ts`

| 工具名 | 风险等级 | 确认要求 | Preflight | 描述 |
|--------|---------|---------|-----------|------|
| `clipboard_read` | high | 是 | 否 | 读取剪贴板文本 |
| `clipboard_write` | low | 否 | 否 | 写入剪贴板（text） |
| `notifications_create` | low | 否 | 否 | 创建桌面通知（title, message, type?） |
| `storage_local_get` | medium | 否 | 否 | 读取扩展 storage.local 中的键 |
| `storage_local_set` | medium | 否 | 否 | 写入扩展 storage.local |
| `storage_local_remove` | medium | 否 | 是 | 删除扩展 storage.local 中的键 |

**关键逻辑:**

```ts
// clipboard_read 实现
async function clipboardRead(params: {}): Promise<ToolResult> {
  // 通过 Content Script 或 Background 读取（取决于浏览器能力）
  // Chrome: 需要 clipboardRead 权限，Background 可直接调用 navigator.clipboard.readText()
  // Firefox: clipboard API 可能受限
  
  try {
    const text = await navigator.clipboard.readText();
    return {
      success: true,
      data: { text },
      sensitivityMap: { "data.text": "sensitive" },
    };
  } catch (err) {
    return { success: false, error: "无法读取剪贴板，请检查权限" };
  }
}

// notifications_create 实现
async function notificationsCreate(params: {
  title: string;
  message: string;
  type?: "basic" | "image" | "list" | "progress";
  iconUrl?: string;
}): Promise<ToolResult> {
  const notificationId = await browserAdapter.notifications.create({
    type: params.type || "basic",
    iconUrl: params.iconUrl || "icons/icon-128.png",
    title: params.title,
    message: params.message,
  });
  
  return { success: true, data: { notificationId } };
}

// storage_local_get 实现
async function storageLocalGet(params: { keys?: string | string[] }): Promise<ToolResult> {
  const data = await ConfigStore.get(params.keys || null);
  return {
    success: true,
    data,
    sensitivityMap: { data: "sensitive" }, // storage 可能含敏感配置
  };
}

// storage_local_remove preflight
async function storageLocalRemovePreflight(params: { keys: string | string[] }): Promise<PreflightResult> {
  const keys = Array.isArray(params.keys) ? params.keys : [params.keys];
  
  return {
    affectedObjects: keys.map(key => ({
      type: "cookie" as const, // 复用 cookie 类型表示存储项
      title: key,
      reason: `将删除扩展存储中的 "${key}" 键`,
    })),
    warnings: ["删除扩展存储可能影响 Agent 功能（如 Provider 配置）"],
  };
}
```

---

### 3.7 工具注册

**文件:** `src/tools/phase2-register.ts`

```ts
import { bookmarksSearch, bookmarksCreate, bookmarksUpdate, bookmarksDelete, bookmarksGetTree } from "./bookmarks/bookmarks-tools";
import { historySearch, historyDelete, historyDeleteAll } from "./history/history-tools";
import { downloadsSearch, downloadsDownload, downloadsErase, downloadsOpen, downloadsCancel, downloadsPause, downloadsResume } from "./downloads/downloads-tools";
import { cookiesGet, cookiesGetAll, cookiesSet, cookiesRemove, cookiesGetAllCookieStores } from "./cookies/cookies-tools";
import { sessionsSave, sessionsRestore, sessionsList, sessionsDelete } from "./sessions/sessions-tools";
import { clipboardRead, clipboardWrite, notificationsCreate, storageLocalGet, storageLocalSet, storageLocalRemove } from "./misc/misc-tools";

export function registerPhase2Tools(registry: IToolRegistry, capabilities: Capabilities): void {
  const tools: ToolDefinition[] = [];
  
  // Bookmarks
  if (capabilities.bookmarks) {
    tools.push(bookmarksSearch(), bookmarksCreate(), bookmarksUpdate(), bookmarksDelete(), bookmarksGetTree());
  }
  
  // History
  if (capabilities.history) {
    tools.push(historySearch(), historyDelete(), historyDeleteAll());
  }
  
  // Downloads
  if (capabilities.downloads) {
    tools.push(downloadsSearch(), downloadsDownload(), downloadsErase(), downloadsOpen(), downloadsCancel(), downloadsPause(), downloadsResume());
  }
  
  // Cookies
  if (capabilities.cookies) {
    tools.push(cookiesGet(), cookiesGetAll(), cookiesSet(), cookiesRemove(), cookiesGetAllCookieStores());
  }
  
  // Sessions（自定义实现，总是可用）
  tools.push(sessionsSave(), sessionsRestore(), sessionsList(), sessionsDelete());
  
  // Misc
  if (capabilities.clipboard) {
    tools.push(clipboardRead(), clipboardWrite());
  }
  if (capabilities.notifications) {
    tools.push(notificationsCreate());
  }
  tools.push(storageLocalGet(), storageLocalSet(), storageLocalRemove()); // storage 总是可用
  
  registry.registerAll(tools);
}
```

---

### 3.8 Background 端 API 代理扩展

**文件:** `src/background/api-proxy.ts`（扩展现有文件）

在已有 JSON-RPC Router 中新增以下方法处理：

| JSON-RPC 方法 | 实现 |
|---------------|------|
| `bookmarks.search` | `browserAdapter.bookmarks.search(params.query)` |
| `bookmarks.create` | `browserAdapter.bookmarks.create(params)` |
| `bookmarks.update` | `browserAdapter.bookmarks.update(params.id, params)` |
| `bookmarks.remove` | `browserAdapter.bookmarks.remove(params.id)` |
| `bookmarks.getTree` | `browserAdapter.bookmarks.getTree()` |
| `history.search` | `browserAdapter.history.search(params)` |
| `history.deleteUrl` | `browserAdapter.history.deleteUrl({ url: params.url })` |
| `history.deleteRange` | `browserAdapter.history.deleteRange(params)` |
| `history.deleteAll` | `browserAdapter.history.deleteAll()` |
| `downloads.search` | `browserAdapter.downloads.search(params)` |
| `downloads.download` | `browserAdapter.downloads.download(params)` |
| `downloads.erase` | `browserAdapter.downloads.erase({ id: params.id })` |
| `downloads.open` | `browserAdapter.downloads.open(params.id)` |
| `downloads.cancel` | `browserAdapter.downloads.cancel(params.id)` |
| `downloads.pause` | `browserAdapter.downloads.pause(params.id)` |
| `downloads.resume` | `browserAdapter.downloads.resume(params.id)` |
| `cookies.get` | `browserAdapter.cookies.get(params)` |
| `cookies.getAll` | `browserAdapter.cookies.getAll(params)` |
| `cookies.set` | `browserAdapter.cookies.set(params)` |
| `cookies.remove` | `browserAdapter.cookies.remove(params)` |
| `cookies.getAllCookieStores` | `browserAdapter.cookies.getAllCookieStores()` |

---

## 4. 接口/契约

### 4.1 Browser Adapter 扩展接口

在 `IBrowserAdapter` 接口中新增以下方法签名：

```ts
// 在 src/adapters/types.ts 中追加

interface IBrowserAdapter {
  // ... 已有 tabs/windows/tabGroups
  
  bookmarks: {
    search(query: string | { query?: string; title?: string; url?: string }): Promise<BookmarkTreeNode[]>;
    getTree(): Promise<BookmarkTreeNode[]>;
    get(id: string): Promise<BookmarkTreeNode[]>;
    create(bookmark: { parentId?: string; title?: string; url?: string; index?: number }): Promise<BookmarkTreeNode>;
    update(id: string, changes: { title?: string; url?: string }): Promise<BookmarkTreeNode>;
    remove(id: string): Promise<void>;
  };
  
  history: {
    search(query: { text: string; startTime?: number; endTime?: number; maxResults?: number }): Promise<HistoryItem[]>;
    deleteUrl(details: { url: string }): Promise<void>;
    deleteRange(range: { startTime: number; endTime: number }): Promise<void>;
    deleteAll(): Promise<void>;
  };
  
  downloads: {
    search(query: { query?: string[]; id?: number; state?: string; limit?: number }): Promise<DownloadItem[]>;
    download(options: { url: string; filename?: string; saveAs?: boolean }): Promise<number>;
    erase(query: { id: number }): Promise<void>;
    open(downloadId: number): Promise<void>;
    cancel(downloadId: number): Promise<void>;
    pause(downloadId: number): Promise<void>;
    resume(downloadId: number): Promise<void>;
  };
  
  cookies: {
    get(details: { name: string; url: string; storeId?: string }): Promise<Cookie | null>;
    getAll(details: { domain?: string; name?: string; storeId?: string; url?: string }): Promise<Cookie[]>;
    set(details: { url: string; name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean; expirationDate?: number; storeId?: string }): Promise<Cookie>;
    remove(details: { name: string; url: string; storeId?: string }): Promise<void>;
    getAllCookieStores(): Promise<CookieStore[]>;
  };
  
  notifications: {
    create(options: { type: string; iconUrl?: string; title: string; message: string }): Promise<string>;
    clear(notificationId: string): Promise<void>;
  };
}
```

### 4.2 新增数据模型

```ts
// src/shared/types/browser.ts 中追加

interface BookmarkTreeNode {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: BookmarkTreeNode[];
}

interface HistoryItem {
  id: string;
  url?: string;
  title?: string;
  lastVisitTime?: number;
  visitCount?: number;
  typedCount?: number;
}

interface DownloadItem {
  id: number;
  url: string;
  referrer?: string;
  filename: string;
  state: "in_progress" | "interrupted" | "complete";
  fileSize: number;
  bytesReceived: number;
  mime: string;
  startTime: string;
  endTime?: string;
  error?: string;
  exists: boolean;
}

interface Cookie {
  name: string;
  value: string;
  domain: string;
  hostOnly: boolean;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
  session: boolean;
  expirationDate?: number;
  storeId: string;
}

interface CookieStore {
  id: string;
  tabIds: number[];
}
```

---

## 5. 测试指引

### 5.1 单元测试

#### Bookmarks 域

| 测试场景 | 预期结果 |
|----------|----------|
| `bookmarks_search` 正常搜索 | 返回匹配书签数组，`sensitivityMap.data = "sensitive"` |
| `bookmarks_create` 创建书签 | 返回成功，data 含新书签信息 |
| `bookmarks_delete` preflight | 返回受影响书签列表，含 title 和 url |
| `bookmarks_delete` 执行删除 | 返回成功 |
| 无书签权限时 | Capability 检测为 false，工具不注册 |

#### History 域

| 测试场景 | 预期结果 |
|----------|----------|
| `history_search` 搜索 | 返回最多 50 条结果，敏感标记 |
| `history_delete` preflight（按 URL） | 返回单个受影响对象 |
| `history_delete` preflight（按时间范围） | 返回范围描述和警告 |
| `history_deleteAll` preflight | 返回警告信息 |
| Firefox 无 id 字段 | Adapter 自动生成 fallback id |

#### Downloads 域

| 测试场景 | 预期结果 |
|----------|----------|
| `downloads_search` 搜索 | 返回下载记录，敏感标记 |
| `downloads_download` | 返回 downloadId |
| `downloads_erase` preflight | 列出将被清除的下载项 |
| `downloads_cancel` 取消进行中的下载 | 返回成功 |

#### Cookies 域

| 测试场景 | 预期结果 |
|----------|----------|
| `cookies_get` 获取 Cookie | 返回脱敏数据（不含 value），`sensitivityMap.data = "critical"` |
| `cookies_getAll` preflight | 列出前 10 个 Cookie，含安全警告 |
| `cookies_set` preflight | 返回安全警告 |
| `cookies_remove` preflight | 返回不可撤销警告 |
| 所有 Cookies 工具 riskLevel | 必须为 `"critical"` |

#### Sessions 域

| 测试场景 | 预期结果 |
|----------|----------|
| `sessions_save` 保存 | 成功保存到 storage.local，返回 sessionId |
| `sessions_restore` 恢复 | 成功恢复标签页 |
| `sessions_list` 列表 | 返回所有已保存会话 |
| `sessions_delete` preflight | 显示会话名称和标签页数量 |

#### Misc 域

| 测试场景 | 预期结果 |
|----------|----------|
| `clipboard_read` | 返回剪贴板文本，敏感标记 |
| `notifications_create` | 创建通知成功，返回 notificationId |
| `storage_local_remove` preflight | 列出将被删除的键 |

---

## 6. 验收标准

- [ ] 所有 6 个工具域的工具已注册到 Tool Registry（通过 `IToolRegistry.registerAll`）
- [ ] Capability-based 注册：Chrome 注册全部，Firefox 跳过 tabGroups
- [ ] 高风险工具（bookmarks_delete, history_delete, history_deleteAll, downloads_erase, cookies_get, cookies_getAll, cookies_set, cookies_remove）preflight 正常返回影响对象清单
- [ ] Cookies 工具 `riskLevel = "critical"`, `resultSensitivity = "critical"`, `confirmationRequired = true`
- [ ] 每个工具域至少 3 个单元测试用例
- [ ] Bookmarks/History/Downloads 查询结果标记 `sensitivityMap: { data: "sensitive" }`
- [ ] Cookies 查询结果脱敏（不返回 `value` 字段）
- [ ] Firefox 兼容：history id 自动生成、sessions 使用自定义实现
- [ ] Background JSON-RPC Router 新增对应方法处理

---

## 7. 注意事项

1. **敏感数据外发:** Bookmarks/History/Downloads 的查询结果虽然返回给 Agent，但 `sensitivityMap` 标记为 `sensitive`，Guardrail 会根据 Provider 信任状态决定是否允许将结果注入 LLM 上下文。工具本身只负责标记，不负责拦截。
2. **Cookies 是最高风险域:** `value` 字段永远不返回（即使是 Local Trusted Provider）。如需读取 Cookie value，必须由用户手动在浏览器 DevTools 中操作。
3. **Sessions 工具独立于浏览器 sessions API:** Chrome 的 `chrome.sessions` API 和 Firefox 的 `browser.sessions` API 行为不同。统一使用 `chrome.storage.local` + `windows.create` + `tabs.create` 实现，确保跨浏览器一致。
4. **Download 安全:** `downloads_download` 标记为 medium 风险，由 LLM 提供的 URL 可能指向恶意文件。Guardrail 应提示用户确认 URL。
5. **History 查询限制:** `maxResults` 默认 50，防止大量历史记录撑爆 LLM 上下文。如果 LLM 需要更多，由它自行多次调用。
6. **扩展 Browser Adapter:** 每个工具域需要在 `chrome-adapter.ts` 和 `firefox-adapter.ts` 中实现对应的 API 代理方法。Firefox 的 `history` API 返回结构略有不同，需要适配。
7. **测试 Mock:** 单元测试中，Browser Adapter 使用 Mock 实现，不依赖真实浏览器环境。JSON-RPC Client 同样 Mock。
