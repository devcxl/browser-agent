# 内置工具参考手册

**Project:** Browser Agent
**类型:** 参考文档
**说明:** 本文档列举 Browser Agent 所有内置工具的定义、参数、风险等级和用途。

## 概述

Browser Agent 提供 **47 个内置工具**（含 `skill` 特殊工具），涵盖标签页管理、窗口管理、书签、历史记录、下载、Cookies、页面操作、剪贴板、通知、存储、会话管理、系统等类别。工具通过 `ToolRegistry` 注册，经由 Agent Loop 按需调用。

### 工具属性说明

| 属性 | 说明 |
|------|------|
| `riskLevel` | 风险等级：`low` / `medium` / `high` / `critical` |
| `confirmationRequired` | 执行前是否需要用户确认 |
| `resultSensitivity` | 返回数据敏感级别：`low` / `sensitive` / `critical` |
| `requireBackground` | 是否需通过 JSON-RPC 在 Background 上下文执行 |
| `requireContentScript` | 是否需通过 Content Script 在页面上下文执行 |
| `preflight` | 高风险工具在执行前展示受影响对象的列表 |

## 标签页 (Tabs) — 8 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `tabs_query` | 查询当前浏览器中所有匹配条件的标签页 | low | 否 | Background |
| `tabs_get` | 获取单个标签页的详细信息 | low | 否 | Background |
| `tabs_create` | 创建新标签页并返回其详情 | medium | 否 | Background |
| `tabs_update` | 更新标签页的属性（URL、激活状态、固定状态等） | medium | 否 | Background |
| `tabs_remove` | 关闭一个或多个标签页，需用户确认 | high | 是 | Background |
| `tabs_move` | 移动一个或多个标签页到指定窗口和位置 | medium | 否 | Background |
| `tabs_group` | 将一个或多个标签页分组 | medium | 否 | Background |
| `tabs_ungroup` | 将一个或多个标签页从分组中移除 | medium | 否 | Background |

## 窗口 (Windows) — 4 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `windows_getAll` | 获取所有浏览器窗口列表 | low | 否 | Background |
| `windows_get` | 获取单个浏览器窗口的详细信息 | low | 否 | Background |
| `windows_create` | 创建新浏览器窗口 | medium | 否 | Background |
| `windows_remove` | 关闭指定浏览器窗口及其所有标签页 | high | 是 | Background |

## 标签分组 (TabGroups) — 2 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `tabGroups_query` | 查询浏览器标签分组 | low | 否 | Background |
| `tabGroups_update` | 更新标签分组的属性（折叠状态、颜色、标题） | medium | 否 | Background |

## 书签 (Bookmarks) — 5 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `bookmarks_search` | 搜索浏览器书签 | medium | 否 | Background |
| `bookmarks_create` | 创建新的书签或文件夹 | low | 否 | Background |
| `bookmarks_update` | 更新书签或文件夹的标题和 URL | medium | 否 | Background |
| `bookmarks_delete` | 删除书签或文件夹，删除不可恢复 | high | 是 | Background |
| `bookmarks_getTree` | 获取完整的书签树结构 | low | 否 | Background |

## 历史记录 (History) — 3 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `history_search` | 搜索浏览器历史记录 | medium | 否 | Background |
| `history_delete` | 删除浏览历史记录（按 URL 或时间范围） | high | 是 | Background |
| `history_deleteAll` | 清空全部浏览历史记录，不可恢复 | critical | 是 | Background |

## 下载 (Downloads) — 7 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `downloads_search` | 搜索浏览器下载记录 | medium | 否 | Background |
| `downloads_download` | 下载文件到默认下载目录 | medium | 否 | Background |
| `downloads_erase` | 清除浏览器下载记录（仅记录，不删文件） | high | 是 | Background |
| `downloads_open` | 打开已下载的文件 | low | 否 | Background |
| `downloads_cancel` | 取消正在进行的下载 | low | 否 | Background |
| `downloads_pause` | 暂停正在进行的下载 | low | 否 | Background |
| `downloads_resume` | 恢复已暂停的下载 | low | 否 | Background |

## 会话 (Sessions) — 4 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `sessions_save` | 保存当前浏览器会话快照 | low | 否 | Background |
| `sessions_list` | 列出所有保存的会话快照 | low | 否 | Background |
| `sessions_restore` | 恢复指定的会话快照 | medium | 是 | Background |
| `sessions_delete` | 删除指定的会话快照 | medium | 否 | Background |

## Cookies — 5 个工具

所有 Cookies 工具均为 `critical` 级别，涉及用户敏感数据，所有操作均需用户确认。

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `cookies_get` | 获取指定 URL 的 Cookie（不返回 value） | critical | 是 | Background |
| `cookies_getAll` | 获取所有匹配条件的 Cookie | critical | 是 | Background |
| `cookies_set` | 设置 Cookie，可写入敏感信息 | critical | 是 | Background |
| `cookies_remove` | 删除指定 Cookie | critical | 是 | Background |
| `cookies_getAllCookieStores` | 获取所有可用的 Cookie Store | critical | 是 | Background |

## 页面操作 (Page) — 7 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `page_getContent` | 提取当前页面的正文内容 | high | 是 | Content Script |
| `page_getSelection` | 获取当前页面中被选中的文本内容 | medium | 否 | Content Script |
| `page_getMetadata` | 获取页面元数据（标题、URL、描述、OG 图片等） | low | 否 | Content Script |
| `page_getMarkdown` | 提取页面正文并转换为格式化 Markdown | high | 是 | Content Script |
| `page_viewMarkdown` | 将 Markdown 内容在新标签页中渲染为格式化页面 | low | 否 | Background |
| `page_getScreenshot` | 获取标签页可视区域截图（base64 PNG/JPEG） | high | 是 | Background |
| `page_simulateClick` | 在页面上模拟鼠标点击（CSS/XPath/文本定位） | high | 是 | Content Script |

## 剪贴板 (Clipboard) — 2 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `clipboard_read` | 读取剪贴板内容 | high | 是 | Content Script |
| `clipboard_write` | 写入文本到剪贴板 | low | 否 | Content Script |

## 通知 (Notifications) — 1 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `notifications_create` | 创建浏览器桌面通知 | low | 否 | Background |

## 存储 (Storage) — 3 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `storage_local_get` | 读取浏览器 local storage 中的数据 | medium | 否 | Background |
| `storage_local_set` | 写入数据到浏览器 local storage | medium | 否 | Background |
| `storage_local_remove` | 删除浏览器 local storage 中的数据 | medium | 否 | Background |

## 系统 (System) — 1 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `time_get` | 获取当前时间，返回 ISO 8601 和 Unix 毫秒时间戳 | low | 否 | 本地 |

## 技能 (Skill) — 1 个工具

| 工具名 | 描述 | 风险等级 | 需确认 | 执行环境 |
|--------|------|---------|--------|---------|
| `skill` | 激活一个技能（skill），加载该技能的上下文指令 | low | 否 | 本地 |

## 类别统计

| 类别 | 数量 | 关键风险 |
|------|------|---------|
| Tabs | 8 | high: `tabs_remove` |
| Windows | 4 | high: `windows_remove` |
| TabGroups | 2 | — |
| Bookmarks | 5 | high: `bookmarks_delete` |
| History | 3 | critical: `history_deleteAll` |
| Downloads | 7 | high: `downloads_erase` |
| Sessions | 4 | — |
| Page | 7 | high: 页面内容/截图/模拟点击 |
| Cookies | 5 | **全部 critical** |
| Clipboard | 2 | high: `clipboard_read` |
| Notifications | 1 | — |
| Storage | 3 | — |
| System | 1 | — |
| Skill | 1 | — |
| **合计** | **47** | |

## 注册流程

所有工具在 `useAgent.ts` 中通过以下顺序注册：

```
1. createTabsTools(rpc)            // 8 个
2. createWindowsTools(rpc)         // 4 个
3. createTabGroupsTools(rpc)       // 2 个
4. registerPhase2Tools(registry, rpc)
   ├─ createBookmarksTools(rpc)    // 5 个
   ├─ createHistoryTools(rpc)      // 3 个
   ├─ createDownloadsTools(rpc)    // 7 个
   ├─ createCookiesTools(rpc)      // 5 个
   ├─ createSessionsTools(rpc)     // 4 个
   └─ createMiscTools(rpc)         // 7 个
5. createPageTools(executeFn, rpc) // 7 个
6. createSkillTool()               // 1 个
```

## 相关文档

- [Tool Registry 核心实现](./Browser%20Agent-tool-registry.md)
- [Tabs 工具集](./Browser%20Agent-tabs-tools.md)
- [Windows 工具集](./Browser%20Agent-windows-tools.md)
- [TabGroups 工具集](./Browser%20Agent-tabgroups-tools.md)
- [Phase2 工具集](./Browser%20Agent-phase2-tools.md)
