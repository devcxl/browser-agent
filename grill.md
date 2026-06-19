---
title: "浏览器 Agent 扩展"
source: "https://chatgpt.com/c/6a085469-b1a8-83e8-b7ce-3612b89514eb"
model: "gpt-5"
model_slug: "gpt-5-5-thinking"
create_time: "2026-05-16T11:26:44.650Z"
update_time: "2026-06-19T19:43:36.386Z"
exported_at: "2026-06-19T19:43:58.464Z"
author: "ChatGPT"
---
# 浏览器 Agent 扩展

---

## 用户

帮我明确目标

---

## 插件 (file_search)

Make sure to include fileciteturn0file0 in your response to cite this file, or to surface it as a link.
╭─── Claude Code v2.1.142 ─────────────────────────────────────────────────────╮
│                                              │ Tips for getting started      │
│                 Welcome back!                │ Ask Claude to create a new a… │
│                                              │ ───────────────────────────── │
│                    ▐▛███▜▌                   │ What's new                    │
│                   ▝▜█████▛▘                  │ Internal fixes                │
│                     ▘▘ ▝▝                    │ [VSCode] Fixed extension fai… │
│                                              │ Added `CLAUDE_CODE_ENABLE_FE… │
│       MiniMax-M2.7 · API Usage Billing       │ /release-notes for more       │
│   ~/Projects/BrowserPlugins/tab-controller   │                               │
╰──────────────────────────────────────────────────────────────────────────────╯

❯ /grill-with-docs 我想创建一个mcp用于agent控制现有浏览器的tab                  
主要用于将这些tab进行分组 或合并 或关闭 或记录 或读取tab中相关内容              

● Skill(grill-with-docs)
  ⎿  Successfully loaded skill

● 我来深入了解你的需求。先从最核心的问题开始：

  第一个问题：目标浏览器是谁？

  你计划支持哪些浏览器？
  - Chrome/Edge（Chromium 内核）— 通过 Chrome DevTools Protocol (CDP)
  - Firefox — 通过 Firefox DevTools Protocol 或 WebExtensions
  - Safari — 通过 Safari Web Extensions
  - 全部支持？

  我的建议：Chrome/Edge 优先。Chromium 的 CDP 是最成熟、最文档化的方案，且
  Playwright/Puppeteer 都基于此生态，实现成本最低。

  你的目标浏览器是哪个（或哪些）？

✻ Cogitated for 22s

❯ 主要是Chrome和Firefox                                                         

● 好，Chrome + Firefox 支持。

  第二个问题：MCP Server 和浏览器之间的通信架构是什么？

  你的 MCP Server 是一个独立进程，浏览器是另一个进程。它们之间怎么通信？

  几个选项：

  1. 浏览器扩展作为桥接 — 在 Chrome/Firefox 各装一个扩展，扩展通过 Native
  Messaging 与 MCP Server 通信
  2. 直接 DevTools Protocol — MCP Server 直连浏览器的调试端口（Chrome 用
  CDP，Firefox 用 FDP）
  3. 外部工具代理 — 用 Playwright/Puppeteer 作为中间层，MCP 通过它们的 API
  控制浏览器
  4. 已有一个正在开发的浏览器扩展 — 你的 tab-controller
  项目是一个已有的浏览器插件

  我的建议：先确认你的 tab-controller 项目现状。如果它已经是个浏览器扩展，架构选
  择就已经定了。否则，浏览器扩展方案最稳定 ——
  每个浏览器装自己的扩展，扩展负责和浏览器内部 API 交互，通过 stdin/stdout 或
  WebSocket 与 MCP Server 通信。

  你的 tab-controller 项目现在是什么状态？是浏览器扩展还是其他形态？

✻ Brewed for 50s

※ recap: 目标是构建一个 MCP 来控制浏览器标签页（分组、合并、关闭、记录、读取内容）。我们在确认架构方案，需要你先告诉我 `tab-controller` 项目目前是浏览器扩展还是其他形态。 (disable recaps in /config)

❯ 我想知道的是 DevTools Protocol 能控制tab合并分组等操作么？                    

● 这是个好问题，我直接查一下 CDP 的能力边界。

  答案是：不能。

  CDP（Chrome DevTools Protocol）的 Target domain 只能：
  - 列举所有 tab（Target.getTargets）
  - 附加到某个 tab 作为调试目标
  - 关闭 tab（Target.closeTarget）
  - 创建新 tab（Target.createTarget）

  但 CDP 没有提供：
  - Tab 分组（tab groups）
  - Tab 合并
  - Tab 排序/拖拽
  - Tab 静音
  - Tab 固定

  这些是浏览器 Chrome UI 的功能，不是页面调试功能，CDP 压根不暴露这些 API。

  Firefox DevTools Protocol 同样如此 — 它是为调试设计的，不是为浏览器 UI
  自动化设计的。

  ---
  结论：如果你要实现"分组、合并"这类操作，DevTools Protocol 路线走不通。

  两个真正的可行路线：

  1. 浏览器扩展 — 安装在浏览器内，可以访问 chrome.tabs
  API（分组、合并、移动、静音等全部支持）
  2. Accessibility 协议（仅理论层面）— 通过 OS 层面的辅助功能 API
  模拟用户操作浏览器 Chrome，但极其脆弱

  你的 tab-controller 项目的架构方向是什么？继续做浏览器扩展吗？

✻ Churned for 23s

❯ 浏览器扩展作为桥接 — 在 Chrome/Firefox 各装一个扩展，扩展通过 Native          
  Messaging 与 MCP Server 通信                                                  

● 好，这个架构选择是合理的。

  下一个问题：MCP Server 的生命周期怎么管理？

  Native Messaging
  的工作方式是：浏览器启动时，扩展按需启动一个本地进程来处理通信。

  问题是：
  - 谁负责启动 MCP Server？扩展在需要时才启动，还是 MCP Server
  作为常驻进程先运行着？
  - 如果 MCP Server 是常驻的：它和 Native Messaging Host 的关系是什么？

  两种模式：

  1. MCP Server 即是 Native Messaging Host（简单直接）
    - 扩展通过 Native Messaging 直接调用 MCP Server
    - 浏览器每次调用时，MCP Server 启动并处理完请求后退出
    - 缺点：每次请求都有冷启动延迟
  2. 独立 Native Messaging Host + 长期运行的 MCP Server（更灵活）
    - NM Host 是一个轻量级的桥接进程，长期运行
    - NM Host 维护和 MCP Server 的连接（stdio 或 WebSocket）
    - 扩展 → NM Host → MCP Server
    - 可以支持 MCP Server 的 streaming 响应

  你的场景里，agent 控制 tab 可能是频繁操作还是偶尔操作？这决定我们应该选模式1（
  简单，每次新建）还是模式2（持久连接）。

✻ Churned for 20s

❯ 详细解释下两种模式的工作流程 我不是很理解                                     

● 好的，我画清楚一点。

  ---
  模式1：MCP Server 即是 Native Messaging Host（直连模式）

  架构图：
  [浏览器扩展] ←Native Messaging→ [MCP Server 进程]

  工作流程（以"关闭tab"为例）：

  1. Agent 发送 MCP 请求: "关闭 tab id=123"
     ↓
  2. MCP Server 进程不存在 → 浏览器启动它（Native Messaging 协议）
     ↓
  3. MCP Server 通过 stdin 读取请求，执行业务逻辑
     ↓
  4. MCP Server 调用扩展发来的端口，向浏览器扩展发消息
     ↓
  5. 扩展收到消息，调用 chrome.tabs.remove(123)
     ↓
  6. MCP Server 写响应到 stdout → 浏览器扩展收到 → Agent 收到结果
     ↓
  7. MCP Server 进程退出

  特点：
  - 每一次 MCP 调用 = 一次进程启动 + 退出
  - 简单，适合低频操作
  - 冷启动有延迟（MCP Server 加载依赖的时间）

  ---
  模式2：独立 Native Messaging Host + 长期运行的 MCP Server（桥接模式）

  架构图：
  [浏览器扩展] ←Native Messaging→ [NM Host 进程] ←协议→ [MCP Server 进程]
                                                (WebSocket/stdio)

  工作流程（以"关闭tab"为例）：

  1. Agent 发送 MCP 请求: "关闭 tab id=123"
     ↓
  2. MCP Server 是常驻进程，已有 TCP/WebSocket 端口在监听
     ↓
  3. 请求直接路由到 MCP Server（无冷启动）
     ↓
  4. MCP Server 处理逻辑，调用 NM Host
     ↓
  5. NM Host 通过 Native Messaging 发消息给扩展
     ↓
  6. 扩展调用 chrome.tabs.remove(123)，结果逐级返回
     ↓
  7. MCP Server 继续运行，等待下一个请求

  NM Host 的职责：
  - 维护和 MCP Server 的长连接
  - 处理浏览器扩展的身份认证
  - 做协议转换（MCP JSON-RPC ↔ Native Messaging 的 JSON 格式）

  特点：
  - 无冷启动延迟，支持 streaming、notifications
  - 架构复杂一点，但更适合 agent 频繁交互的场景
  - NM Host 可以同时桥接多个浏览器实例

  ---
  回到你的问题

  你的 agent 控制 tab 是高频还是低频操作？
  - 如果 agent 偶尔才让 MCP 控制一下 tab → 模式1足够了
  - 如果 agent 需要频繁、实时地监控和操作 tab → 模式2更合适

✻ Cooked for 19s

❯ 模式2吧 但是我觉得应该将浏览器扩展可以实现的功能都封装mcp 扩展本身是个agent   
  点击扩展跳转聊天界面 直接内置控制tab和任何扩展提供的api 这个想法应该更好      

● 这个想法很有意思。让我确认一下我理解的是否正确：

  ---
  你描述的架构

  [外部 Agent] ←MCP→ [MCP Server] ←Native Messaging→ [浏览器扩展 Agent]
                                                         ↓
                                                    [聊天界面 UI]
                                                    直接调用 chrome.tabs API

  或者说更直白一点：

  浏览器扩展本身就是一个独立的 Agent，有自己的聊天
  UI，用户可以直接在扩展里对话控制 tab。同时这个扩展也通过 MCP
  对外暴露能力，让其他 Agent（如 Claude Code）可以远程控制。

  ---
  我想确认几个问题：

  1. 聊天界面 — 这个界面是内置在扩展 popup
  里，还是扩展里的一个独立页面（点击后跳转）？
  2. MCP Server 和扩展的通信 — MCP Server 是扩展的一部分，还是独立进程通过
  Native Messaging 连接扩展？
  3. 你提到"任何扩展提供的 API" — 除了 tab 操作，你还打算暴露哪些扩展 API？
    - 书签（bookmarks）
    - 历史记录（history）
    - 下载（downloads）
    - 剪贴板（clipboard）
    - 页面截图（captureTab）
  -Cookie/Storage
    - 其他？
  4. 外部 Agent 如何触发 MCP — 是 Claude Code 主动发请求给 MCP Server，还是 MCP
  Server 也需要能主动推送消息给外部 Agent（比如 tab 有变化时主动通知）？

  你的 vision 是：一个浏览器内的 Agent，同时服务于人类用户和外部 AI 
  Agent。这个方向是对的，但我需要确认这些细节才能帮你细化设计。

✻ Baked for 30s

❯ 独立页面  不做mcp-server了  全部扩展api 扩展内部agent主动发送请求给外部       

● 明白了，架构完全变了：

  浏览器扩展 = 独立 Agent + 聊天 UI + 主动发起通信给外部

  ---
  确认一下我理解的新架构

  [浏览器扩展 Agent] ←→ [外部 Agent (Claude Code)]
        ↓
    [聊天界面 (独立页面)]
    [chrome.tabs API 全暴露]
    [主动发请求给外部]

  扩展不只是响应请求，而是主动推消息给外部 Agent。

  ---
  最关键的问题：扩展怎么主动联系外部 Agent？

  它需要一个双向通信通道。几种可能：

  1. WebSocket — 扩展维护一个到 Claude Code 的 WebSocket 连接
  2. Server-Sent Events (SSE) — 扩展作为 HTTP 客户端，连接外部的 SSE
  端点接收推送
  3. 云消息队列/中间件 — 扩展 → 云端 → Claude Code（比如 Firebase、MQTT）
  4. Claude Code 作为 MCP Client — Claude Code 配置这个扩展为一个 MCP
  Server，扩展在需要时调用 Claude Code 的回调

  你倾向于哪种？或者你已经有明确的方案？这决定了整个系统的通信基础设施。

✻ Baked for 26s
❯ 2                                                                             

● 好，SSE。

  下一个问题：扩展怎么知道外部 Agent 的 SSE 端点地址？

  SSE 是单向的 —— 扩展作为 HTTP 客户端连接到 http://localhost:xxxx/sse
  这样的端点。

  问题是：这个端点地址（host + port）是怎么配置的？

  几种可能：

  1. 固定地址 — 扩展内置一个默认地址（如 localhost:8080），用户自己启动外部服务
  2. 动态发现 — 扩展在连接前先通过某个机制发现服务（比如
  /.well-known/ai-plugin.json 类似 AI 插件的发现协议）
  3. 手动配置 — 用户在扩展设置里填写外部 Agent 的地址
  4. Claude Code 主动告知 — Claude Code 启动时在某个约定地址暴露
  SSE，扩展通过某个约定地址（如 localhost:9222）来找它

  你倾向于哪种？这决定了用户的使用流程是否顺畅。

✻ Cogitated for 13s

❯ 协议改为mcp客户端协议 手动配置外部地址                                        

● 好，MCP 客户端协议 + SSE 传输 + 手动配置地址。

  ---
  下一个问题：双向职责确认

  你说扩展是 Agent，既要主动发请求给外部，也要让外部控制 tab。

  MCP 的架构是客户端-服务器模式，但我需要确认通信方向：

  情况A：扩展作为 MCP Server（被动）
  - Claude Code 连接扩展，调用扩展暴露的 tab 控制工具
  - 扩展不能主动发消息给 Claude Code
  - 问题：和你说的"主动发送请求给外部"矛盾

  情况B：扩展同时是 MCP Server + MCP Client（主动）
  - 扩展对外暴露 tab 控制工具（作为 MCP Server）
  - 同时扩展也主动连接外部 MCP Server 并调用它的工具（作为 MCP Client）
  - 这样扩展既能被控制，也能主动发指令给外部
  - 需要外部跑一个 MCP Server 接受扩展的调用

  情况C：不用 MCP Server 暴露工具，只做 MCP Client
  - 扩展只主动发消息给外部
  - 外部 Agent 通过另一种方式（不通过 MCP）控制扩展

  你是哪种意图？我倾向于情况B，但想确认一下。

  另外，外部的 MCP Server 是什么？是 Claude Code 自己，还是你自己写的桥接服务？

✻ Brewed for 36s

❯ 情况C 现在我们的目标变了 我想要的是一个浏览器扩展 这个扩展本身就是agent       
  可以控制浏览器给扩展提供的所有api                                             

● 好，架构清晰了：

  浏览器扩展 = Agent + 聊天 UI + 主动通过 MCP 客户端协议连接外部

  ---
  最后一个关键问题：Claude Code 怎么回复扩展 Agent？

  扩展通过 SSE 主动连接到外部服务，但 Claude Code 不是 MCP
  Server，它不能接收扩展的连接。

  如果扩展是 MCP Client 连接出去，外部需要一个能接收 MCP 客户端连接的 MCP 
  Server（比如你自己写的桥接服务，地址配置在扩展里）。

  但这样就变成了：

  [浏览器扩展 Agent] --SSE/MCP Client--> [你的桥接 MCP Server] <--MCP-- [Claude
  Code]

  我想确认一下：外部的 MCP Server 是你自己写的桥接服务，还是 Claude Code 本身？

  - 如果是你自己写的桥接服务：它需要同时支持 MCP Server（接收 Claude Code
  连接）和 MCP Client（接收扩展的 SSE 连接并转发）
  - 如果是** Claude Code 本身**：那 Claude Code 需要内置支持 MCP Server
  模式接收扩展的连接，但目前它不支持

  你的桥接服务打算用什么语言/框架实现？

✻ Brewed for 26s

❯ 不需要要回复  <--MCP-- [Claude Code] 这部分可以去掉了                         

● 明白了。那：

  浏览器扩展 Agent = 内置 LLM 推理 + 聊天 UI + chrome tabs API 控制 +
  单向发送消息到外部

  ---
  下一个问题：扩展发送消息给外部 MCP Server 的用途是什么？

  你说不需要回复，那我理解外部 MCP Server 是接收端——扩展主动把数据推过去。

  但我需要知道推什么：

  1. 日志/操作记录 — 扩展 agent 的每次操作都同步到外部存储
  2. Tab 状态快照 — 定时把当前所有 tab 的状态发送给外部记录
  3. 用户对话记录 — 扩展内聊天界面的历史记录备份到外部
  4. 混合以上 — 全部都要

  还是说，你只是想通过这个通道让外部知道扩展在做什么，本身扩展是完全独立自主的？

  这个问题的答案决定了外部 MCP Server
  收到消息后怎么处理，以及我们是否需要设计消息格式。

✻ Cogitated for 27s

---

## ChatGPT

我会把你这段对话里“已经排除掉的目标”和“当前真正目标”分离出来，然后给出一个可执行的目标定义，避免继续在 MCP Server / Claude Code 控制浏览器这条线上发散。

---

## ChatGPT

我建议把你的目标明确为：

> **做一个“浏览器内置 Agent 扩展”，不是 MCP Server。这个扩展有独立聊天页面，用户可以直接和它对话；它通过浏览器扩展 API 控制 Chrome / Firefox 的标签页、分组、窗口、书签、历史记录、下载、页面内容读取等能力；外部地址只是可选的事件上报或外部工具调用通道。**

你之前的目标已经从“创建 MCP 控制浏览器 Tab”逐步变成了“扩展本身就是 Agent，不再需要 MCP Server / Claude Code 回路 / 外部回复”。这个变化在对话里已经很清楚：你最后明确说“不做 mcp-server 了”“扩展本身就是 agent”“可以控制浏览器给扩展提供的所有 api”“不需要回复，Claude Code 那部分可以去掉”。

## 1. 当前目标

项目名称可以暂定为：

**Browser Agent Extension**

核心定位：

> 一个运行在浏览器扩展内部的智能助理，负责理解用户意图，并调用浏览器扩展 API 完成浏览器管理任务。

典型使用方式：

```text
用户点击扩展图标
    ↓
打开独立聊天页面
    ↓
用户输入：“把和 GitHub 有关的标签页分成一组，关闭重复页面”
    ↓
扩展内 Agent 分析当前 tabs
    ↓
调用 tabs / tabGroups / windows / scripting 等 API
    ↓
执行分组、去重、关闭、记录
    ↓
在聊天界面返回操作结果
```

Chrome 官方 `tabGroups` API 可以操作浏览器的 Tab 分组系统，并且配合 `tabs` API 处理分组、查询、重排等操作；Chrome `tabs` API 也支持创建、修改、重排标签页。([Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/tabGroups?utm_source=chatgpt.com), [Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/tabs?utm_source=chatgpt.com)) Firefox 侧也有 WebExtensions `tabs` API，可列出、打开、更新、移动、刷新、移除标签页；MDN 也已经提供 `tabGroups` 与 `tabs.group()` 相关文档。([MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs?utm_source=chatgpt.com), [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups?utm_source=chatgpt.com), [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/group?utm_source=chatgpt.com))

## 2. 明确不是这些目标

你现在**不是**要做：

| 排除项 | 原因 |
|---|---|
| MCP Server 控制浏览器 | 目标已经改成扩展内部 Agent 自己控制浏览器 |
| Claude Code 远程控制浏览器 | 你已经去掉 `<--MCP-- [Claude Code]` 这部分 |
| DevTools Protocol 控制 Tab 分组 | CDP 更偏调试页面，不适合做浏览器 UI 级 Tab 分组、合并、整理 |
| Native Messaging Host 桥接方案 | 暂时不需要本地进程桥接 |
| Accessibility 自动点击浏览器 UI | 太脆弱，不适合作为主路线 |
| 单纯 Tab 管理插件 | 目标更大，是“浏览器 Agent”，Tab 管理只是第一阶段能力 |

## 3. 推荐的最终目标定义

可以这样写进 PRD：

> 本项目旨在构建一个 Chrome / Firefox 浏览器扩展型 Agent。用户通过扩展独立页面与 Agent 对话，Agent 可读取当前浏览器上下文，并在用户授权范围内调用浏览器扩展 API 完成标签页整理、分组、合并、关闭、页面内容读取、书签管理、历史记录查询、下载管理、截图、会话记录等任务。  
>
> 项目的核心不是让外部 Agent 控制浏览器，而是让浏览器扩展自身成为 Agent。外部通信能力作为可选模块，用于向外部服务上报操作日志、同步浏览器状态、调用外部 MCP Server 工具或保存长期记忆。

## 4. MVP 目标

第一版不要做“全部扩展 API”。建议先收敛到 **Tab Agent**。

### MVP 名称

**Tab Agent Extension**

### MVP 功能范围

| 模块 | 功能 |
|---|---|
| 聊天界面 | 独立页面，支持用户输入自然语言指令 |
| Tab 列表读取 | 读取当前所有窗口、所有标签页 |
| Tab 搜索 | 按标题、URL、域名、窗口筛选 |
| Tab 分组 | 按域名、任务、主题、关键词分组 |
| Tab 关闭 | 关闭指定、重复、过期、无关 Tab |
| Tab 合并 | 把多个窗口中的相关 Tab 移动到同一窗口或同一分组 |
| Tab 记录 | 保存当前 Tab 快照 |
| 页面内容读取 | 读取当前页面标题、URL、选中文本、正文摘要 |
| 操作确认 | 关闭、批量移动、批量分组前需要用户确认 |
| 操作日志 | 记录 Agent 做了什么、为什么做 |

### MVP 不做

| 暂不做 | 原因 |
|---|---|
| 全量 bookmarks/history/downloads/cookies API | 权限太大，先控制权限边界 |
| 自动长期运行监控 | 容易变成隐私敏感产品 |
| 外部 MCP Server 复杂集成 | 当前核心目标不依赖它 |
| Native Messaging | 暂时没有本地系统能力需求 |
| 多 Agent 协作 | 先把单个扩展 Agent 做通 |

## 5. 架构目标

推荐架构：

```text
Browser Extension
├── Extension UI
│   └── 独立聊天页面
│
├── Agent Core
│   ├── 意图识别
│   ├── 任务规划
│   ├── 工具选择
│   ├── 风险判断
│   └── 结果总结
│
├── Browser Tool Layer
│   ├── tabs 工具
│   ├── tabGroups 工具
│   ├── windows 工具
│   ├── bookmarks 工具
│   ├── history 工具
│   ├── downloads 工具
│   ├── scripting 工具
│   └── storage 工具
│
├── Permission Layer
│   ├── 权限声明
│   ├── 用户确认
│   ├── 高危操作保护
│   └── 操作审计
│
└── Optional External Connector
    ├── 外部地址手动配置
    ├── 操作日志上报
    ├── 状态快照同步
    └── 可选 MCP Client 调用
```

## 6. MCP 在这个项目里的位置

你现在不应该把 MCP 放在主干。

更准确的定位是：

> **MCP 是可选外部连接协议，不是核心架构。**

也就是说：

```text
核心链路：
用户 → 扩展 Agent → 浏览器 API → 执行结果

可选链路：
扩展 Agent → 外部 MCP Server / HTTP Endpoint → 日志、记忆、外部工具
```

如果你仍然想保留 MCP Client 能力，建议按现在 MCP 的标准方向理解为 **MCP Client over Streamable HTTP**。MCP 规范当前标准传输包括 `stdio` 和 `Streamable HTTP`；旧的 HTTP+SSE 传输已被更灵活的 Streamable HTTP 替代，而 SSE 只是 Streamable HTTP 中可选的服务器消息流机制。([Model Context Protocol](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports?utm_source=chatgpt.com), [Model Context Protocol](https://modelcontextprotocol.io/specification/2025-03-26/changelog?utm_source=chatgpt.com), [Model Context Protocol](https://modelcontextprotocol.io/specification/draft/basic/transports?utm_source=chatgpt.com))

所以你这里可以这么定义：

> 扩展可以作为 MCP Client，连接用户手动配置的外部 MCP Server，用于调用外部工具或上报结构化事件；但扩展自身不作为 MCP Server，也不等待 Claude Code 回复。

## 7. 最清晰的一句话目标

最终可以压缩成这一句：

> **我要做一个 Chrome / Firefox 浏览器扩展型 Agent，它拥有独立聊天页面，能根据用户自然语言指令调用浏览器扩展 API 来管理标签页、窗口、分组、页面内容和浏览器数据；外部 MCP / HTTP 连接只作为可选的数据同步或工具调用能力。**

## 8. 下一步建议

下一步先不要继续讨论 MCP。先定 **MVP 工具集**：

```text
第一阶段只做：
tabs
tabGroups
windows
scripting
storage
```

等 Tab Agent 跑通之后，再扩展：

```text
第二阶段：
bookmarks
history
downloads
sessions
sidePanel
notifications
contextMenus
```

我建议你现在的项目目标就定为：

> **第一阶段：Tab Agent Extension。先做一个能通过聊天管理标签页和标签组的浏览器 Agent。**

---

## 用户

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.

---

## ChatGPT

我会按“设计树”逐层推进：每次只问一个决策问题，并给出我的推荐答案。没有可探索的代码库时，我会基于你已经确认的目标继续；如果你上传代码，我会优先读代码而不是追问。

---

## ChatGPT

从根节点开始。

### 问题 1：这个产品的第一身份是什么？

你现在有两个可能方向：

**A. Tab 管理工具 + AI 聊天壳**  
核心是整理 Tab，Agent 只是更自然的操作入口。

**B. 浏览器 Agent 平台**  
核心是“浏览器里的 Agent”，Tab 管理只是第一个能力模块，后续可以扩展到 bookmarks、history、downloads、sessions、page content、automation、external connector 等。

我的推荐答案：**B，浏览器 Agent 平台。**

理由：你已经明确把目标从“外部 MCP 控制浏览器”改成了“扩展本身就是 Agent，可以控制浏览器提供的 API”，并且聊天界面是独立页面，不是简单 popup。这个定位更接近平台型扩展，而不是单一 Tab 工具。

我建议用这句话作为根目标：

> 构建一个 Chrome / Firefox 浏览器扩展型 Agent。它以内置聊天页面作为交互入口，以浏览器扩展 API 作为工具层，允许用户通过自然语言管理 Tab、窗口、分组、页面内容和浏览器数据；外部 MCP/HTTP 连接仅作为可选扩展能力，不作为核心链路。

你确认吗？

请回答：**A** 或 **B**，或者直接改写你的根目标。

---

## 用户

B

---

## ChatGPT

确认：产品第一身份定为 **B：浏览器 Agent 平台**。

### 问题 2：Agent 的“大脑”运行在哪里？

这会决定后续架构、隐私、成本、权限、上架审核、离线能力和扩展复杂度。

你有四种路线：

| 选项 | 形态 | 优点 | 缺点 |
|---|---|---|---|
| A. 完全本地 | LLM / 规则引擎都在浏览器扩展内运行 | 隐私最好、无后端成本 | 模型能力弱、体积大、性能差、实现复杂 |
| B. 扩展直连 LLM API | 扩展直接请求 OpenAI / Claude / Gemini / 本地 llama-server | 架构简单、MVP 快 | API Key 暴露风险、跨域/权限问题、审查压力较大 |
| C. 自建后端 Agent | 扩展只负责 UI 和浏览器 API，后端负责 Agent 推理 | 能力强、可控、易做记忆/账号/计费 | 后端成本高，产品变重 |
| D. 混合架构 | 扩展内置 Agent Runtime，LLM Provider 可配置：本地、远程 API、自建网关 | 最灵活，适合长期演进 | 配置复杂度稍高 |

我的推荐答案：**D，但 MVP 按 B 的简单形态实现。**

更准确地说：

> 扩展内部保留 Agent Runtime、工具注册、权限判断、计划执行逻辑；LLM 通过可配置 Provider 调用。第一版允许用户手动配置 OpenAI-compatible API 地址和 Key，比如 OpenAI、OpenRouter、本地 llama-server、Ollama 网关、自建服务。暂时不做中心化后端。

推荐原因：

1. 你当前目标是“扩展本身就是 Agent”，所以工具调用、浏览器 API 控制、权限确认应该在扩展内部。
2. 但模型推理不适合一开始塞进扩展内部。
3. 用 OpenAI-compatible Provider 可以兼容你后续的本地模型、远程模型、自建模型服务。
4. 避免第一版就变成 SaaS 后端项目。

推荐第一版架构：

```text
Browser Extension
├── Chat UI
├── Agent Runtime
├── Tool Registry
├── Permission Guard
├── Browser API Adapter
└── LLM Provider Adapter
    ├── OpenAI-compatible endpoint
    ├── API Key
    ├── model name
    └── optional base URL
```

也就是说，第一版不是：

```text
Extension → 你的中心化后端 → LLM → Extension
```

而是：

```text
Extension → 用户配置的 LLM Endpoint
Extension → 浏览器扩展 API
```

请确认问题 2：

**Agent 大脑路线是否采用 D：扩展内 Agent Runtime + 可配置 LLM Provider，MVP 先做 OpenAI-compatible API？**

---

## 用户

采用D

---

## ChatGPT

确认：问题 2 采用 **D：扩展内 Agent Runtime + 可配置 LLM Provider**。

---

### 问题 3：MVP 首发浏览器范围是什么？

你长期目标是 **Chrome + Firefox**，但 MVP 要不要同时支持两者，需要明确。

有三个选择：

| 选项 | 范围 | 优点 | 缺点 |
|---|---|---|---|
| A. Chrome only | 只做 Chrome / Chromium | 最快验证，`tabs`、`tabGroups`、`sidePanel`、MV3 生态更成熟 | 后续要适配 Firefox |
| B. Chrome + Firefox 同时做 | 一开始就跨浏览器 | 架构更干净，避免 Chrome-only 设计 | 适配成本高，Firefox MV3 和 API 差异会拖慢 MVP |
| C. 抽象浏览器适配层，MVP 只实现 Chrome | 代码结构预留 Firefox Adapter，但第一版只跑 Chrome | 速度和长期架构兼顾 | 初期需要多写一层 Adapter |

我的推荐答案：**C。**

也就是：

> MVP 首发 Chrome / Chromium，架构上必须抽象 `BrowserAdapter`，避免业务逻辑直接依赖 `chrome.*`。Firefox 作为第二阶段实现 `FirefoxBrowserAdapter`。

推荐结构：

```text
Browser API Adapter
├── BrowserAdapter interface
├── ChromeBrowserAdapter
└── FirefoxBrowserAdapter // 第二阶段实现
```

第一阶段实际只实现：

```text
ChromeBrowserAdapter
```

但 Agent Runtime、Tool Registry、Permission Guard 不直接调用：

```ts
chrome.tabs.query(...)
```

而是调用：

```ts
browserAdapter.tabs.query(...)
```

推荐原因：

1. 你已经明确目标是 Chrome + Firefox，不应该把核心逻辑写死在 Chrome API 上。
2. 但一开始双端同时做会拖慢 MVP。
3. Chrome 的 `tabGroups`、扩展生态、调试体验更适合作为第一验证平台。
4. 后续 Firefox 适配时，只补 Adapter，不重写 Agent。

请确认问题 3：

**MVP 是否采用 C：架构预留 Chrome + Firefox，但第一版只实现 Chrome / Chromium？**

---

## 用户

采用B 必须双浏览器支持

---

## ChatGPT

确认：问题 3 改为 **B：MVP 必须同时支持 Chrome + Firefox**。这和你最早确认的目标浏览器一致：主要支持 Chrome 和 Firefox。

### 问题 4：跨浏览器工程策略怎么定？

既然 **Chrome + Firefox 必须首发支持**，下一个关键决策不是功能，而是工程形态。

你有四种选择：

| 选项 | 方案 | 优点 | 缺点 |
|---|---|---|---|
| A. 单 manifest，强行同时跑 Chrome / Firefox | 一个 `manifest.json` 兼容两个浏览器 | 最简单 | 很容易被 API / manifest 差异卡住 |
| B. 同一套核心代码，构建时生成 Chrome / Firefox 两份产物 | `src` 共用，`manifest.chrome.json` / `manifest.firefox.json` 分开 | 最稳，长期可维护 | 构建系统稍复杂 |
| C. Chrome 和 Firefox 两套独立代码 | 完全分开维护 | 适配自由度最高 | 维护成本翻倍，不推荐 |
| D. Chrome 用 MV3，Firefox 用 MV2 | 规避部分 Firefox MV3 差异 | Firefox 兼容性可能好 | 架构割裂，长期技术债重 |

我的推荐答案：**B。**

推荐目标：

```text
一套核心代码
    ↓
构建生成 Chrome Extension 包
    ↓
构建生成 Firefox Extension 包
```

推荐目录形态：

```text
browser-agent-extension/
├── src/
│   ├── app/                  # 聊天 UI
│   ├── background/           # 后台入口抽象
│   ├── content/              # content scripts
│   ├── agent/                # Agent Runtime
│   ├── tools/                # tabs / windows / tabGroups / scripting
│   ├── adapters/
│   │   ├── browser-adapter.ts
│   │   ├── chrome-adapter.ts
│   │   └── firefox-adapter.ts
│   └── shared/
│
├── manifests/
│   ├── manifest.chrome.json
│   └── manifest.firefox.json
│
├── dist/
│   ├── chrome/
│   └── firefox/
│
└── package.json
```

关键原则：

```text
Agent Runtime 不直接调用 chrome.* 或 browser.*
Agent Runtime 只调用 BrowserAdapter
BrowserAdapter 再分别适配 Chrome / Firefox
```

原因是 Chrome 的 MV3 明确以 extension service worker 替代 background page；Firefox 也支持 WebExtensions / Manifest V3，但 Mozilla 仍保留 Manifest V2，并且 background、service worker、非持久后台脚本等行为与 Chrome 存在差异。工程上不应该假设两边 manifest 和后台生命周期完全一致。([Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3?utm_source=chatgpt.com), [Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers?utm_source=chatgpt.com), [Mozilla 博客](https://blog.mozilla.org/en/firefox/firefox-manifest-v3-adblockers/?utm_source=chatgpt.com), [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts?utm_source=chatgpt.com))

所以我的推荐是：

> **采用单核心代码 + 双 manifest + 双构建产物。Chrome / Firefox 都作为一等目标，不做“Chrome 主、Firefox 次”的降级设计。**

请确认问题 4：

**是否采用 B：同一套核心代码，构建时生成 Chrome / Firefox 两份扩展产物？**

---

## 用户

采用B

---

## ChatGPT

确认：工程策略采用 **单核心代码 + 双 manifest + 双构建产物**。下一步要锁定的是 manifest / background 生命周期，因为这会影响 Agent Runtime 能不能常驻、如何收消息、如何执行长任务。

---

## ChatGPT

确认：问题 4 采用 **B：同一套核心代码，构建时生成 Chrome / Firefox 两份扩展产物**。

### 问题 5：Manifest 版本和后台运行模型怎么定？

因为你要求 **Chrome + Firefox 首发双浏览器支持**，这里不能只按 Chrome 的 MV3 设计。

现实约束是：

Chrome MV3 的 background 已经迁移为 **extension service worker**，它是事件驱动、非持久的后台上下文。([Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers?utm_source=chatgpt.com), [Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/manifest/background?utm_source=chatgpt.com))  
Firefox 的 WebExtensions 也支持 Manifest V3，但 MDN 明确说明：Chrome MV3 使用 `background.service_worker`，而 Firefox 使用 `background.scripts`；也就是说两边后台模型不能完全共用同一份 manifest 字段。([MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background?utm_source=chatgpt.com), [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts?utm_source=chatgpt.com))

你有三个选择：

| 选项 | 方案 | 优点 | 缺点 |
|---|---|---|---|
| A. Chrome/Firefox 都用 MV3 | 长期方向统一 | 上架方向更现代 | 后台模型仍然不同，需要适配 |
| B. Chrome 用 MV3，Firefox 用 MV2 | Firefox 后台更稳定 | 实现可能简单 | 架构割裂，长期技术债 |
| C. 双浏览器都按“事件驱动后台”设计，manifest 分别适配 | 业务模型统一，manifest/adapter 分开 | 最符合双浏览器现实 | 初期设计要求更严格 |

我的推荐答案：**C。**

也就是：

> 产品架构上不假设后台常驻。Agent Runtime 不依赖 background 长期存活，而是由独立聊天页面承载主要会话状态；background 只作为事件路由、权限协调、浏览器 API 调用代理。Chrome 构建产物使用 MV3 `background.service_worker`，Firefox 构建产物使用适配后的 `background.scripts` 或 Firefox 支持的等价后台配置。

推荐后台职责：

```text
background
├── 接收 UI / content script 消息
├── 调用 tabs / windows / tabGroups 等浏览器 API
├── 监听 tab/window 变化事件
├── 做权限检查和操作审计
└── 不保存关键 Agent 会话状态
```

不推荐后台承担：

```text
background
├── 长时间运行 Agent 推理
├── 保存完整聊天上下文
├── 维持长连接状态
├── 执行不可中断的复杂任务
└── 依赖内存变量作为长期状态
```

推荐状态归属：

```text
独立聊天页面：Agent 会话状态、当前任务状态、LLM streaming 状态
background：浏览器 API 代理、事件监听、短任务执行
storage/indexedDB：持久化配置、会话记录、操作日志、tab 快照
```

请确认问题 5：

**是否采用 C：双浏览器都按事件驱动后台模型设计，Chrome/Firefox manifest 分别适配，Agent 主状态放在独立聊天页面而不是 background？**

---

## 用户

为什么不推荐A

---

## ChatGPT

不推荐 **A：Chrome/Firefox 都用 MV3**，不是因为 MV3 方向错，而是因为 **“都用 MV3”并不能真正消除双浏览器差异**，反而容易让我们误判复杂度。

核心问题在 **background 模型**。

Chrome MV3 的后台脚本是 `background.service_worker`，Chrome 官方明确说 MV3 用 service worker 替代 background page。([Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers?utm_source=chatgpt.com), [Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/manifest/background?utm_source=chatgpt.com))

但 Firefox 的 WebExtensions 文档明确说明：在 MV3 扩展里，Chrome 使用 `service_worker`，而 Firefox 使用 `scripts`；也就是 Firefox 后台不是照搬 Chrome 的 service worker 字段。([MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background?utm_source=chatgpt.com)) Mozilla 的迁移文档也把重点放在 event-driven / non-persistent background scripts，而不是简单复刻 Chrome MV3 service worker 模型。([Firefox Extension Workshop](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/?utm_source=chatgpt.com))

所以 A 的隐含问题是：

```text
“都用 MV3”
    ≠
“同一套 manifest”
    ≠
“同一个 background 生命周期”
    ≠
“同一套运行时行为”
```

对你的项目尤其危险，因为你做的是 **浏览器 Agent 平台**，不是普通工具扩展。Agent 需要处理：

```text
聊天会话
LLM streaming
任务执行状态
tab/window 事件监听
批量操作确认
操作日志
外部 Provider 请求
页面内容读取
```

如果我们误以为 Chrome / Firefox 的 MV3 background 行为一致，就容易把 Agent Runtime 设计成依赖后台长期存活。Chrome MV3 service worker 是事件驱动、按需启动的；Firefox 虽然也支持 MV3，但后台脚本机制和 manifest 字段不同。结果就是：Chrome 能跑的状态管理方案，Firefox 未必一致；Firefox 能跑的后台脚本结构，Chrome manifest 又不能直接使用。

因此我推荐的 **C** 实际不是“反对 MV3”，而是更精确：

> **业务架构统一采用事件驱动后台模型；构建产物分别适配 Chrome / Firefox 的 manifest 和 background 差异。**

也就是说，最后可以仍然是：

```text
Chrome：Manifest V3 + background.service_worker
Firefox：Manifest V3 + background.scripts / Firefox 兼容后台配置
```

但设计上不要说“我们选择 A：双浏览器都用 MV3，所以后台一致”。正确表述应该是：

```text
双浏览器都尽量面向 MV3；
但不假设 MV3 在 Chrome 和 Firefox 中具有相同后台模型；
Agent 主状态不放在 background；
background 只做事件路由和浏览器 API 代理。
```

所以结论是：

**A 可以作为 manifest 版本目标，但不能作为架构策略。**

我建议把问题 5 的推荐答案修正为：

> **采用 MV3-first，但按事件驱动后台设计；Chrome/Firefox 各自生成适配 manifest；Agent 主状态放在独立聊天页面和持久化存储，不依赖 background 常驻。**

这比单纯选择 A 更准确。

---

## 用户

可以

---

## ChatGPT

确认：问题 5 采用修正版：

> **MV3-first，但按事件驱动后台设计；Chrome / Firefox 各自生成适配 manifest；Agent 主状态放在独立聊天页面和持久化存储，不依赖 background 常驻。**

---

### 问题 6：权限策略采用哪种？

这是浏览器 Agent 平台的关键决策。你说“控制浏览器提供的所有 API”，但如果首发就声明大量权限，会带来信任、审核、隐私和用户安装转化问题。Chrome 扩展需要在 manifest 中声明要使用的权限；MDN 也明确区分 API permissions、host permissions、optional permissions 等权限类型。([Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions?utm_source=chatgpt.com), [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions?utm_source=chatgpt.com))

可选路线：

| 选项 | 策略 | 优点 | 缺点 |
|---|---|---|---|
| A. 安装时申请全部权限 | 一次性声明 tabs、tabGroups、history、bookmarks、downloads、cookies、storage、scripting、所有 host 权限 | 开发最省事，Agent 能力完整 | 权限过大，用户不信任，审核风险高 |
| B. 最小默认权限 + 运行时按需申请 | 默认只申请核心权限，高危能力在用户使用时再申请 | 更安全，用户信任高，适合上架 | 权限管理复杂 |
| C. 分版本权限 | MVP 只要 Tab 权限，后续版本逐步增加 | 简单清晰 | 平台感弱，后续迁移麻烦 |
| D. 本地开发版全权限，商店版最小权限 | 开发效率高，发布安全 | 需要维护两套 manifest 权限配置 |

我的推荐答案：**B + D。**

也就是：

> 正式版采用“最小默认权限 + 运行时按需申请”；开发版可以提供 full-access manifest，方便快速验证所有 Browser API 工具。

推荐默认权限：

```json
{
  "permissions": [
    "tabs",
    "tabGroups",
    "windows",
    "storage",
    "scripting",
    "activeTab"
  ],
  "host_permissions": [],
  "optional_permissions": [
    "bookmarks",
    "history",
    "downloads",
    "notifications",
    "sessions",
    "clipboardRead",
    "clipboardWrite"
  ],
  "optional_host_permissions": [
    "<all_urls>"
  ]
}
```

注意：Firefox MV3 下 optional host permissions 推荐放在 `optional_host_permissions`，MDN 也说明 MV3 或更高版本应使用该字段。([MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_permissions?utm_source=chatgpt.com)) Chrome 的 `activeTab` 可以在用户主动调用扩展后临时访问当前标签页，适合降低一开始就申请 `<all_urls>` 的必要性。([Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab?utm_source=chatgpt.com))

推荐权限原则：

```text
默认可用：
- tabs
- tabGroups
- windows
- storage
- activeTab
- scripting，仅在用户触发页面读取时使用

按需开启：
- bookmarks
- history
- downloads
- sessions
- notifications
- clipboard
- <all_urls>
- cookies，不建议 MVP 开启
```

高危能力需要二次确认：

```text
批量关闭 Tab
批量移动 Tab
读取页面正文
读取浏览历史
读取书签
读取下载记录
读取 Cookie
访问所有网站内容
```

我的建议是：

> MVP 正式版不要默认申请 `history`、`bookmarks`、`downloads`、`cookies`、`<all_urls>`。这些能力全部做成 Agent Tool Module，第一次使用时弹出权限说明和浏览器权限请求。

请确认问题 6：

**权限策略是否采用 B + D：正式版最小默认权限 + 运行时按需申请，开发版 full-access manifest？**

---

## 用户

使用A

---

## ChatGPT

确认：问题 6 采用 **A：安装时申请全部权限**。

这意味着产品定位会更偏：

> **Power-user / Developer-first 浏览器 Agent**，而不是轻量普通用户扩展。

对应原则要改成：

```text
首发即声明完整权限
Agent 可以访问完整浏览器能力
权限风险通过产品内 Guardrail 控制
不是通过浏览器运行时按需授权控制
```

但这会引出下一个核心问题。

---

### 问题 7：即使安装时拥有全部权限，是否允许 LLM 直接调用全部工具？

你有两个选择：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. LLM 可直接调用全部工具 | Agent 只要判断需要，就能调用 tabs、history、bookmarks、downloads、cookies、scripting 等所有工具 |
| B. LLM 只能提出计划，高风险工具必须经过 Guardrail / 用户确认 | LLM 不直接拥有最终执行权，执行层根据风险等级拦截或要求确认 |

我的推荐答案：**B。**

原因很直接：  
你可以安装时申请全部权限，但不能把全部权限无条件交给模型。否则一条错误指令就可能导致批量关闭 Tab、清空书签、读取敏感页面内容、访问 cookies、导出历史记录等问题。

我推荐采用这个执行模型：

```text
User Intent
    ↓
Agent 生成计划
    ↓
Tool Risk Classifier
    ↓
Permission Guard
    ↓
需要确认？是 → 用户确认 → 执行
          否 → 直接执行
    ↓
Browser API Adapter
```

工具分级：

```text
Low Risk：可直接执行
- 查询当前 tabs
- 查询窗口列表
- 获取当前 active tab 标题和 URL
- 创建新 tab
- 聚合 tab 摘要

Medium Risk：建议确认
- 移动 tab
- 分组 tab
- 修改 tab group 名称
- 固定 / 取消固定 tab
- 静音 / 取消静音 tab

High Risk：必须确认
- 批量关闭 tab
- 关闭窗口
- 读取页面正文
- 读取 history
- 读取 bookmarks
- 读取 downloads
- 执行 scripting 注入
- 访问 cookies
- 批量修改 / 删除书签
```

我的推荐设计结论：

> **权限一次性给，但执行权分级控制。LLM 只能生成计划和工具调用请求，真正执行前必须经过本地 Guardrail。**

请确认问题 7：

**是否采用 B：LLM 不能直接调用全部工具，所有工具调用必须经过本地风险分级与用户确认机制？**

---

## 用户

采用B

---

## ChatGPT

确认：问题 7 采用 **B：LLM 不能直接执行全部工具，所有工具调用必须经过本地风险分级与用户确认机制**。

---

### 问题 8：用户确认机制按什么粒度触发？

既然你选择了“安装时全权限 + 本地 Guardrail”，下一个关键点是：**什么时候弹确认？确认一次还是每步都确认？**

可选路线：

| 选项 | 策略 | 示例 | 优点 | 缺点 |
|---|---|---|---|---|
| A. 每个工具调用都确认 | `closeTab(id=1)` 确认一次，`closeTab(id=2)` 再确认一次 | 最安全 | 极其打断体验 |
| B. 按任务计划整体确认 | Agent 先生成计划：“关闭 12 个重复 Tab，创建 3 个分组”，用户确认后批量执行 | 体验最好，适合 Agent | 计划必须足够透明 |
| C. 按风险等级确认 | 低风险直接执行，中/高风险弹确认 | 平衡安全和效率 | 需要风险分类稳定 |
| D. 按工具类型确认一次并记住 | 用户第一次允许“批量关闭 Tab”，以后默认允许 | 流畅 | 容易放大误操作风险 |

我的推荐答案：**B + C**。

也就是：

> Agent 先生成一个可审查的任务计划；低风险步骤可以直接执行，中高风险步骤必须进入计划确认。用户确认的是“整个计划”，不是每个底层 API 调用。

推荐流程：

```text
用户：帮我整理这些标签页，关闭重复的，按项目分组
    ↓
Agent 分析 tabs
    ↓
生成执行计划
    ↓
Guardrail 标记风险
    ↓
展示确认页
    ↓
用户确认
    ↓
批量执行
    ↓
返回执行结果和操作日志
```

确认页应该展示：

```text
本次计划：
1. 创建 4 个标签组
2. 移动 23 个标签页
3. 关闭 7 个重复标签页

风险操作：
- 将关闭 7 个标签页
- 不会读取页面正文
- 不会访问历史记录
- 不会修改书签

需要确认：
[确认执行] [修改计划] [取消]
```

推荐规则：

```text
低风险：
- 查询 tabs
- 查询 windows
- 查询 tabGroups
- 获取 active tab 基础信息
=> 不弹确认

中风险：
- 移动 tab
- 创建/修改 tab group
- 固定/静音 tab
=> 可包含在计划确认里

高风险：
- 关闭 tab/window
- 读取页面正文
- 读取 history/bookmarks/downloads/cookies
- 注入 scripting
- 删除/修改书签
=> 必须包含在计划确认里，且明确列出影响范围
```

我的推荐结论：

> **采用“计划级确认 + 风险分级”。Agent 不直接执行复杂任务，而是先给出可审查计划；用户确认后，执行层按计划调用浏览器 API。**

请确认问题 8：

**是否采用 B + C：低风险直接执行，中高风险进入任务计划，由用户对整个计划统一确认？**

---

## 用户

采用B+C

---

## ChatGPT

确认：问题 8 采用 **B + C：低风险直接执行，中高风险进入任务计划，由用户对整个计划统一确认**。

### 问题 9：Agent 的执行架构是“直接工具调用”还是“计划-执行分离”？

这是核心架构决策。因为你现在已经确定：

```text
安装时全权限
但 LLM 不直接拥有最终执行权
中高风险操作必须计划级确认
```

所以要决定 LLM 在系统里的角色。

可选路线：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. LLM 直接调用工具 | LLM 输出 tool call，系统校验后执行 |
| B. LLM 只生成 Plan，Executor 才能执行工具 | LLM 负责规划，确定性执行器负责调用浏览器 API |
| C. 混合模式 | 低风险允许 LLM 直接 tool call，中高风险走 Plan + Executor |
| D. 多 Agent 模式 | Planner Agent、Reviewer Agent、Executor Agent 分开 |

我的推荐答案：**C，但架构上按 B 设计。**

也就是说：

> 系统底层必须是 **Plan → Guardrail → Confirm → Execute**。  
> 但为了体验，低风险任务可以走快速路径，由 LLM 生成轻量 tool call，Guardrail 判断低风险后立即执行。

推荐执行模型：

```text
User Message
    ↓
Agent Runtime
    ↓
Intent Classifier
    ↓
是否低风险简单任务？
    ├── 是：Tool Call → Guardrail → Execute
    └── 否：Plan → Risk Annotate → User Confirm → Execute
```

示例：

```text
“列出当前所有 GitHub 标签页”
=> 低风险
=> 直接查询 tabs
```

```text
“把所有 GitHub 标签页分组”
=> 中风险
=> 生成计划
=> 展示影响范围
=> 用户确认
=> 执行分组
```

```text
“关闭所有重复标签页”
=> 高风险
=> 生成计划
=> 列出将关闭的 tabs
=> 用户确认
=> 执行关闭
```

我不推荐纯 A，因为你已经选择了强 Guardrail。如果让 LLM 直接拥有工具执行语义，后续很容易变成：

```text
LLM 说要执行
Guardrail 只是拦截器
```

这会让安全模型变弱。

我也不推荐一开始做 D，多 Agent 会让 MVP 过重。

推荐结论：

> **架构上采用计划-执行分离：LLM 负责理解意图和生成计划，Executor 负责确定性执行；低风险查询类任务允许快速 tool call，但也必须经过 Guardrail。**

请确认问题 9：

**是否采用 C：低风险走快速工具调用，中高风险走 Plan → Guardrail → Confirm → Execute；整体架构按计划-执行分离设计？**

---

## 用户

C

---

## ChatGPT

确认：问题 9 采用 **C：低风险走快速工具调用，中高风险走 Plan → Guardrail → Confirm → Execute；整体架构按计划-执行分离设计**。这也符合你前面把目标收敛为“扩展本身是 Agent，而不是外部 MCP 控制器”的方向。

---

### 问题 10：Plan 的数据结构采用什么形式？

既然已经确定 **计划-执行分离**，下一步必须定义：LLM 生成的 Plan 到底是什么。

可选路线：

| 选项 | 方案 | 说明 |
|---|---|---|
| A. 自然语言计划 | LLM 输出一段文字，Executor 再理解文字执行 |
| B. 结构化 JSON Plan | LLM 输出严格 JSON，Executor 只认固定 schema |
| C. 直接 tool calls 数组 | LLM 输出工具调用列表，基本等同函数调用 |
| D. DAG 任务图 | 每个步骤有依赖关系，支持并行、回滚、复杂任务 |

我的推荐答案：**B。**

也就是：

> Agent 生成严格的结构化 JSON Plan，Executor 只执行符合 schema 的计划。自然语言只用于展示给用户，不作为执行依据。

推荐 Plan 结构：

```json
{
  "planId": "plan_abc123",
  "intent": "organize_tabs",
  "summary": "Group GitHub-related tabs and close duplicates.",
  "riskLevel": "high",
  "requiresConfirmation": true,
  "steps": [
    {
      "id": "step_1",
      "tool": "tabs.query",
      "riskLevel": "low",
      "params": {
        "urlContains": "github.com"
      }
    },
    {
      "id": "step_2",
      "tool": "tabGroups.create",
      "riskLevel": "medium",
      "params": {
        "title": "GitHub"
      }
    },
    {
      "id": "step_3",
      "tool": "tabs.moveToGroup",
      "riskLevel": "medium",
      "params": {
        "source": "step_1.results"
      }
    },
    {
      "id": "step_4",
      "tool": "tabs.closeDuplicates",
      "riskLevel": "high",
      "params": {
        "scope": "github.com"
      }
    }
  ]
}
```

不推荐 A，因为自然语言计划不可审计、不可稳定执行。

不推荐 C 作为主模型，因为它太接近“LLM 直接调工具”，会削弱你已经确定的 Guardrail。

不推荐 MVP 就做 D，因为 DAG 会把复杂度拉高。第一版可以先做：

```text
sequential steps
```

后续再扩展：

```text
dependencies
parallel execution
rollback policy
dry-run
```

推荐结论：

> **采用结构化 JSON Plan。Executor 只接受固定 schema 的 Plan；所有 step 必须声明 tool、params、riskLevel、requiresConfirmation；自然语言 summary 只用于 UI 展示。**

请确认问题 10：

**是否采用 B：结构化 JSON Plan 作为 Agent 和 Executor 之间的唯一执行协议？**

---

## 用户

把Plan去掉 直接执行高风险操作拦截。用户点击同意继续执行

---

## ChatGPT

确认：**去掉 Plan。**

新的执行模型改成：

```text
User Message
    ↓
LLM 生成 Tool Call
    ↓
Guardrail 检查风险等级
    ↓
低风险：直接执行
中/高风险：拦截 → 展示影响范围 → 用户点击同意 → 继续执行
    ↓
Executor 调用 Browser API
    ↓
返回结果
```

也就是说，不再做：

```text
Plan → Confirm → Execute
```

而是：

```text
Tool Call → Risk Intercept → Confirm → Continue
```

这更轻，MVP 更快，也更符合你现在想做的“浏览器扩展 Agent 直接操作浏览器 API”的方向。你的原始目标就是扩展本身成为 Agent，而不是外部 MCP/Claude Code 控制器。

我建议把问题 9 / 10 的结论修正为：

> **不引入独立 Plan 层。LLM 可以生成工具调用请求，但所有工具调用必须先经过 Guardrail。低风险直接执行；中高风险被拦截，生成确认弹窗，用户同意后继续执行原工具调用。**

---

### 问题 10：高风险拦截时，确认界面展示什么粒度的信息？

你现在选择的是“直接执行，高风险拦截”。那拦截弹窗必须定义清楚，否则用户不知道自己在同意什么。

有三个选择：

| 选项 | 策略 | 示例 |
|---|---|---|
| A. 只展示一句确认 | “该操作有风险，是否继续？” |
| B. 展示工具调用摘要 | “将调用 `tabs.remove`，关闭 7 个标签页” |
| C. 展示影响对象清单 | 列出将被关闭的 tab 标题、URL、窗口、数量 |

我的推荐答案：**C。**

原因：既然你不做 Plan，就必须让 **Tool Call Confirmation** 足够透明。尤其是关闭 Tab、读取页面内容、读取历史记录、读取书签、访问 Cookie、批量移动 Tab 这些操作，用户需要看到实际影响对象。

推荐确认弹窗：

```text
高风险操作确认

Agent 想要执行：
关闭 7 个重复标签页

影响范围：
1. GitHub - issue #123
   https://github.com/xxx/yyy/issues/123

2. GitHub - pull request #88
   https://github.com/xxx/yyy/pull/88

3. OpenAI Platform Docs
   https://platform.openai.com/docs

风险说明：
- 这些标签页会被关闭
- 关闭后只能依赖浏览器历史记录恢复
- 不会读取页面正文
- 不会访问 Cookie

[同意执行] [取消]
```

推荐确认数据结构不要叫 Plan，可以叫：

```ts
type ToolCallConfirmation = {
  id: string;
  tool: string;
  action: string;
  riskLevel: "medium" | "high" | "critical";
  summary: string;
  affectedObjects: Array<{
    type: "tab" | "window" | "bookmark" | "history" | "download" | "cookie" | "page";
    id?: string;
    title?: string;
    url?: string;
    reason?: string;
  }>;
  warnings: string[];
  originalToolCall: ToolCall;
};
```

推荐结论：

> **高风险拦截不展示抽象 Plan，而展示具体影响对象清单。用户同意后，继续执行被拦截的原始 Tool Call。**

请确认问题 10：

**是否采用 C：高风险确认弹窗必须展示具体影响对象清单，而不是只展示一句风险提示？**

---

## 用户

采用C

---

## ChatGPT

确认：问题 10 采用 **C：高风险确认弹窗必须展示具体影响对象清单**。这也符合你现在的路线：扩展内部 Agent 直接调用浏览器能力，但执行前由本地 Guardrail 接管高风险操作。

---

### 问题 11：为了展示“影响对象清单”，工具是否必须支持 Preflight？

也就是：真正执行前，先跑一次“预检查 / 影响分析”，只计算会影响哪些对象，不真正修改浏览器状态。

例如用户说：

```text
关闭所有重复标签页
```

不能直接弹：

```text
将关闭重复标签页，是否继续？
```

而应该先计算：

```text
将关闭 7 个标签页：
1. GitHub issue #123
2. GitHub PR #88
3. OpenAI Docs
...
```

这要求高风险工具支持两个阶段：

```text
preflight：分析影响对象，不执行
execute：用户确认后真正执行
```

可选方案：

| 选项 | 策略 | 说明 |
|---|---|---|
| A. 不做 preflight | 只展示工具名和风险说明 | 简单，但用户不知道具体影响 |
| B. 只有高风险工具支持 preflight | 关闭、删除、读取敏感数据前先分析影响范围 | 复杂度可控 |
| C. 所有工具都支持 preflight | 每个工具都有 dry-run 能力 | 架构最完整，但 MVP 偏重 |

我的推荐答案：**B。**

推荐规则：

```text
低风险工具：
- 直接执行
- 不需要 preflight

中风险工具：
- 可选 preflight
- 例如批量移动 tab、创建 tab group

高风险工具：
- 必须 preflight
- 没有 preflight 结果，不允许执行
```

推荐工具接口：

```ts
type BrowserTool = {
  name: string;
  riskLevel: "low" | "medium" | "high" | "critical";

  preflight?: (input: unknown, ctx: ToolContext) => Promise<ToolPreflightResult>;

  execute: (input: unknown, ctx: ToolContext) => Promise<ToolExecuteResult>;
};
```

推荐高风险执行流：

```text
LLM 生成 tool call
    ↓
Guardrail 判断 high risk
    ↓
调用 tool.preflight()
    ↓
生成 affectedObjects
    ↓
展示确认弹窗
    ↓
用户同意
    ↓
调用 tool.execute()
```

我的推荐结论：

> **采用 B：只有中高风险工具需要支持 Preflight，其中高风险工具必须支持 Preflight。没有影响对象清单，就不能执行高风险操作。**

请确认问题 11：

**是否采用 B：高风险工具必须支持 Preflight，用于生成确认弹窗里的影响对象清单？**

---

## 用户

采用B

---

## ChatGPT

确认：问题 11 采用 **B：高风险工具必须支持 Preflight，用于生成确认弹窗里的影响对象清单**。

当前执行链路修正为：

```text
LLM Tool Call
    ↓
Guardrail 判断风险
    ↓
低风险：直接 execute
中风险：可选 preflight / 可选确认
高风险：必须 preflight
    ↓
生成 affectedObjects
    ↓
用户确认
    ↓
execute
```

---

### 问题 12：LLM 调用工具的协议怎么设计？

你已经决定：

```text
扩展内 Agent Runtime
+ 可配置 LLM Provider
+ 不做 Plan
+ 直接 Tool Call
+ 高风险 Preflight 拦截
```

所以下一个关键点是：**LLM 怎么表达它想调用哪个浏览器工具？**

有四种方案：

| 选项 | 策略 | 说明 |
|---|---|---|
| A. 只用 OpenAI function calling | 依赖 OpenAI-compatible 接口的 `tools` / `tool_calls` |
| B. 只用 prompt JSON | 让模型按固定 JSON 格式输出工具调用 |
| C. 内部统一 ToolCall Schema，Provider Adapter 负责适配 | 内部只认自己的 `ToolCall`，不同模型接口各自转换 |
| D. 直接让每个 Provider 自己定义工具调用格式 | 最自由，但 Agent Runtime 混乱 |

我的推荐答案：**C。**

也就是：

> 系统内部定义统一的 `ToolCall` 协议。  
> 如果 LLM Provider 支持 native tool calling，就由 Provider Adapter 转成内部 `ToolCall`。  
> 如果 Provider 不支持，就使用 prompt JSON fallback，再解析成内部 `ToolCall`。

推荐内部结构：

```ts
type ToolCall = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  source: "native_tool_call" | "json_fallback";
  raw?: unknown;
};
```

示例：

```json
{
  "id": "call_001",
  "tool": "tabs.closeDuplicates",
  "args": {
    "scope": "currentWindow",
    "matchBy": ["url"]
  },
  "source": "native_tool_call"
}
```

这样做的好处是：

```text
Agent Runtime 不关心 OpenAI / Ollama / OpenRouter / local llama-server 的差异
Guardrail 只检查统一 ToolCall
Executor 只执行统一 ToolCall
Provider Adapter 负责模型接口差异
```

我不推荐 A，因为你要支持可配置 Provider，有些 OpenAI-compatible 服务的 tool calling 兼容度并不稳定。

我不推荐 B，因为纯 JSON prompt 更容易被模型格式污染。

推荐结论：

> **采用 C：内部统一 ToolCall Schema；Provider Adapter 优先使用 native tool calling，不支持时 fallback 到 prompt JSON。**

请确认问题 12：

**是否采用 C：内部统一 ToolCall Schema，由 Provider Adapter 适配不同 LLM 工具调用格式？**

---

## 用户

C

---

## ChatGPT

确认：问题 12 采用 **C：内部统一 ToolCall Schema，由 Provider Adapter 适配不同 LLM 工具调用格式**。

当前链路变成：

```text
LLM Provider
    ↓
Provider Adapter
    ↓
Internal ToolCall Schema
    ↓
Guardrail
    ↓
Preflight / Execute
    ↓
BrowserAdapter
```

这和你当前目标一致：扩展本身是 Agent，不再依赖外部 MCP Server 或 Claude Code 回路。

---

### 问题 13：Tool Registry 的元数据是否作为唯一事实来源？

现在你已经有统一 `ToolCall`，下一步要决定：**工具列表、参数 schema、风险等级、权限、是否需要 preflight，这些信息从哪里来？**

可选路线：

| 选项 | 策略 | 说明 |
|---|---|---|
| A. 写死在 prompt 里 | 在 system prompt 中手写所有工具说明 |
| B. 写死在代码里，prompt 手动同步 | 工具有代码实现，也有一份手写 prompt 描述 |
| C. Tool Registry 作为唯一事实来源 | 工具元数据统一注册，然后自动生成 LLM tool schema、Guardrail 规则、UI 展示信息 |
| D. 每个 Provider 自己维护工具定义 | OpenAI 一套，JSON fallback 一套，UI 再一套 |

我的推荐答案：**C。**

也就是：

> 所有工具都必须注册到 `ToolRegistry`。  
> `ToolRegistry` 是工具名称、参数 schema、风险等级、权限需求、浏览器兼容性、preflight 能力、执行函数的唯一来源。  
> LLM 看到的工具 schema、Guardrail 检查、确认弹窗、Executor 调用都从这里生成。

推荐工具定义结构：

```ts
type ToolDefinition = {
  name: string;
  title: string;
  description: string;

  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;

  riskLevel: "low" | "medium" | "high" | "critical";

  requiredPermissions: string[];
  requiredHostPermissions?: string[];

  supportedBrowsers: Array<"chrome" | "firefox">;

  requiresPreflight: boolean;

  preflight?: (args: unknown, ctx: ToolContext) => Promise<ToolPreflightResult>;

  execute: (args: unknown, ctx: ToolContext) => Promise<ToolExecuteResult>;
};
```

示例：

```ts
const closeDuplicatesTool: ToolDefinition = {
  name: "tabs.closeDuplicates",
  title: "Close Duplicate Tabs",
  description: "Find and close duplicate tabs by URL, title, or normalized URL.",

  inputSchema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["currentWindow", "allWindows"]
      },
      matchBy: {
        type: "array",
        items: {
          type: "string",
          enum: ["url", "normalizedUrl", "title"]
        }
      }
    },
    required: ["scope", "matchBy"]
  },

  riskLevel: "high",
  requiredPermissions: ["tabs"],
  supportedBrowsers: ["chrome", "firefox"],
  requiresPreflight: true,

  preflight: preflightCloseDuplicates,
  execute: executeCloseDuplicates
};
```

这样后续可以自动生成：

```text
LLM tools schema
JSON fallback prompt
Guardrail policy
确认弹窗内容
工具文档
开发调试面板
浏览器兼容性矩阵
```

我不推荐 A / B，因为工具一多，prompt、代码、UI、风险策略会不可避免地漂移。

我的推荐结论：

> **采用 Tool Registry 作为唯一事实来源。Provider Adapter、Guardrail、Preflight、Executor、UI 都只消费 Tool Registry 元数据，不维护重复工具定义。**

请确认问题 13：

**是否采用 C：Tool Registry 作为工具定义、风险等级、权限需求、preflight 能力和执行函数的唯一事实来源？**

---

## 用户

采用C

---

## ChatGPT

确认：问题 13 采用 **C：Tool Registry 作为唯一事实来源**。

当前核心链路：

```text
LLM Provider
    ↓
Provider Adapter
    ↓
Internal ToolCall
    ↓
Tool Registry
    ↓
Guardrail
    ↓
Preflight / Confirm / Execute
    ↓
BrowserAdapter
```

这和你的目标一致：扩展本身是 Agent，直接控制浏览器扩展 API，而不是外部 MCP Server 控制浏览器。

---

### 问题 14：Tool 设计是“原始 API 映射”还是“语义化工具”？

你说要“控制浏览器给扩展提供的所有 API”，这里有一个分叉：

| 选项 | 策略 | 示例 |
|---|---|---|
| A. 原始 API 映射 | 每个浏览器 API 基本映射成一个 Tool | `tabs.query`、`tabs.remove`、`bookmarks.search`、`history.search` |
| B. 语义化工具 | Tool 面向用户意图，而不是底层 API | `tabs.closeDuplicates`、`tabs.groupByDomain`、`bookmarks.findRelated` |
| C. 双层工具体系 | 底层保留 Raw Tool，上层暴露 Semantic Tool 给 Agent | Agent 优先用语义工具，Raw Tool 受限制 |

我的推荐答案：**C。**

也就是：

> 内部实现保留 Raw Browser API Tool，但默认不直接暴露给 LLM。  
> LLM 主要调用语义化工具。  
> 只有开发模式、调试模式或明确授权场景，才允许调用 Raw Tool。

推荐分层：

```text
Tool Registry
├── Semantic Tools        # 默认给 Agent 使用
│   ├── tabs.listRelated
│   ├── tabs.closeDuplicates
│   ├── tabs.groupByDomain
│   ├── tabs.mergeWindows
│   ├── page.summarizeCurrent
│   └── bookmarks.saveSession
│
└── Raw Tools             # 内部/高级模式使用
    ├── raw.tabs.query
    ├── raw.tabs.remove
    ├── raw.tabs.group
    ├── raw.bookmarks.search
    ├── raw.history.search
    └── raw.downloads.search
```

原因：

1. **直接暴露 Raw API 会让 LLM 太低层。**  
   用户说“整理 GitHub 相关标签页”，模型不应该自己拼几十个 `tabs.query`、`tabs.group`、`tabs.move`。

2. **语义工具更容易做 Guardrail。**  
   `tabs.closeDuplicates` 可以内置 preflight，列出即将关闭的 tabs。  
   但如果 LLM 直接调用 `raw.tabs.remove`，风险分析会更难。

3. **跨浏览器适配更稳。**  
   Chrome / Firefox API 差异可以藏在 Raw Adapter 里，上层 Semantic Tool 保持一致。

4. **未来能支持高级模式。**  
   你是 developer-first 产品，可以保留 Raw Tool，但不要默认给普通 Agent 调用。

推荐结论：

> **采用双层工具体系：Semantic Tool 是 Agent 默认工具；Raw Tool 是内部执行层和高级调试能力。**

请确认问题 14：

**是否采用 C：双层工具体系，Agent 默认调用语义化工具，Raw Browser API Tool 只作为内部/高级能力？**

---

## 用户

采用C

---

## ChatGPT

确认：问题 14 采用 **C：双层工具体系**。

当前工具模型：

```text
Tool Registry
├── Semantic Tools
│   └── Agent 默认可用
│
└── Raw Tools
    └── 内部执行层 / 开发者模式 / 高级调试使用
```

---

### 问题 15：MVP 默认暴露给 Agent 的 Semantic Tools 范围是什么？

你长期目标是“扩展本身就是 Agent，可以控制浏览器给扩展提供的所有 API”。但 MVP 仍然需要一个首发边界，否则工具面过大，会影响稳定性、测试和安全策略。这个目标来自你前面已经收敛出的方向：扩展内部 Agent 直接控制浏览器 API，而不是外部 MCP 控制链路。

有三个选择：

| 选项 | 范围 | 说明 |
|---|---|---|
| A. Tab-only | 只做 tabs / tabGroups / windows | 最快，但平台感弱 |
| B. Workspace Agent | tabs / tabGroups / windows / page basic read / session snapshot | 最适合作为 MVP |
| C. Full Browser Agent | tabs、bookmarks、history、downloads、cookies、sessions、page content 全部首发 | 平台感强，但 MVP 风险过大 |

我的推荐答案：**B：Workspace Agent**。

也就是 MVP 首发不是“所有浏览器 API 全部语义化”，而是先解决一个完整场景：

> **管理当前浏览器工作区。**

推荐首批 Semantic Tools：

```text
tabs.list
tabs.find
tabs.findDuplicates
tabs.closeDuplicates
tabs.groupByDomain
tabs.groupByKeyword
tabs.moveToWindow
tabs.mergeWindows
tabs.pin
tabs.mute

windows.list
windows.focus
windows.createWorkspace

tabGroups.list
tabGroups.create
tabGroups.rename
tabGroups.moveTabs

page.getCurrentPageInfo
page.getSelection
page.getReadableText

sessions.saveSnapshot
sessions.restoreSnapshot
```

暂不默认暴露为 Semantic Tools：

```text
bookmarks.*
history.*
downloads.*
cookies.*
clipboard.*
notifications.*
```

但这些可以先作为 Raw Tools 存在于内部：

```text
raw.bookmarks.search
raw.history.search
raw.downloads.search
raw.cookies.getAll
```

后续再逐步包装成语义工具。

推荐原因：

1. **Workspace Agent 是一个完整可验证闭环。**  
   用户能明显感知价值：整理 Tab、合并窗口、分组、关闭重复、保存会话。

2. **风险可控。**  
   Tab / Window 操作虽然有风险，但比 history / cookies / downloads 更容易做 preflight 和确认。

3. **跨 Chrome + Firefox 更现实。**  
   tabs、windows、tabGroups、content script 读取页面基础内容，是双浏览器首发更容易统一的能力面。

4. **不违背“全 API 平台”目标。**  
   Raw Tools 和权限可以先存在，Semantic Tools 分阶段开放。

推荐结论：

> **MVP 定位为 Workspace Agent：默认暴露 tabs、windows、tabGroups、当前页面基础读取、session snapshot 相关语义工具；其他浏览器 API 先作为 Raw Tools 或后续模块。**

请确认问题 15：

**是否采用 B：MVP 首发 Workspace Agent，而不是 Tab-only 或 Full Browser Agent？**

---

## 用户

走 C Full Browser Agent

---

## ChatGPT

确认：问题 15 采用 **C：Full Browser Agent**。

这意味着 MVP 首发目标不是 Workspace Agent，而是：

> **首发即覆盖浏览器扩展能访问的主要 API 域：tabs、windows、tabGroups、bookmarks、history、downloads、sessions、page content、cookies、clipboard、notifications 等，并通过 Agent 统一调度。**

这会让项目更像 **Power-user Browser Agent**，不是普通 Tab 管理插件。

---

### 问题 16：Full Browser Agent 的“全”是否包含危险系统级扩展 API？

这里必须切一刀。  
“浏览器给扩展提供的所有 API”里，有些 API 不是普通浏览器管理能力，而是系统级、隐私级、网络级能力。

比如：

```text
cookies
history
downloads
bookmarks
tabs
scripting
webRequest
declarativeNetRequest
proxy
privacy
management
debugger
nativeMessaging
identity
storage
clipboard
notifications
alarms
sidePanel
contextMenus
```

你有三个选择：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. 真·全部 API | 只要浏览器扩展 API 有，就纳入 Agent 能力 |
| B. 浏览器数据与工作流 API 全覆盖，系统级 API 排除 | 覆盖 tabs、bookmarks、history、downloads、cookies、sessions、page、clipboard 等；暂不开放 proxy、privacy、debugger、management、nativeMessaging |
| C. 分级开放 | 默认覆盖浏览器数据与工作流 API；系统级 API 进入 Expert Mode，需要单独开关 |

我的推荐答案：**C。**

也就是：

> Full Browser Agent 首发覆盖主要浏览器数据与工作流 API，但对系统级、高危 API 做 Expert Mode 隔离。

推荐分层：

```text
默认 Full Browser Agent 能力：
- tabs
- windows
- tabGroups
- bookmarks
- history
- downloads
- sessions
- page content
- cookies
- storage
- clipboard
- notifications
- contextMenus
- sidePanel
- alarms

Expert Mode 才允许：
- proxy
- privacy
- management
- debugger
- webRequest
- declarativeNetRequest
- nativeMessaging
- identity
```

原因：

1. **Full Browser Agent 不等于无边界 Agent。**
2. `cookies`、`history` 已经足够敏感，但仍属于浏览器数据管理范畴。
3. `proxy`、`privacy`、`debugger`、`management`、`nativeMessaging` 更接近浏览器/系统控制层，误操作代价更高。
4. Expert Mode 可以保留 developer-first 能力，同时不污染默认 Agent 行为。

我的推荐结论：

> **采用 C：Full Browser Agent 默认覆盖浏览器数据与工作流 API；系统级、高危扩展 API 放入 Expert Mode。**

请确认问题 16：

**是否采用 C：Full Browser Agent + Expert Mode 分级开放系统级 API？**

---

## 用户

采用 C

---

## ChatGPT

确认：问题 16 采用 **C：Full Browser Agent + Expert Mode 分级开放系统级 API**。

当前能力边界：

```text
Default Full Browser Agent
├── tabs
├── windows
├── tabGroups
├── bookmarks
├── history
├── downloads
├── sessions
├── page content
├── cookies
├── storage
├── clipboard
├── notifications
├── contextMenus
├── sidePanel
└── alarms

Expert Mode
├── proxy
├── privacy
├── management
├── debugger
├── webRequest
├── declarativeNetRequest
├── nativeMessaging
└── identity
```

---

### 问题 17：Expert Mode 如何启用？

既然系统级 API 进入 Expert Mode，下一步要明确它的启用方式。这里会影响安全边界、产品定位和用户信任。

可选方案：

| 选项 | 策略 | 说明 |
|---|---|---|
| A. 设置页一个开关 | 用户打开 Expert Mode 后，所有高级 API 可用 |
| B. 每个 API 域单独开关 | `debugger`、`proxy`、`privacy`、`nativeMessaging` 分别启用 |
| C. 分组开关 + 单 API 开关 | 先启用 Expert Mode，再按 API 域逐个授权 |
| D. 开发版默认启用，商店版隐藏 | 面向开发调试方便，但产品行为分裂 |

我的推荐答案：**C。**

推荐机制：

```text
设置页：
[ ] Enable Expert Mode

启用后显示：

Expert API Modules
[ ] Debugger API
[ ] Proxy API
[ ] Privacy API
[ ] WebRequest API
[ ] DeclarativeNetRequest API
[ ] NativeMessaging API
[ ] Extension Management API
[ ] Identity API
```

执行规则：

```text
没有开启 Expert Mode：
- Expert Tools 不注册给 Agent
- LLM 看不到这些工具
- Raw Tool 也不能调用这些 API

开启 Expert Mode，但未开启具体 API：
- 对应工具仍不可用

开启 Expert Mode + 开启具体 API：
- 工具注册到 Tool Registry
- Guardrail 标记为 critical
- 每次高危调用仍需 preflight + 用户确认
```

我的推荐结论：

> **采用 C：Expert Mode 是总开关，具体系统级 API 还需要逐项开启。开启后仍不代表模型可以无确认执行，所有 Expert Tool 默认 critical。**

请确认问题 17：

**是否采用 C：Expert Mode 总开关 + 每个系统级 API 域单独开关？**

---

## 用户

采用 C

---

## ChatGPT

确认：问题 17 采用 **C：Expert Mode 总开关 + 每个系统级 API 域单独开关**。

当前 Expert Mode 规则：

```text
Expert Mode = 总开关

具体 API 域 = 子开关
- debugger
- proxy
- privacy
- webRequest
- declarativeNetRequest
- nativeMessaging
- management
- identity
```

并且：

```text
未开启 Expert Mode：
  Expert Tools 不注册给 Agent

开启 Expert Mode 但未开启具体 API：
  对应 Expert Tools 仍不可用

开启 Expert Mode + 对应 API：
  工具可注册，但默认 critical risk
  仍需要 preflight + 用户确认
```

---

### 问题 18：浏览器敏感数据是否允许发送给 LLM Provider？

这是 Full Browser Agent 最关键的隐私边界。

因为你已经选择：

```text
安装时全权限
Full Browser Agent
覆盖 cookies / history / downloads / bookmarks / page content
扩展内 Agent Runtime
可配置外部 LLM Provider
```

这意味着扩展可能读取非常敏感的数据：

```text
当前页面正文
浏览历史
书签
下载记录
Cookie
Tab URL
页面选中文本
表单附近文本
登录后页面内容
```

问题是：这些数据能不能直接作为上下文发给 OpenAI-compatible API、OpenRouter、本地 llama-server、自建服务等 Provider？

可选方案：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. 默认允许发送 | 工具读取结果可以直接进入 LLM 上下文 | 功能最强，但隐私风险最大 |
| B. 敏感数据发送前弹确认 | 每次发送 page/history/cookie 等敏感内容前询问用户 |
| C. 数据分级策略 | 普通数据可发送；敏感数据默认只在本地展示，发送给 LLM 需要显式确认 |
| D. 本地优先 | 只有本地模型可接收敏感数据；远程 Provider 默认禁止 |

我的推荐答案：**C + 可选 D 模式**。

也就是：

> 默认采用数据分级。Tab 标题、URL、窗口信息可以作为普通上下文；页面正文、history、bookmarks、downloads、cookies、clipboard 等敏感数据默认不自动发送给远程 LLM。若任务需要发送，必须展示数据范围并获得用户确认。用户也可以开启“Local Provider Trust Mode”，允许本地模型接收更多敏感数据。

推荐数据分级：

```text
Public / Low Sensitivity：
- tab title
- tab URL
- window id
- tab group name
- favicon url

Sensitive：
- page readable text
- selected text
- bookmarks
- browsing history
- downloads
- clipboard
- form-adjacent text

Critical：
- cookies
- auth-related headers
- identity data
- password-like fields
- tokens / API keys
```

推荐规则：

```text
Low Sensitivity：
  可进入 LLM 上下文

Sensitive：
  需要用户确认后才可发送给远程 LLM

Critical：
  默认不发送给远程 LLM
  只有 Expert Mode + 明确确认才允许
```

确认弹窗示例：

```text
Agent 需要把以下数据发送给模型提供商：

数据类型：
- 当前页面正文
- 当前页面 URL
- 选中文本

发送目标：
- OpenAI-compatible Provider: https://api.example.com

用途：
- 总结当前页面内容

[允许本次发送] [取消]
```

推荐结论：

> **采用 C：数据分级策略。读取权限和发送权限分离；Agent 可以读取浏览器数据，但不能默认把敏感数据发给 LLM Provider。**

请确认问题 18：

**是否采用 C：浏览器数据分级，敏感数据发送给 LLM Provider 前必须显式确认？**

---

## 用户

采用C+D

---

## ChatGPT

确认：问题 18 采用 **C + D：数据分级策略 + 本地 Provider 优先信任模式**。

当前隐私边界变为：

```text
读取权限 ≠ 发送权限

扩展可以读取浏览器数据；
但是否能发送给 LLM Provider，需要按数据敏感级别判断。
```

规则：

```text
Low Sensitivity：
- tab title
- tab URL
- window id
- tab group name
=> 默认允许进入 LLM 上下文

Sensitive：
- page readable text
- selected text
- bookmarks
- history
- downloads
- clipboard
=> 远程 Provider 发送前必须显式确认

Critical：
- cookies
- auth headers
- tokens
- identity data
- password-like fields
=> 默认禁止发送远程 Provider
=> 只有 Expert Mode + 明确确认才允许
```

同时增加：

```text
Local Provider Trust Mode：
- 当 Provider 被用户标记为本地可信模型时
- 可放宽 Sensitive 数据发送限制
- Critical 数据仍需要强确认
```

这和你的产品目标一致：扩展本身是 Agent，能控制完整浏览器能力，但不把“能读取”直接等同于“能外发”。

---

### 问题 19：如何判断一个 LLM Provider 是“本地可信 Provider”？

你选择了 **C + D**，所以必须定义 Local Provider Trust Mode 的启用标准。

可选方案：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. 自动判断 localhost | `localhost`、`127.0.0.1`、局域网 IP 自动视为本地可信 |
| B. 用户手动标记 | Provider 配置里有 `Trust as local provider` 开关 |
| C. 自动判断 + 用户确认 | 检测到本地地址时提示用户是否标记为本地可信 |
| D. 不判断地址，只看用户配置 | 即使是 localhost，也必须用户手动开启 |

我的推荐答案：**D。**

原因：  
“本地地址”不等于安全。`localhost` 可能是代理、转发、网关，也可能把数据继续发给远程模型。局域网 IP 更不能默认信任。因此不要用地址自动赋予更高隐私权限。

推荐 Provider 配置：

```ts
type LLMProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  model: string;

  providerType: "openai-compatible" | "ollama" | "llama-server" | "custom";

  trustLevel: "remote" | "local-trusted";
  allowSensitiveContext: boolean;
  allowCriticalContext: boolean;
};
```

推荐 UI：

```text
Provider Privacy Settings

Base URL:
http://127.0.0.1:8080/v1

Trust level:
( ) Remote / untrusted
( ) Local trusted provider

[ ] Allow sensitive browser data
[ ] Allow critical browser data
```

推荐规则：

```text
默认：
- 所有 Provider 都是 remote / untrusted

用户手动开启 local-trusted：
- Sensitive 数据可在任务中减少确认频率
- Critical 数据仍需每次确认
- UI 必须提示：本地服务可能继续转发数据，用户自行确认信任边界
```

我的推荐结论：

> **采用 D：不要自动信任 localhost。所有 Provider 默认视为远程/不可信；只有用户手动标记后，才进入 Local Provider Trust Mode。**

请确认问题 19：

**是否采用 D：本地可信 Provider 必须由用户手动标记，不根据 localhost / 局域网地址自动判断？**

---

## 用户

D

---

## ChatGPT

确认：问题 19 采用 **D：本地可信 Provider 必须由用户手动标记**。

当前 Provider 隐私规则：

```text
默认：
- 所有 LLM Provider 都视为 remote / untrusted
- 不因为 localhost / 127.0.0.1 / LAN IP 自动信任

用户手动开启：
- 才进入 Local Provider Trust Mode
- Sensitive 数据可放宽确认频率
- Critical 数据仍需强确认
```

---

### 问题 20：敏感数据发送确认是“每次确认”还是“按会话授权”？

你已经确定：

```text
Sensitive 数据发送给远程 Provider 前必须显式确认
Critical 数据默认禁止，Expert Mode + 明确确认才允许
Local Provider Trust Mode 可放宽 Sensitive 数据限制
```

现在要决定确认频率。

可选方案：

| 选项 | 策略 | 示例 |
|---|---|---|
| A. 每次发送都确认 | 每次发送页面正文、历史记录、书签都弹窗 |
| B. 当前任务内确认一次 | 用户说“总结当前页面”，本任务允许发送当前页面正文 |
| C. 当前会话内确认一次 | 本聊天会话中允许发送某类 Sensitive 数据 |
| D. 按 Provider + 数据类型持久授权 | 以后这个 Provider 都可以接收 page text / history 等数据 |

我的推荐答案：**B + 可选 C，不推荐 D。**

推荐规则：

```text
默认远程 Provider：
- Sensitive 数据：当前任务内确认一次
- Critical 数据：每次强确认
- 不做持久授权

Local Trusted Provider：
- Sensitive 数据：可以按当前会话授权
- Critical 数据：仍然每次强确认

Expert Mode：
- 可以开启更细的授权策略
- 但默认仍不持久授权 Critical 数据
```

推荐确认弹窗：

```text
Agent 需要把当前页面正文发送给模型：

Provider:
OpenAI-compatible - https://api.example.com

数据范围:
- 当前页面 URL
- 当前页面标题
- 当前页面正文，约 3,200 字

授权范围:
(•) 仅本次任务
( ) 当前会话内允许同类数据

[允许] [取消]
```

我的推荐结论：

> **采用 B + 可选 C：默认按当前任务授权；Local Trusted Provider 可允许当前会话授权；不默认提供长期持久授权。**

请确认问题 20：

**是否采用 B + 可选 C：Sensitive 数据默认按当前任务授权，Local Trusted Provider 可按当前会话授权，Critical 数据始终每次确认？**

---

## 用户

采用 B + 可选 C

---

## ChatGPT

确认：问题 20 采用 **B + 可选 C**。

当前敏感数据发送授权规则：

```text
Remote / Untrusted Provider:
- Sensitive 数据：默认按当前任务授权
- Critical 数据：每次强确认
- 不默认持久授权

Local Trusted Provider:
- Sensitive 数据：可选当前会话授权
- Critical 数据：仍然每次强确认
```

---

### 问题 21：聊天记录、操作日志、Tab 快照默认如何保存？

这是下一个依赖点。因为你的 Agent 会处理：

```text
用户对话
LLM 请求上下文
工具调用记录
高风险确认记录
Tab / Window / Session 快照
页面内容摘要
历史记录 / 书签 / 下载记录查询结果
```

这些数据有隐私风险，也关系到后续“记忆”和“恢复会话”。

可选方案：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. 默认不保存 | 刷新或关闭后尽量丢弃，只保留必要配置 |
| B. 本地保存 | 聊天、操作日志、快照都保存在浏览器本地 IndexedDB / storage |
| C. 本地保存 + 可选加密 | 默认本地保存，敏感内容可加密 |
| D. 本地保存 + 外部同步 | 支持同步到用户配置的外部服务 |
| E. 全部发送到后端 | 中心化账户系统保存所有上下文 |

我的推荐答案：**C，后续扩展 D。**

也就是：

> 默认所有数据只保存在浏览器本地。  
> 配置、会话、工具调用日志、确认记录、Tab 快照进入本地存储。  
> 敏感内容可选择不保存或加密保存。  
> 外部同步作为后续可选能力，不进入 MVP 核心路径。

推荐存储边界：

```text
保存：
- Provider 配置
- Agent 设置
- Expert Mode 设置
- 聊天记录
- 工具调用日志
- 用户确认记录
- Tab / Window / Session 快照
- 操作结果摘要

默认不保存或脱敏保存：
- 页面正文全文
- Cookie 内容
- 剪贴板内容
- 表单附近文本
- API Key 明文
- Critical 数据原文
```

推荐技术选择：

```text
chrome.storage.local / browser.storage.local:
- 设置项
- Provider 配置
- 权限开关
- UI 偏好

IndexedDB:
- 聊天记录
- Tool call 日志
- Tab 快照
- Session 快照
- 大文本摘要

WebCrypto:
- 可选加密敏感记录
- API Key 加密保存
```

推荐原则：

```text
默认 local-first
默认不云同步
默认不保存 Critical 原文
用户可以手动清空所有本地数据
后续再增加 export / import / 外部同步
```

我的推荐结论：

> **采用 C：本地优先保存 + 敏感内容可加密/可关闭保存。外部同步后置。**

请确认问题 21：

**是否采用 C：聊天记录、操作日志、Tab 快照默认本地保存，敏感内容支持加密或不保存，外部同步作为后续能力？**

---

## 用户

采用 C

---

## ChatGPT

确认：问题 21 采用 **C：聊天记录、操作日志、Tab 快照默认本地保存，敏感内容支持加密或不保存，外部同步作为后续能力**。

当前存储原则：

```text
Local-first
默认不云同步
默认不保存 Critical 原文
Sensitive 内容可加密或关闭保存
支持清空本地数据
后续再做 export / import / 外部同步
```

这也符合你当前产品定位：浏览器扩展本身是 Agent，具备完整浏览器 API 能力，但数据控制权优先留在用户本地。

---

### 问题 22：API Key 和敏感本地数据如何加密？

既然你选择本地保存 Provider 配置、聊天记录、操作日志和 Tab 快照，就必须明确加密策略，尤其是：

```text
LLM Provider API Key
页面正文摘要
历史记录查询结果
书签查询结果
下载记录查询结果
Cookie 相关操作日志
Critical 操作确认记录
```

可选方案：

| 选项 | 策略 | 说明 |
|---|---|---|
| A. 不做应用层加密 | 直接存在 `storage.local` / IndexedDB，依赖浏览器 Profile 保护 |
| B. 自动生成本地密钥加密 | 扩展生成密钥并本地保存，用 WebCrypto 加密敏感数据 |
| C. 用户主密码加密 | 用户设置 Master Password，用它派生密钥，加密 API Key 和敏感记录 |
| D. 分级策略 | 默认 API Key 用浏览器本地存储；Sensitive/Critical 数据可选择主密码加密；Critical 原文默认不保存 |

我的推荐答案：**D**。

原因：

1. **A 太弱。** 对 Power-user 产品来说，直接明文保存 API Key 和敏感浏览器数据不理想。
2. **B 安全收益有限。** 如果加密密钥也无条件保存在同一个扩展存储里，只是提高了一点静态读取门槛，不是真正强保护。
3. **C 安全强，但体验重。** 每次用扩展都要解锁，会影响 Agent 产品体验。
4. **D 最平衡。** 默认可用，同时给高敏感用户提供强保护。

推荐策略：

```text
默认：
- Provider API Key 存 storage.local
- 聊天记录和普通日志存 IndexedDB
- Critical 原文不保存
- Sensitive 原文默认不长期保存，只保存摘要或引用

可选开启 Secure Vault：
- 用户设置 Master Password
- 使用 WebCrypto + PBKDF2/Argon2 派生密钥
- 加密 API Key
- 加密 Sensitive 记录
- 加密导出的备份文件

始终禁止默认保存：
- Cookie 原文
- Token
- Password-like 字符串
- Authorization header
- 表单密码字段
```

推荐数据保存规则：

```text
Low Sensitivity：
- 默认保存原文

Sensitive：
- 默认保存摘要 / 元数据
- 用户可选择加密保存原文

Critical：
- 默认不保存原文
- Expert Mode + Secure Vault 才允许加密保存
```

我的推荐结论：

> **采用 D：分级加密策略。默认保证易用性；敏感数据支持 Secure Vault；Critical 原文默认不保存。**

请确认问题 22：

**是否采用 D：API Key 和敏感本地数据采用分级加密，Critical 原文默认不保存，Secure Vault 作为可选强保护模式？**

---

## 用户

A先不做加密

---

## ChatGPT

确认：问题 22 采用 **A：MVP 暂不做应用层加密**。

当前结论修正为：

```text
MVP：
- 不做 Secure Vault
- 不做 Master Password
- 不做 WebCrypto 加密
- API Key 暂存在 browser.storage.local / chrome.storage.local
- 聊天记录、操作日志、Tab 快照存 IndexedDB / storage.local
```

但这意味着要加强另一条规则：

> **不加密的前提下，Sensitive / Critical 原文不能随便长期保存。**

否则 Full Browser Agent + 全权限 + 无加密，会让本地数据风险过高。你的目标仍然是扩展内部 Agent 直接控制浏览器 API，而不是外部 MCP 控制器，所以本地数据边界要自己控制。

---

### 问题 23：在“不做加密”的前提下，哪些数据允许默认持久化？

可选方案：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. 全部默认保存 | 聊天、工具调用、页面正文、history、bookmarks、downloads、cookies 操作结果都保存 |
| B. 只保存低敏数据 + 操作摘要 | 保存聊天、Tab 快照、工具调用摘要；不保存 Sensitive / Critical 原文 |
| C. 用户可配置保存级别 | 默认 B，但用户可以在设置里开启保存 Sensitive 原文 |
| D. 默认无痕 | 只保存配置，不保存聊天和工具日志 |

我的推荐答案：**B，后续再扩展 C。**

推荐 MVP 保存规则：

```text
默认保存：
- Provider 配置
- Agent 设置
- Expert Mode 设置
- 聊天消息
- Tool call 名称、时间、状态
- Tab / Window / TabGroup 快照
- 用户确认记录摘要
- 操作结果摘要

默认不保存原文：
- 页面正文全文
- 浏览历史明细
- 书签全文导出
- 下载记录明细
- 剪贴板内容
- Cookie 内容
- Token / API Key / Authorization Header
- password-like 字符串
```

也就是说，日志可以记录：

```text
2026-05-16 10:32
Agent 执行 tabs.closeDuplicates
关闭 7 个重复标签页
用户已确认
```

但不要默认保存：

```text
7 个完整 URL + 页面正文 + Cookie + History 明细
```

我的推荐结论：

> **MVP 不做加密，因此默认只持久化低敏数据和操作摘要；Sensitive / Critical 原文默认不落盘。**

请确认问题 23：

**是否采用 B：默认只保存低敏数据和操作摘要，不保存 Sensitive / Critical 原文？**

---

## 用户

B

---

## ChatGPT

确认：问题 23 采用 **B：默认只保存低敏数据和操作摘要，不保存 Sensitive / Critical 原文**。

当前持久化策略：

```text
默认保存：
- Provider 配置
- Agent 设置
- Expert Mode 设置
- 聊天消息
- Tool call 名称、时间、状态
- Tab / Window / TabGroup 快照
- 用户确认记录摘要
- 操作结果摘要

默认不保存原文：
- 页面正文全文
- 浏览历史明细
- 书签全文导出
- 下载记录明细
- 剪贴板内容
- Cookie 内容
- Token / Authorization Header
- password-like 字符串
```

---

### 问题 24：LLM Provider API Key 是否允许默认持久化？

你刚才选择了 **MVP 不做加密**，同时又需要用户配置 OpenAI-compatible Provider。这里必须单独决策，因为 API Key 不属于普通低敏数据。

可选方案：

| 选项 | 策略 | 说明 |
|---|---|---|
| A. 默认持久化 API Key | 存在 `storage.local`，重启扩展后可继续使用 |
| B. 默认不持久化 API Key | 用户每次会话手动输入，或只保存在内存 |
| C. 用户可选 | 默认提醒风险，用户选择“保存”或“仅本次会话” |
| D. 只保存本地 Provider，不保存远程 Provider Key | 本地模型无需 Key 或弱 Key，远程 Key 不落盘 |

我的推荐答案：**C。**

原因：  
你选择了 Power-user / Full Browser Agent 路线，完全不保存 API Key 会让体验很差；但在不做加密的 MVP 里默认静默保存也不够谨慎。

推荐策略：

```text
Provider API Key 输入时提供两个选项：

( ) 仅本次会话使用，不持久化
( ) 保存到本地浏览器配置

提示：
MVP 当前不做应用层加密，保存后 API Key 将存储在浏览器扩展本地存储中。
```

推荐默认选择：

```text
默认勾选：仅本次会话使用
用户主动选择后才持久化
```

推荐结论：

> **采用 C：API Key 是否持久化由用户选择；默认仅本次会话，不加密保存必须明确提示。**

请确认问题 24：

**是否采用 C：Provider API Key 默认不持久化，用户主动选择后才保存到本地？**

---

## 用户

A

---

## ChatGPT

确认：问题 24 采用 **A：Provider API Key 默认持久化**。

当前规则修正为：

```text
MVP：
- API Key 默认保存到 browser.storage.local / chrome.storage.local
- 不做应用层加密
- UI 中明确提示：当前版本 API Key 会保存在浏览器扩展本地存储中
- 后续版本再考虑 Secure Vault / Master Password / WebCrypto
```

这和你的产品定位一致：**Power-user / Developer-first Full Browser Agent**，优先可用性和能力完整性，而不是普通用户扩展的最小风险策略。整体目标仍是浏览器扩展自身作为 Agent，直接控制浏览器提供的 API。

---

### 问题 25：LLM Provider 配置是单 Provider，还是多 Provider Profile？

你现在选择了：

```text
扩展内 Agent Runtime
可配置 LLM Provider
API Key 默认持久化
Local Provider Trust Mode 需要手动标记
```

所以要决定 Provider 配置模型。

可选方案：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. 只支持一个 Provider | 设置页只有一个 baseUrl / apiKey / model |
| B. 支持多个 Provider Profile，但只有一个默认 Provider | 用户可配置多个，当前会话使用默认 Provider |
| C. 支持多个 Provider Profile + 会话级切换 | 默认一个 Provider，但每个聊天会话可以手动切换 |
| D. 支持自动路由 | 根据任务类型、敏感等级、成本、模型能力自动选择 Provider |

我的推荐答案：**C**。

推荐原因：

1. 你需要同时支持远程模型和本地模型。
2. `Local Trusted Provider` 是 Provider 维度的配置，天然需要多 Profile。
3. Full Browser Agent 会有不同任务：普通 Tab 整理、页面总结、历史分析、代码页面阅读、敏感数据处理，用户可能想切不同模型。
4. 自动路由不适合 MVP，容易不可控。

推荐 Provider Profile 结构：

```ts
type LLMProviderProfile = {
  id: string;
  name: string;

  providerType: "openai-compatible" | "ollama" | "llama-server" | "custom";

  baseUrl: string;
  apiKey?: string;
  model: string;

  trustLevel: "remote" | "local-trusted";

  isDefault: boolean;
  enabled: boolean;
};
```

推荐 UI：

```text
Provider Profiles

[Default] OpenRouter - qwen/qwen3
[Local Trusted] llama-server - qwen3-4b
[Remote] OpenAI-compatible - gpt-4.1

当前会话使用：
[ OpenRouter - qwen/qwen3 ▼ ]
```

推荐结论：

> **采用 C：支持多个 Provider Profile，一个全局默认 Provider；每个聊天会话可以手动切换 Provider。暂不做自动路由。**

请确认问题 25：

**是否采用 C：多 Provider Profile + 全局默认 Provider + 会话级手动切换？**

---

## 用户

B

---

## ChatGPT

确认：问题 25 采用 **B：支持多个 Provider Profile，但只有一个默认 Provider**。

当前 Provider 规则：

```text
支持多个 Provider Profile
- OpenAI-compatible
- Ollama
- llama-server
- custom endpoint

但运行时只使用一个全局默认 Provider
不做会话级切换
不做自动路由
```

也就是说：

```text
Settings 里选择默认 Provider
    ↓
所有 Agent 会话统一使用这个 Provider
    ↓
用户要换模型，需要去设置页切换默认 Provider
```

---

### 问题 26：聊天会话模型是单会话，还是多会话？

现在你的扩展有独立聊天页面，并且会本地保存聊天记录、工具调用日志、Tab 快照和操作摘要。下一步要确定聊天数据模型。

可选方案：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. 单一长期会话 | 整个扩展只有一个聊天历史 |
| B. 多聊天会话 | 类似 ChatGPT，可以新建、切换、删除会话 |
| C. 按浏览器工作区自动建会话 | 每个窗口 / Tab Group / Session Snapshot 对应一个会话 |
| D. 无持久会话 | 只保留当前页面运行时对话，关闭即丢弃 |

我的推荐答案：**B。**

原因：

1. 你做的是 **Full Browser Agent**，任务类型会很杂：整理 Tab、查历史、读页面、管理书签、下载记录、Cookie、Expert API 等，单会话很快污染上下文。
2. 多会话更适合本地保存聊天记录和操作日志。
3. C 很有吸引力，但 MVP 会复杂；窗口和 Tab 本身是动态变化的，不适合作为第一版会话主键。
4. D 不符合你已经选择的本地保存策略。

推荐数据模型：

```ts
type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  providerProfileId: string; // 使用当前默认 Provider 创建时写入
  archived: boolean;
};

type ChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
};
```

推荐行为：

```text
默认打开最近一个会话
支持新建会话
支持删除会话
支持重命名会话
支持清空所有本地聊天记录
暂不做会话级 Provider 切换
```

请确认问题 26：

**是否采用 B：支持多聊天会话，但 Provider 仍使用全局默认 Provider，不做会话级模型切换？**

---

## 用户

B

---

## ChatGPT

确认：问题 26 采用 **B：支持多聊天会话**。

当前聊天模型：

```text
支持：
- 新建会话
- 切换会话
- 删除会话
- 重命名会话
- 本地保存聊天记录
- 每个会话保存自己的消息、工具调用摘要、操作日志

不支持：
- 会话级 Provider 切换
- 自动模型路由
- 按窗口 / Tab Group 自动绑定会话
```

---

### 问题 27：每次请求 LLM 时，应该带入多少上下文？

多会话确定后，下一个关键问题是 **上下文注入策略**。  
Full Browser Agent 不能简单把所有聊天记录、Tab 快照、History、Bookmarks、Page Content 全部塞给模型，否则会有：

```text
上下文爆炸
隐私风险
成本上升
模型注意力污染
敏感数据误发送
```

可选方案：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. 全量会话上下文 | 每次都带完整聊天历史 |
| B. 滑动窗口 | 只带最近 N 条消息 |
| C. 摘要 + 滑动窗口 | 老消息压缩成摘要，最近消息原文带入 |
| D. 任务上下文优先 | 只带当前任务相关上下文，必要时再读取浏览器数据 |
| E. C + D 混合 | 会话摘要 + 最近消息 + 当前任务所需浏览器上下文 |

我的推荐答案：**E。**

推荐规则：

```text
每次 LLM 请求默认包含：
1. system prompt
2. Tool Registry 生成的工具说明
3. 当前会话摘要
4. 最近 N 条消息
5. 当前任务必要的低敏浏览器上下文
```

默认不自动包含：

```text
页面正文全文
完整浏览历史
完整书签树
完整下载记录
Cookie
剪贴板内容
旧 Tab 快照全文
```

需要时再由工具读取，并走数据分级确认：

```text
用户：总结当前页面
    ↓
Agent 请求 page.getReadableText
    ↓
如果要发送给远程 Provider
    ↓
Sensitive 数据确认
    ↓
再进入 LLM 上下文
```

推荐结论：

> **采用 E：会话摘要 + 最近消息 + 当前任务上下文。浏览器数据按需读取，不默认全量注入。**

请确认问题 27：

**是否采用 E：LLM 上下文使用“会话摘要 + 滑动窗口 + 按需浏览器上下文”的混合策略？**

---

## 用户

采用E

---

## ChatGPT

确认：问题 27 采用 **E：会话摘要 + 滑动窗口 + 按需浏览器上下文**。

当前上下文策略：

```text
每次 LLM 请求包含：
- system prompt
- Tool Registry 生成的工具说明
- 当前会话摘要
- 最近 N 条消息
- 当前任务必要的低敏浏览器上下文

不默认包含：
- 页面正文全文
- 完整浏览历史
- 完整书签树
- 完整下载记录
- Cookie
- 剪贴板内容
- 旧 Tab 快照全文
```

---

### 问题 28：会话摘要由谁生成，什么时候生成？

既然你选择了“会话摘要 + 滑动窗口”，下一步必须决定摘要机制。

可选方案：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. 不主动摘要，只保留最近 N 条 | 简单，但长会话会丢失长期上下文 |
| B. 每次请求后都重新摘要 | 上下文稳定，但成本高、延迟高 |
| C. 超过阈值后异步摘要 | 消息数或 token 数超过阈值后生成摘要 |
| D. 用户手动点击“压缩会话” | 可控，但体验不连续 |
| E. 规则摘要 + LLM 摘要混合 | 操作日志用规则压缩，对话语义用 LLM 压缩 |

我的推荐答案：**E，MVP 可以先做 C。**

更具体：

> MVP 阶段先采用 **阈值触发的 LLM 摘要**。  
> 后续升级为 **规则摘要 + LLM 摘要混合**。

推荐 MVP 规则：

```text
当会话超过以下任一条件时触发摘要：
- 消息数量 > 30
- 最近上下文估算 token > 12k
- 工具调用记录 > 50 条
```

摘要内容包含：

```text
SessionSummary
├── 用户长期目标
├── 当前任务状态
├── 已确认的设计决策
├── 最近完成的浏览器操作
├── 已拒绝/取消的操作
├── 当前打开的关键上下文引用
└── 隐私授权状态摘要
```

不应该把 Sensitive / Critical 原文写入摘要：

```text
不要保存：
- 页面正文全文
- Cookie 内容
- 历史记录完整明细
- 下载记录完整明细
- 剪贴板内容
- Token / API Key
```

推荐数据结构：

```ts
type SessionSummary = {
  sessionId: string;
  version: number;
  summary: string;
  updatedAt: number;

  decisions: Array<{
    topic: string;
    decision: string;
    timestamp: number;
  }>;

  activeTasks: Array<{
    title: string;
    status: "pending" | "in_progress" | "blocked" | "done";
    notes?: string;
  }>;

  privacyNotes: Array<{
    dataType: string;
    authorizationScope: "none" | "task" | "session";
    providerId?: string;
  }>;
};
```

推荐结论：

> **采用 E 的长期方向，但 MVP 先实现 C：超过阈值后生成 LLM 会话摘要；工具调用和隐私授权只保存摘要，不保存敏感原文。**

请确认问题 28：

**是否采用：MVP 用阈值触发的 LLM 会话摘要，后续升级为规则摘要 + LLM 摘要混合？**

---

## 用户

采用

---

## ChatGPT

确认：问题 28 采用：

> **MVP 使用阈值触发的 LLM 会话摘要；后续升级为规则摘要 + LLM 摘要混合。**

当前上下文策略完整版本：

```text
LLM 请求上下文 =
system prompt
+ Tool Registry 工具说明
+ 当前会话摘要
+ 最近 N 条消息
+ 当前任务必要的低敏浏览器上下文
```

摘要策略：

```text
MVP：
- 消息数 / token 数 / 工具调用数超过阈值后触发 LLM 摘要
- 摘要保存到本地
- 不写入 Sensitive / Critical 原文

后续：
- 对话语义用 LLM 摘要
- 工具调用、操作日志、确认记录用规则压缩
```

---

### 问题 29：Agent 是否需要自动感知浏览器状态变化？

你的产品是 **Full Browser Agent**，不是单次命令工具。这里要决定它是否主动监听浏览器事件。

可选方案：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. 不主动监听 | 只有用户发消息时才读取浏览器状态 |
| B. 只监听低敏状态 | 监听 tabs/windows/tabGroups 变化，用于更新 UI 和快照 |
| C. 全量监听 | tabs、history、downloads、bookmarks、cookies 等变化都监听 |
| D. 可配置监听 | 默认只监听低敏状态，用户可启用更多事件监听 |

我的推荐答案：**D，MVP 默认按 B 实现。**

也就是：

> 默认监听低敏浏览器工作区状态：tabs、windows、tabGroups。  
> 不默认监听 history、downloads、bookmarks、cookies。  
> 用户可以在设置里开启更多监听模块。

推荐默认监听：

```text
默认开启：
- tabs.onCreated
- tabs.onUpdated
- tabs.onRemoved
- tabs.onActivated
- tabs.onMoved
- windows.onCreated
- windows.onRemoved
- windows.onFocusChanged
- tabGroups.onCreated
- tabGroups.onUpdated
- tabGroups.onRemoved
```

默认不开启：

```text
默认关闭：
- history changes
- downloads changes
- bookmarks changes
- cookies changes
- webRequest
- debugger
```

推荐原因：

1. Tab / Window / Group 状态是 Agent 的基本工作区上下文。
2. History / Downloads / Cookies 属于更敏感数据，不应该默认持续监听。
3. 你已经选择本地保存摘要和快照，但不保存敏感原文，因此默认监听范围要克制。
4. 后续可以把监听模块也注册进 Tool Registry / Capability Registry。

推荐结论：

> **采用 D：浏览器状态监听可配置。MVP 默认只监听低敏工作区状态，敏感事件监听必须手动开启。**

请确认问题 29：

**是否采用 D：默认监听 tabs/windows/tabGroups，其他敏感事件监听按模块手动开启？**

---

## 用户

D

---

## ChatGPT

确认：问题 29 采用 **D：默认监听 tabs / windows / tabGroups，其他敏感事件监听按模块手动开启**。

当前监听策略：

```text
默认监听：
- tabs
- windows
- tabGroups

默认不监听：
- history
- downloads
- bookmarks
- cookies
- webRequest
- debugger

可选开启：
- bookmarks watcher
- history watcher
- downloads watcher
- cookies watcher
- expert event watcher
```

---

### 问题 30：Agent 监听到浏览器状态变化后，是否允许自动执行动作？

现在你决定要监听浏览器状态变化。下一步必须明确：监听只是为了更新上下文，还是可以触发自动行为。

可选方案：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. 只更新状态，不自动行动 | 监听事件只用于刷新 UI、更新快照、辅助后续对话 |
| B. 允许低风险自动行动 | 例如自动更新 Tab 快照、自动生成分组建议，但不修改浏览器 |
| C. 允许规则驱动自动行动 | 用户配置规则后，自动分组、自动静音、自动归档等 |
| D. 允许 Agent 自主行动 | Agent 根据上下文判断并主动整理浏览器 |

我的推荐答案：**B，后续扩展 C，不做 D。**

推荐规则：

```text
MVP：
- 监听事件只更新工作区状态
- 可以自动生成建议
- 可以自动保存低敏快照
- 不自动关闭、移动、分组、删除、读取敏感数据

后续：
- 引入用户明确配置的自动化规则
- 例如：GitHub 页面自动进入 Dev 分组
- 例如：YouTube 页面自动静音
- 例如：超过 N 天未访问的 Tab 提醒关闭

不推荐：
- Agent 未经用户配置就自主修改浏览器状态
```

推荐原因：

1. 你已经给扩展安装时全权限，自动行动必须克制。
2. Full Browser Agent 能力很大，不能让模型在后台自由操作。
3. “建议”比“自动执行”更适合作为 MVP。
4. 规则驱动自动化可以后续做，但必须由用户显式创建。

推荐结论：

> **采用 B：监听事件后只允许低风险自动更新和建议生成，不允许 Agent 自主修改浏览器状态。自动执行能力后续通过用户配置规则实现。**

请确认问题 30：

**是否采用 B：MVP 中监听只用于状态更新、快照和建议，不自动修改浏览器状态？**

---

## 用户

B

---

## ChatGPT

确认：问题 30 采用 **B：MVP 中监听只用于状态更新、快照和建议，不自动修改浏览器状态**。

当前规则：

```text
监听浏览器状态变化后：
- 可以更新 UI
- 可以刷新当前工作区状态
- 可以保存低敏快照
- 可以生成整理建议
- 不自动关闭 Tab
- 不自动移动 Tab
- 不自动分组
- 不自动读取敏感数据
- 不自动修改书签 / 历史 / 下载 / Cookie
```

这仍然符合当前总目标：扩展本身是浏览器 Agent，但执行权必须由用户触发或确认，而不是让后台 Agent 自主行动。

---

### 问题 31：Workspace 状态应该怎么保存？

你已经决定默认监听：

```text
tabs
windows
tabGroups
```

现在要决定这些状态如何落地。

可选方案：

| 选项 | 策略 | 含义 |
|---|---|---|
| A. 只放内存 | 页面刷新或扩展重启后丢失 |
| B. 只保存最新状态 | 本地只保留当前 tabs/windows/tabGroups 的最新快照 |
| C. 最新状态 + 手动快照 + 关键事件快照 | 既有当前状态，也能保存某个时刻的工作区 |
| D. 完整事件日志 | 记录所有 tab/window/group 变化，类似 event sourcing |

我的推荐答案：**C**。

推荐原因：

1. **B 不够用。** 只保存最新状态无法支持“恢复到昨天的工作区”“比较整理前后变化”。
2. **D 太重。** 完整事件日志会产生大量数据，也会增加隐私和清理压力。
3. **C 最适合 MVP。** 既支持当前 Agent 上下文，又支持用户主动保存浏览器工作区。

推荐规则：

```text
始终维护：
- latestWorkspaceState

用户主动触发时保存：
- manualSessionSnapshot

关键操作前自动保存：
- beforeCloseTabs
- beforeMergeWindows
- beforeBulkMoveTabs
- beforeBookmarkCleanup
```

推荐数据：

```ts
type WorkspaceState = {
  capturedAt: number;
  windows: WindowSnapshot[];
  tabs: TabSnapshot[];
  tabGroups: TabGroupSnapshot[];
};

type SessionSnapshot = {
  id: string;
  title: string;
  reason: "manual" | "before_high_risk_action" | "auto_periodic";
  createdAt: number;
  state: WorkspaceState;
};
```

推荐结论：

> **采用 C：本地保存最新 Workspace 状态，同时支持手动快照和高风险操作前快照；不做完整事件日志。**

请确认问题 31：

**是否采用 C：最新状态 + 手动快照 + 高风险操作前快照？**

---

## 用户

别搞复杂

---

## ChatGPT

可以，收敛复杂度。

问题 31 不做三类快照，改成最简单版本：

> **只保存最新 Workspace 状态。**

也就是：

```text
只维护 currentWorkspaceState

包含：
- windows
- tabs
- tabGroups

不做：
- 手动快照
- 高风险操作前快照
- 历史版本
- 完整事件日志
- 恢复到某个时间点
```

这符合 MVP：Agent 只需要知道“当前浏览器里有什么”，先不做工作区备份/恢复系统。

修正后的问题 31 结论：

> **采用 B：只保存最新状态。**

---

### 问题 32：Tab / Window / Group 状态更新方式怎么做？

有两个选择：

| 选项 | 方式 | 复杂度 |
|---|---|---|
| A. 事件增量更新 | 监听每个 tab 变化，然后精确更新本地状态 | 高 |
| B. 简单全量刷新 | 监听到变化后，重新读取一次全部 tabs/windows/groups | 低 |

我的推荐答案：**B。**

原因：MVP 不需要 event sourcing，也不需要精确增量状态机。浏览器 Tab 数量通常有限，全量刷新简单、可靠、好调试。

推荐规则：

```text
tabs/windows/tabGroups 有变化
    ↓
debounce 300~1000ms
    ↓
重新读取全部 workspace state
    ↓
覆盖 currentWorkspaceState
```

请确认问题 32：

**是否采用 B：监听到浏览器状态变化后，防抖并全量刷新当前 Workspace 状态？**

---

## 用户

B

---

## ChatGPT

确认：问题 32 采用 **B：监听到浏览器状态变化后，防抖并全量刷新当前 Workspace 状态**。

当前简化版：

```text
tabs/windows/tabGroups 发生变化
    ↓
debounce
    ↓
重新读取全部 tabs/windows/tabGroups
    ↓
覆盖 currentWorkspaceState
```

不做增量状态机，不做事件日志，不做历史快照。

---

### 问题 33：`currentWorkspaceState` 要不要持久化？

既然你要求“别搞复杂”，这里有两个选择：

| 选项 | 策略 | 说明 |
|---|---|---|
| A. 只放内存 | 扩展页面打开时读取一次，变化时刷新；关闭页面后丢弃 |
| B. 存一份最新状态到本地 | 每次刷新后写入 storage / IndexedDB，下次打开可快速显示 |

我的推荐答案：**A。**

原因：Workspace 状态本身可以随时从浏览器 API 重新读取，没有必要持久化。持久化反而会引入数据过期、清理、隐私和同步问题。

推荐规则：

```text
不持久化 currentWorkspaceState
打开聊天页时读取一次
监听变化后防抖全量刷新
需要给 LLM 上下文时读取当前内存状态
内存状态不存在就重新读取
```

也就是说：

```text
browser API = 事实来源
currentWorkspaceState = 内存缓存
```

请确认问题 33：

**是否采用 A：`currentWorkspaceState` 只作为内存缓存，不写入本地持久化？**

---

## 用户

A

---

## ChatGPT

确认：问题 33 采用 **A：`currentWorkspaceState` 只作为内存缓存，不写入本地持久化**。

当前状态模型：

```text
browser API = 事实来源
currentWorkspaceState = 内存缓存
聊天页打开时读取
浏览器状态变化后防抖刷新
关闭聊天页后丢弃
```

---

### 问题 34：Tool 执行放在哪里？

你现在已经决定：

```text
Agent Runtime 在扩展内部
独立聊天页面是主要交互入口
background 不依赖常驻
currentWorkspaceState 只放内存
```

所以要决定工具调用到底由谁执行。

可选方案：

| 选项 | 策略 | 说明 |
|---|---|---|
| A. 聊天页面直接执行 Tool | Agent Runtime、Guardrail、Tool Registry、BrowserAdapter 都在独立页面里 |
| B. background 执行 Tool | 聊天页面只发请求，background 统一调用浏览器 API |
| C. 混合 | 聊天页面负责 Agent/Guardrail，background 负责少量必须后台处理的 API |
| D. 全部通过 content script | 不适合，content script 权限和能力不足 |

我的推荐答案：**C，但 MVP 尽量接近 A。**

也就是：

> **Agent Runtime、Tool Registry、Guardrail、LLM 调用、确认弹窗都放在独立聊天页面。大部分 Tool 由聊天页面直接调用 BrowserAdapter 执行。只有确实需要后台事件监听、跨页面通信或 content script 桥接的能力，才走 background。**

推荐结构：

```text
Chat Page
├── Agent Runtime
├── LLM Provider Adapter
├── Tool Registry
├── Guardrail
├── Confirmation UI
├── BrowserAdapter
└── Most Tool Execution

Background
├── 状态变化事件监听
├── content script 消息转发
├── 少量必须后台处理的浏览器事件
└── 不保存 Agent 主状态
```

推荐原因：

1. 你已经明确“不搞复杂”，不要把所有工具都 RPC 到 background。
2. 独立聊天页面是长期打开的任务界面，适合承载 Agent 推理、streaming、确认弹窗和内存状态。
3. background 在 MV3 下不应该承载长会话状态。
4. 后续如果某些 API 必须后台执行，再局部迁移即可。

推荐结论：

> **采用 C：聊天页面为主执行环境，background 只做事件监听和必要桥接。**

请确认问题 34：

**是否采用 C：Tool 默认在聊天页面执行，background 只做必要桥接？**

---

## 用户

不要搞这种 看似给我选择其实没给我选择的推荐了，你妈的每个选项都应该简单明白直接，并分析每个选项的优缺点。别让我爆粗口

---

## ChatGPT

你说得对。前面的问题设计有问题：我把“推荐答案”写得太像唯一正确答案，选项也没有做到足够对等、清楚。

后面我按这个规则来：

```text
1. 每次只问一个问题
2. 每个选项都是真选项，不写成陪跑项
3. 每个选项都用简单话说明
4. 每个选项都分析优点、缺点、适合场景
5. 我的建议单独放最后，不压过你的选择
6. 你选了什么，就按你的选择继续，不反复绕回推荐路线
```

我们重新问 **问题 34**。

---

## 问题 34：工具调用到底在哪里执行？

这里说的“工具调用”包括：

```text
tabs 查询 / 关闭 / 分组
bookmarks 查询 / 修改
history 查询
downloads 查询
cookies 查询
page content 读取
scripting 注入
```

### 选项 A：全部在聊天页面执行

意思是：

```text
独立聊天页面
= Agent Runtime
= Tool Registry
= Guardrail
= Browser API 调用者
```

优点：

```text
简单
开发快
调试方便
Agent 状态和执行逻辑都在一个地方
不需要设计复杂的消息 RPC
```

缺点：

```text
聊天页面关闭后，Agent 执行环境就没了
某些需要后台监听的能力不好放这里
以后如果要做后台自动化，会受限制
页面、background、content script 的职责可能混在一起
```

适合：

```text
MVP
手动触发型 Agent
用户打开聊天页面后才执行操作
不追求后台长期运行
```

---

### 选项 B：全部在 background 执行

意思是：

```text
聊天页面只负责 UI
所有 Tool Call 都发给 background
background 统一执行浏览器 API
```

优点：

```text
职责清楚
所有浏览器 API 调用集中管理
更容易做权限控制、日志、拦截
聊天页面关闭后，部分能力仍可继续响应事件
```

缺点：

```text
实现更复杂
需要设计 UI ↔ background 消息协议
LLM streaming、确认弹窗、暂停继续执行会更麻烦
MV3 background 不是传统常驻进程，不能当稳定后端用
```

适合：

```text
更工程化的扩展
工具调用很多
需要统一审计
后续要做自动化规则或后台任务
```

---

### 选项 C：按能力拆分执行

意思是：

```text
聊天页面负责：
- Agent Runtime
- LLM 调用
- Guardrail
- 用户确认

background 负责：
- 浏览器事件监听
- 需要后台权限的工具
- 统一转发部分浏览器 API 调用

content script 负责：
- 读取页面正文
- 获取选中文本
- 页面内 DOM 操作
```

优点：

```text
结构最合理
符合浏览器扩展的天然分工
页面内容读取不会硬塞到 background
后台监听也不会硬塞到聊天页面
后续扩展空间大
```

缺点：

```text
比 A 复杂
需要定义 page ↔ background ↔ content script 的通信协议
调试成本更高
MVP 开发速度会慢一些
```

适合：

```text
Full Browser Agent
Chrome + Firefox 双浏览器
同时要做 tabs、page content、history、downloads、cookies 等多类能力
```

---

### 选项 D：全部通过 background 代理，但 Agent 仍在聊天页面

意思是：

```text
聊天页面：
- Agent Runtime
- LLM
- Guardrail
- 确认 UI

background：
- 所有 Browser API 的唯一执行入口

content script：
- 只接受 background 指令
```

优点：

```text
Agent 交互留在聊天页面，体验好
浏览器 API 执行集中在 background，边界清楚
比 C 更统一
日志、权限、审计更容易集中做
```

缺点：

```text
比 A 复杂很多
每个工具都要走消息协议
background 会变成核心执行总线
如果设计不好，background 会膨胀
```

适合：

```text
你想要强审计
你想把 Tool 执行层集中管理
你不介意多写一层 RPC
```

---

我的建议：**C 或 D 都合理**。

如果你想 **最快做出来**，选 **A**。  
如果你想 **架构长期清晰**，选 **C**。  
如果你想 **所有工具调用都可审计、可拦截、可统一记录**，选 **D**。

请直接选：

```text
A：全部在聊天页面执行
B：全部在 background 执行
C：按能力拆分执行
D：Agent 在聊天页，Browser API 全部通过 background 代理
```

---

## 用户

选C

---

## ChatGPT

确认：问题 34 选 **C：按能力拆分执行**。

当前职责划分：

```text
聊天页面：
- Agent Runtime
- LLM 调用
- Tool Registry
- Guardrail
- 用户确认 UI

background：
- 浏览器事件监听
- 需要后台处理的能力
- 部分 API 桥接

content script：
- 页面正文读取
- DOM 信息提取
- 选中文本读取
- 页面内操作
```

---

## 问题 35：不同执行环境之间怎么通信？

因为你选了 C，系统里至少有三个运行环境：

```text
chat page
background
content script
```

它们之间必须通信。现在要决定通信协议复杂度。

---

### 选项 A：每个功能自己写消息

比如：

```ts
sendMessage({ type: "GET_PAGE_TEXT" })
sendMessage({ type: "CLOSE_TABS" })
sendMessage({ type: "READ_SELECTION" })
```

优点：

```text
最简单
开发最快
不用先设计协议
适合功能很少的 Demo
```

缺点：

```text
功能多了会乱
消息类型会越来越多
错误处理不统一
调试困难
后面很难做审计和日志
```

适合：

```text
快速原型
只做几个工具
不打算长期扩展
```

---

### 选项 B：统一简单消息协议

所有通信都用一个统一结构：

```ts
{
  id: "msg_001",
  type: "tool.call",
  tool: "page.getReadableText",
  args: {},
  source: "chat",
  target: "content",
  timestamp: 123456789
}
```

返回：

```ts
{
  id: "msg_001",
  ok: true,
  result: {}
}
```

优点：

```text
仍然简单
消息格式统一
方便日志、调试、错误处理
适合 Tool Registry
后续可以扩展
```

缺点：

```text
比 A 多一点设计成本
需要写 message router
需要定义错误结构
```

适合：

```text
MVP
Full Browser Agent
工具数量会持续增加
但不想上来就搞复杂 RPC 框架
```

---

### 选项 C：使用 JSON-RPC 2.0

类似：

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "page.getReadableText",
  "params": {}
}
```

优点：

```text
协议标准
请求/响应/错误格式成熟
以后接 MCP 或外部服务更自然
工具调用语义清晰
```

缺点：

```text
对浏览器扩展内部通信来说偏重
需要处理更多协议细节
初期开发成本更高
```

适合：

```text
你确定未来要和外部协议打通
你希望内部工具调用协议标准化
你不介意增加工程复杂度
```

---

### 选项 D：事件总线 / PubSub

比如：

```text
chat 发出事件
background 订阅
content script 订阅
谁感兴趣谁处理
```

优点：

```text
适合状态同步
适合浏览器事件监听
适合多模块解耦
```

缺点：

```text
不适合强请求-响应工具调用
很容易不知道谁处理了消息
调试复杂
错误回传麻烦
```

适合：

```text
状态通知
workspace 更新
监听事件广播
不适合作为主要 Tool Call 协议
```

---

我的建议：**B**。

理由很简单：你现在要做的是 Full Browser Agent，但你又明确说“别搞复杂”。  
**B 比 A 稳，比 C 轻，比 D 更适合工具调用。**

请直接选：

```text
A：每个功能自己写消息
B：统一简单消息协议
C：JSON-RPC 2.0
D：事件总线 / PubSub
```

---

## 用户

C 有标准 JSON-RPC 2.0 为什么不用？傻？

---

## ChatGPT

你说得对。这里应该直接选 **C：JSON-RPC 2.0**。

我上一轮把“少一点复杂度”权重放太高了，但在你的项目里，JSON-RPC 2.0 明显更合适，因为你已经有这些前提：

```text
Full Browser Agent
Tool Registry
Internal ToolCall Schema
Guardrail
Preflight
chat page / background / content script 多环境通信
未来可能接 MCP / 外部工具协议
```

这种情况下继续自定义一套消息格式，反而是重复造轮子。

---

## 修正问题 35 结论

采用：

```text
C：JSON-RPC 2.0 作为扩展内部通信协议
```

也就是：

```text
chat page ↔ background
background ↔ content script
chat page ↔ content script
```

内部消息都尽量统一成 JSON-RPC 2.0 格式。

请求：

```json
{
  "jsonrpc": "2.0",
  "id": "req_001",
  "method": "page.getReadableText",
  "params": {
    "tabId": 123
  }
}
```

响应：

```json
{
  "jsonrpc": "2.0",
  "id": "req_001",
  "result": {
    "text": "..."
  }
}
```

错误：

```json
{
  "jsonrpc": "2.0",
  "id": "req_001",
  "error": {
    "code": -32001,
    "message": "Permission denied",
    "data": {
      "reason": "requires user confirmation"
    }
  }
}
```

通知事件：

```json
{
  "jsonrpc": "2.0",
  "method": "workspace.changed",
  "params": {
    "reason": "tabs.updated"
  }
}
```

---

## 为什么 JSON-RPC 2.0 更适合这里

### 1. Tool Call 天然就是 RPC

你的工具本质就是：

```text
method = 工具名
params = 工具参数
result = 工具结果
error = 工具错误
```

例如：

```text
tabs.closeDuplicates
bookmarks.search
history.search
downloads.list
page.getReadableText
cookies.get
```

这和 JSON-RPC 的模型完全吻合。

---

### 2. 错误结构标准化

浏览器扩展里错误会很多：

```text
权限不足
tab 不存在
content script 未注入
用户取消确认
preflight 失败
Provider 调用失败
工具参数非法
浏览器 API 不支持
```

用 JSON-RPC 可以统一错误返回，而不是每个功能自己造：

```json
{
  "code": -32010,
  "message": "User confirmation required",
  "data": {
    "confirmationId": "confirm_001",
    "riskLevel": "high",
    "affectedObjects": []
  }
}
```

---

### 3. 和 Tool Registry 对齐

Tool Registry 可以直接生成 JSON-RPC method 表：

```text
tabs.list
tabs.closeDuplicates
bookmarks.search
history.search
page.getReadableText
cookies.get
```

内部不需要再维护一套 `type: "GET_PAGE_TEXT"` 这种不成体系的消息名。

---

### 4. 未来接 MCP 更顺

MCP 本身也是 JSON-RPC 语义。你现在虽然不做 MCP Server，但以后如果要把某些能力暴露出去，内部协议和外部协议不会割裂。

---

### 5. 对多执行环境更清楚

你选了按能力拆分执行：

```text
chat page
background
content script
```

JSON-RPC 可以明确表达：

```text
谁调用
调用什么 method
参数是什么
返回什么
失败是什么
```

比散乱的 `sendMessage({ type })` 更稳。

---

## 最终决定

```text
问题 35：采用 JSON-RPC 2.0
```

当前通信模型：

```text
Chat Page
  ↓ JSON-RPC
Background
  ↓ JSON-RPC
Content Script
```

或者某些场景：

```text
Chat Page
  ↓ JSON-RPC
Content Script
```

但协议统一，不再自定义随意消息格式。

---

## 问题 36：JSON-RPC 2.0 跑在哪种浏览器通信通道上？

JSON-RPC 只是消息格式，还需要决定底层传输。

### 选项 A：`runtime.sendMessage`

一次请求，一次响应。

```text
chat page → background
background → response
```

优点：

```text
简单
适合短请求
适合普通工具调用
不用维护连接
```

缺点：

```text
不适合长任务
不适合 streaming
不适合持续事件推送
复杂任务中断恢复麻烦
```

适合：

```text
tabs.query
bookmarks.search
history.search
downloads.search
简单 page info 读取
```

---

### 选项 B：`runtime.connect` / `Port`

建立长连接，持续收发 JSON-RPC 消息。

```text
chat page ⇄ background Port
background ⇄ content script Port
```

优点：

```text
适合长任务
适合流式输出
适合事件通知
适合持续状态同步
更像真正 RPC channel
```

缺点：

```text
要管理连接生命周期
页面关闭后连接断开
content script 注入/销毁要处理
实现比 sendMessage 复杂
```

适合：

```text
LLM streaming 状态转发
长页面读取
批量工具执行
workspace.changed 通知
content script 长连接
```

---

### 选项 C：混合使用

```text
短请求：sendMessage
长任务 / 事件 / streaming：Port
```

优点：

```text
实用
复杂度适中
短任务简单处理
长任务也有通道
```

缺点：

```text
需要同时维护两种 transport
需要定义什么时候用 sendMessage，什么时候用 Port
```

适合：

```text
MVP 到长期演进都比较稳
```

---

### 选项 D：统一全部走 Port

所有 JSON-RPC 都跑在长连接上。

优点：

```text
协议最统一
请求、响应、通知、事件都走同一套通道
后续扩展更清楚
```

缺点：

```text
MVP 稍重
必须处理连接重连、断开、tab 切换、content script 生命周期
简单请求也要先有连接
```

适合：

```text
你想从第一版就把内部通信做成稳定 RPC 总线
```

我的建议：**C 或 D**。

如果你想先稳妥开发，选 **C**。  
如果你想内部协议一开始就干净统一，选 **D**。

请选择：

```text
A：全部 runtime.sendMessage
B：全部 runtime.connect / Port
C：短请求 sendMessage，长任务和事件用 Port
D：全部统一走 Port
```

---

## 用户

别默认我全懂 你要给我说每个选项是什么用来干什么的 有什么优点缺点 优先用markdown的表格格式输出

---

## ChatGPT

收到。后面我按这个格式来：

1. **先解释这个问题在解决什么**
2. **每个选项都说明“是什么 / 用来干什么”**
3. **用 Markdown 表格列出优点、缺点、适合场景**
4. **最后单独给我的推荐，不把推荐伪装成唯一正确答案**
5. **你选什么，就按你的选择继续**

---

## 问题 36：JSON-RPC 2.0 跑在哪种浏览器通信通道上？

你前面已经确定：

> 扩展内部通信协议采用 **JSON-RPC 2.0**。

现在要决定的是：  
**这些 JSON-RPC 消息通过浏览器扩展的哪种通信方式传输。**

浏览器扩展里常见有两类通信方式：

| 通信方式 | 简单理解 |
|---|---|
| `runtime.sendMessage` | 发一条消息，等一次回复，类似 HTTP 请求 |
| `runtime.connect` / `Port` | 建立一条长连接，可以持续来回发消息，类似 WebSocket |

---

## 选项对比

| 选项 | 方案 | 是什么 | 用来干什么 | 优点 | 缺点 | 适合场景 |
|---|---|---|---|---|---|---|
| A | 全部用 `runtime.sendMessage` | 每次调用都单独发一条消息，请求结束后通信结束 | 适合一次性短请求，比如查 tabs、查 bookmarks、读简单状态 | 最简单；实现快；不用维护连接；调试容易 | 不适合长任务；不适合持续事件；不适合 streaming；大量消息时管理混乱 | 快速 MVP、小工具、短请求为主 |
| B | 全部用 `runtime.connect` / `Port` | 页面和 background / content script 之间建立长连接，持续发送 JSON-RPC 消息 | 适合持续通信、事件推送、长任务、状态同步 | 协议统一；支持通知事件；适合长任务；后续扩展性好 | 要管理连接生命周期；页面关闭要断开；content script 重载要重连；实现复杂一些 | 想从一开始做成稳定内部 RPC 总线 |
| C | 短请求用 `sendMessage`，长任务/事件用 `Port` | 两种通道混合使用 | 简单工具走短连接，复杂任务和事件走长连接 | 实用；复杂度适中；短任务简单，长任务也能支持 | 需要维护两套 transport；要定义哪些走短连接、哪些走长连接 | 大多数浏览器扩展项目；MVP 到长期演进都能接受 |
| D | 全部统一走 `Port` | 所有 JSON-RPC 请求、响应、事件都走长连接 | 把扩展内部通信做成统一 RPC 通道 | 架构最统一；JSON-RPC 体验最好；事件通知天然支持；后续接复杂工具更顺 | MVP 稍重；必须处理断线、重连、tab 生命周期、content script 注入时机 | Full Browser Agent、复杂工具平台、长期架构优先 |

---

## 具体例子

### A：`sendMessage` 的感觉

适合这种：

```text
chat page → background：
“帮我查一下当前所有 tab”

background → chat page：
“这是 tab 列表”
```

它像这样：

```text
问一次，答一次，结束。
```

---

### B / D：`Port` 的感觉

适合这种：

```text
chat page 和 background 建立连接
background 持续推送：
- workspace.changed
- tab.updated
- tool.progress
- content.ready
```

它像这样：

```text
连接一直在，有消息就互相发。
```

---

### C：混合模式的感觉

例如：

```text
tabs.list                  → sendMessage
bookmarks.search           → sendMessage
page.getReadableText       → Port
workspace.changed event    → Port
long running tool progress → Port
```

它的问题是你要维护一张规则表：

```text
哪些 method 走 sendMessage
哪些 method 走 Port
```

---

## 我的推荐

我推荐：**D：全部统一走 Port**。

原因：

| 理由 | 说明 |
|---|---|
| 你是 Full Browser Agent | 工具数量会很多，统一通信更稳 |
| 你已经采用 JSON-RPC 2.0 | JSON-RPC 更适合跑在持续连接上 |
| 你有事件通知需求 | `workspace.changed` 这类事件用 Port 更自然 |
| 你有 content script 通信 | 页面正文读取、选中文本读取、DOM 操作都适合长连接或可管理通道 |
| 避免双 transport 复杂度 | C 看似折中，但后面容易变成“这个方法到底走哪条通道”的维护问题 |

但代价也明确：

```text
D 会比 A / C 多一些连接管理代码。
```

如果你现在优先“能快速跑起来”，选 **C**。  
如果你优先“长期架构干净”，选 **D**。

---

请选择：

| 选项 | 含义 |
|---|---|
| A | 全部 `runtime.sendMessage` |
| B | 全部 `runtime.connect` / `Port` |
| C | 短请求 `sendMessage`，长任务和事件用 `Port` |
| D | 全部统一走 `Port` |

---

## 用户

扩展mv3格式 长时间运行后台是什么原理

---

## ChatGPT

我先把 MV3 的“后台不能常驻”和“看起来像长时间运行”的区别讲清楚。这里会影响你刚才在 `sendMessage` / `Port` 之间怎么选。

---

## ChatGPT

MV3 里所谓“长时间运行后台”，核心不是 **background 真常驻**，而是：

> **后台按事件唤醒，处理完就可能休眠；长任务要靠事件、消息、Port、WebSocket、Native Messaging、alarms、extension page 等机制拆开处理。**

Chrome 官方明确说，MV3 用 **extension service worker** 替代 background page，是为了让扩展“只在需要时运行”。它不是传统常驻后台。([Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers))

---

## 1. MV3 background 的真实模型

| 概念 | MV2 传统理解 | MV3 Chrome 真实情况 |
|---|---|---|
| background | 像一个后台页面，可以长期活着 | 变成 `service_worker`，事件驱动 |
| 内存变量 | 可以长期放在 background 里 | 不能依赖，worker 休眠后会丢 |
| 定时器 | 可以长期跑 | worker 休眠后 timer 可能中断 |
| 长连接 | 可以自然维持 | 需要特殊机制，不保证普通后台常驻 |
| 状态保存 | 可放内存 | 必须持久化到 `storage` / IndexedDB |

Chrome 的 service worker 通常会在这些情况下被终止：**30 秒无活动**、单个请求或事件处理超过 **5 分钟**、`fetch()` 响应超过 **30 秒**。事件或扩展 API 调用会重置计时器；如果 worker 休眠，新的事件可以重新唤醒它。([Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle))

所以 MV3 的正确心智模型是：

```text
不是：
background 一直跑

而是：
事件来了 → 唤醒 service worker → 处理任务 → 保存状态 → 空闲后休眠
```

---

## 2. “长时间运行”通常有几种实现方式

| 方式 | 是什么 | 用来干什么 | 优点 | 缺点 |
|---|---|---|---|---|
| 事件唤醒 | 监听 `tabs.onUpdated`、`runtime.onMessage`、`alarms.onAlarm` 等事件 | 浏览器发生事件时启动后台逻辑 | 符合 MV3 设计；稳定；省资源 | 不能主动一直运行 |
| 持久化状态 | 把状态写入 `chrome.storage` / IndexedDB | worker 被杀后，下次恢复状态 | 必须做；最可靠 | 不能依赖内存，需要设计状态恢复 |
| `runtime.connect` / `Port` | extension page、content script、background 之间建立长连接 | JSON-RPC、事件推送、工具调用通道 | 适合你的内部 RPC | 不能简单等同于“让 background 永远活着” |
| 发送 Port 消息 | 长连接中持续收发消息 | worker 正在处理通信时延长生命周期 | 适合活跃通信 | Chrome 114 后“只打开 Port”不再重置计时器，发送消息才有意义 |
| WebSocket | service worker 里维护 WebSocket | 和外部服务通信 | Chrome 116 起，WebSocket 收发消息会延长 service worker 生命周期 | 仍不应设计成永久后台 |
| Native Messaging | 连接本地进程 | 与本地程序通信 | Chrome 文档说明 `connectNative()` 可保持 service worker alive | 需要本地 host，安装复杂 |
| Alarms | `chrome.alarms` 定时触发 | 周期性任务、状态刷新 | MV3 推荐替代长期 timer | 粒度有限，不适合实时任务 |
| Offscreen Document | 隐藏的扩展页面 | 需要 DOM、clipboard、canvas、audio 等能力 | 能处理 service worker 做不了的 DOM 工作 | 不是万能常驻后台，不应该滥用 |
| 独立扩展页面 | 你的聊天页面、side panel、options page | 承载 Agent Runtime / UI / streaming | 页面打开期间可以长时间运行 | 页面关闭后就没了 |

Chrome 文档还特别说明：Chrome 不计划支持 persistent service worker；MV3 的核心就是 ephemeral/event-driven model。([Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/migrate/known-issues))

---

## 3. Port 到底能不能让 background 长时间运行？

结论：

> **Port 是长连接通信通道，不是可靠的“后台常驻锁”。**

Chrome 114 之后，**打开 Port 本身不再重置 service worker 计时器**；但通过 long-lived messaging 发送消息会让 service worker 生命周期延长。([Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle))

所以：

```text
错误理解：
只要 runtime.connect()，background 就一直活着

正确理解：
Port 可以作为 JSON-RPC 通道；
有消息交互时可以唤醒/延长 background；
但不能把 background 当常驻进程设计。
```

对于你这个 Browser Agent 扩展，Port 适合做：

```text
chat page ⇄ background
background ⇄ content script

传输：
- JSON-RPC request
- JSON-RPC response
- workspace.changed notification
- tool.progress notification
- content script ready/closed notification
```

但不适合做：

```text
靠 Port 强行让 background 永远运行
```

---

## 4. Firefox 和 Chrome 还不一样

你要求 Chrome + Firefox 双浏览器。这里更要小心。

Chrome MV3 只支持 `background.service_worker`。MDN 说明 Firefox 目前不支持 `background.service_worker`，而是使用 `background.scripts` 或 `background.page` 这类 background script/page 机制；Chrome 和 Firefox 在 MV3 background 字段上的支持并不一致。([MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background))

MDN 还说明，MV3 中 background scripts/page 是 **non-persistent**，也就是按需加载、空闲卸载，而不是 MV2 那种稳定常驻模型。([MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts))

所以跨浏览器设计时，不要抽象成：

```text
Background = 一个稳定长期运行的本地服务
```

应该抽象成：

```text
Background = 事件路由器 + Browser API 代理 + 状态恢复入口
```

---

## 5. 对你这个项目的正确架构含义

你现在做的是浏览器扩展内置 Agent。结合 MV3 原理，我建议这样理解：

| 模块 | 是否适合长时间运行 | 原因 |
|---|---:|---|
| Chat Page / 独立页面 | 适合 | 用户打开后可承载 Agent Runtime、LLM streaming、确认弹窗 |
| Background | 不适合作为 Agent 主进程 | MV3 会休眠，不能依赖内存和 timer |
| Content Script | 不适合作为主进程 | 生命周期绑定页面/tab |
| Storage / IndexedDB | 适合作为状态事实来源 | worker 休眠后可以恢复 |
| Port JSON-RPC | 适合作为通信通道 | 不是常驻保证，但适合内部 RPC |

所以你的架构应该是：

```text
Chat Page
- Agent Runtime
- LLM Provider
- Tool Registry
- Guardrail
- 用户确认
- JSON-RPC Client

Background
- JSON-RPC Router
- tabs/windows/bookmarks/history/downloads/cookies 等 API 代理
- 浏览器事件监听
- 不保存关键内存状态

Content Script
- 页面正文读取
- 选中文本读取
- DOM 提取
- 页面内操作

Storage / IndexedDB
- Provider 配置
- 聊天记录
- 工具调用摘要
- 用户设置
```

---

## 6. 最关键的一句话

> **MV3 没有真正意义上的“长期运行 background”。所谓长时间运行，是通过事件唤醒、消息交互延长生命周期、状态持久化、extension page 承载长任务来实现的。**

对你这个 Full Browser Agent 来说：

> **Agent 主体应该放在独立聊天页面；background 只做事件监听和 API 代理；所有长期状态必须落 storage / IndexedDB，不要依赖 background 内存。**

---

## 用户

继续

---

## ChatGPT

继续。

---

## 问题 37：Agent 的工具（Tool）是静态注册还是动态发现？

你已经确定：

```text
Tool Registry
JSON-RPC 2.0
Full Browser Agent
Chrome + Firefox
```

接下来要决定 Tool Registry 怎么工作。

例如未来工具可能越来越多：

```text
tabs.list
tabs.close
tabs.group

bookmarks.search
bookmarks.create

history.search

downloads.search

page.getReadableText

cookies.get

proxy.set

...
```

---

| 选项 | 是什么 | 优点 | 缺点 | 适合场景 |
|--------|--------|--------|--------|--------|
| A. 静态注册 | 所有 Tool 在代码里写死注册 | 最简单；类型安全；容易调试 | 新增 Tool 需要改代码 | MVP |
| B. 启动时自动扫描注册 | 启动时扫描 Tool 目录自动注册 | Tool 增加方便 | 增加框架复杂度 | 中大型项目 |
| C. Capability 动态注册 | BrowserAdapter 根据浏览器能力动态注册 Tool | Chrome/Firefox 差异处理优雅 | 实现复杂 | 双浏览器支持 |
| D. Plugin 插件机制 | 第三方扩展 Tool | 扩展性最强 | MVP 复杂度爆炸 | 后期生态 |

---

### A：静态注册

例如：

```ts
registry.register(new TabsListTool());
registry.register(new TabsCloseTool());
registry.register(new BookmarkSearchTool());
```

特点：

```text
Tool Registry 就是一张表
```

优点：

```text
最容易实现
类型提示最好
调试最简单
```

缺点：

```text
新增 Tool 要改代码
```

---

### B：自动扫描

例如：

```text
tools/
├── tabs/
├── bookmarks/
├── history/
```

启动时：

```ts
scanTools();
```

自动注册。

优点：

```text
新增 Tool 不用改 Registry
```

缺点：

```text
调试稍复杂
```

---

### C：Capability 注册

例如：

Chrome：

```text
tabs.*
downloads.*
cookies.*
sidePanel.*
```

Firefox：

```text
tabs.*
downloads.*
cookies.*
没有 sidePanel
```

启动时：

```ts
if (browser.sidePanel) {
    registerSidePanelTools();
}
```

优点：

```text
双浏览器支持优雅
```

缺点：

```text
Registry 会复杂不少
```

---

### D：插件系统

例如：

```text
用户安装：
GitHub Tool Pack
Jira Tool Pack
Notion Tool Pack
```

自动向 Agent 注入工具。

优点：

```text
未来天花板最高
```

缺点：

```text
现在完全没必要
```

---

## 我的建议

对于你当前阶段：

```text
先做 A
```

原因很简单：

你现在连 Tool Schema 都还没最终定下来。

过早做：

```text
动态发现
插件系统
Capability Framework
```

大概率是在造框架。

等工具数量超过：

```text
30~50个
```

再考虑升级。

---

请选择：

| 选项 | 含义 |
|--------|--------|
| A | Tool 静态注册 |
| B | 启动时自动扫描注册 |
| C | 按浏览器能力动态注册 |
| D | 插件化 Tool 系统 |

---

## 用户

按浏览器能力动态注册

---

## ChatGPT

确认：问题 37 选择 **C：按浏览器能力动态注册（Capability-based Registration）**。

这是一个比较重要的架构决策，因为你一开始就要求：

```text id="d6ql6d"
Chrome
Firefox
双浏览器支持
```

所以 Registry 不应该是：

```text id="2u5fdr"
BrowserAgent
  └── 注册所有 Tool
```

而应该是：

```text id="0h87ef"
Capability Detector
        ↓
Capability Registry
        ↓
Tool Registry
```

例如：

| Capability | Chrome | Firefox | 注册的 Tool |
|------------|---------|---------|---------|
| tabs | ✅ | ✅ | tabs.* |
| bookmarks | ✅ | ✅ | bookmarks.* |
| downloads | ✅ | ✅ | downloads.* |
| cookies | ✅ | ✅ | cookies.* |
| tabGroups | ✅ | ⚠️ 差异较大 | tabGroups.* |
| sidePanel | ✅ | ❌ | sidePanel.* |
| debugger | ✅ | ⚠️ | debugger.* |
| declarativeNetRequest | ✅ | ❌ | dnr.* |

启动时：

```ts
const caps = detectCapabilities();

if (caps.tabs) {
  registerTabsTools();
}

if (caps.sidePanel) {
  registerSidePanelTools();
}
```

这样 Agent 永远只会看到当前浏览器真正支持的 Tool。

---

# 问题 38：Tool 应该设计成什么粒度？

这是 Full Browser Agent 最容易走歪的地方。

例如用户说：

```text
帮我整理一下标签页
```

你有两种完全不同的设计思路。

---

| 选项 | Tool 粒度 | 例子 | 优点 | 缺点 |
|--------|--------|--------|--------|--------|
| A | Browser API 粒度 | tabs.query、tabs.remove、tabs.group | 简单、透明、容易映射浏览器 API | Tool 数量巨大，Agent 要自己编排 |
| B | 用户任务粒度 | tabs.closeDuplicates、tabs.organize | Agent 更聪明，Prompt 更简单 | Tool 逻辑变重 |
| C | 混合粒度 | 既有 tabs.query，又有 tabs.closeDuplicates | 灵活 | 需要定义边界 |
| D | 全部高阶 Tool | organizeWorkspace、cleanBrowser、researchCurrentPage | 用户体验最好 | Tool 内部会越来越复杂，难维护 |

---

### A：Browser API 粒度

Tool 长这样：

```text
tabs.query
tabs.update
tabs.remove
tabs.group
tabs.move
```

Agent 自己组合：

```text
query
↓
分析
↓
remove
↓
group
```

优点：

```text
最透明
最符合浏览器 API
Tool 很简单
```

缺点：

```text
Tool 数量会很多
Agent 推理负担大
Token 消耗大
```

---

### B：用户任务粒度

Tool：

```text
tabs.closeDuplicates
tabs.archiveInactive
tabs.groupByDomain
```

Agent 直接调用：

```text
tabs.closeDuplicates
```

即可完成任务。

优点：

```text
更接近用户需求
Prompt 简洁
Agent 更稳定
```

缺点：

```text
Tool 实现会越来越复杂
```

---

### C：混合粒度

同时存在：

```text
tabs.query
tabs.closeDuplicates
tabs.groupByDomain
```

Agent 可以自由选择。

优点：

```text
最灵活
适合 Agent
```

缺点：

```text
要管理 Tool 边界
容易出现重复能力
```

---

### D：全高阶 Tool

例如：

```text
workspace.organize
workspace.cleanup
workspace.focusMode
```

Tool 内部封装所有逻辑。

优点：

```text
用户体验最好
```

缺点：

```text
Tool 变成黑盒
维护困难
扩展困难
```

---

## 我的建议

这里我不会像前面那样直接推一个答案。

因为这取决于你怎么看待 Agent：

### 如果你认为

```text
Agent 负责思考
Tool 负责执行
```

选 **A**。

---

### 如果你认为

```text
Tool 应该承载领域知识
Agent 只负责调度
```

选 **B**。

---

### 如果你认为

```text
Agent 和 Tool 都应该有一定智能
```

选 **C**。

---

对于 Browser Agent，我个人倾向 **C**，因为：

```text
tabs.query
```

这种基础能力一定需要。

但：

```text
tabs.closeDuplicates
tabs.groupByDomain
```

这种高频操作也值得做成高阶 Tool。

---

请选择：

| 选项 | 含义 |
|--------|--------|
| A | 全部 Browser API 粒度 |
| B | 全部用户任务粒度 |
| C | 混合粒度 |
| D | 全部高阶 Tool |

---

## 用户

A

---

## ChatGPT

确认：问题 38 选择 **A：全部 Browser API 粒度**。

这个决定影响非常大，相当于确定了：

> **Tool 就是浏览器能力的映射层，不承载业务逻辑。**

---

## 最终长什么样

Tool：

```text
tabs.query
tabs.get
tabs.create
tabs.update
tabs.remove
tabs.move
tabs.group
tabs.ungroup

windows.getAll
windows.create
windows.remove

bookmarks.search
bookmarks.create
bookmarks.update
bookmarks.remove

history.search
history.deleteUrl

downloads.search
downloads.download
downloads.erase

cookies.get
cookies.getAll
cookies.set
cookies.remove

page.getReadableText
page.getSelection
page.getMetadata
```

不会存在：

```text
tabs.closeDuplicates
tabs.organize
workspace.cleanup
workspace.focusMode
history.cleanOldRecords
```

这种 Tool。

---

## 优点

### Tool 永远很薄

例如：

```ts
tabs.remove({
  tabIds: [1,2,3]
})
```

内部基本直接映射：

```ts
browser.tabs.remove()
```

而不是：

```ts
tabs.closeDuplicates()
```

里面写几百行逻辑。

---

### 双浏览器兼容容易

因为本质是：

```text
Browser API
     ↓
Tool
```

而不是：

```text
业务逻辑
    ↓
再调用 Browser API
```

---

### Agent 更强

例如：

用户：

```text
关闭重复标签页
```

Agent：

```text
1. tabs.query
2. 分析重复 URL
3. tabs.remove
```

推理过程完全可见。

---

### Tool 数量稳定

未来新增能力：

```text
Chrome API
Firefox API
```

只需要新增对应 Tool。

不会出现：

```text
tabs.organizeByAI
tabs.organizeByTime
tabs.organizeByDomain
tabs.organizeByTopic
tabs.smartMerge
```

这种 Tool 爆炸。

---

## 缺点

以后 Agent 会频繁调用：

```text
tabs.query
```

然后自己推理。

所以：

```text
Tool 简单
Agent 复杂
```

而不是：

```text
Tool 复杂
Agent 简单
```

这是你主动选择的架构方向。

---

## 当前架构已经比较清晰了

```text
Chat Page
├── Agent Runtime
├── LLM Provider
├── Conversation
├── Tool Registry
├── Guardrail
└── JSON-RPC Client

Background
├── Capability Detection
├── Tool Router
├── Browser API Adapter
└── Event Listener

Content Script
├── DOM Access
├── Readability
├── Selection
└── Page Actions

Tool Registry
└── Browser API 粒度 Tool

通信协议
└── JSON-RPC 2.0

Tool 注册
└── Capability-based Registration

状态
└── currentWorkspaceState(内存)
```

---

## 问题 39：Tool Schema 用什么格式描述？

Agent 调用 Tool 时，需要告诉模型：

```text
tool name
参数
返回值
权限
风险等级
```

这里有四种路线：

| 选项 | 是什么 | 优点 | 缺点 |
|--------|--------|--------|--------|
| A | TypeScript Interface | 开发最简单 | LLM 理解能力弱 |
| B | JSON Schema | 标准化、跨语言、适合 LLM Tool Calling | 需要维护 Schema |
| C | Zod First | TypeScript + Runtime Validation + JSON Schema 导出 | 需要引入 Zod |
| D | OpenAPI | 生态成熟 | 对本地 Tool 太重 |

举例：

### A

```ts
interface TabsQueryInput {
  active?: boolean;
  currentWindow?: boolean;
}
```

---

### B

```json
{
  "type": "object",
  "properties": {
    "active": {
      "type": "boolean"
    }
  }
}
```

---

### C

```ts
const TabsQuerySchema = z.object({
  active: z.boolean().optional()
});
```

自动生成：

```json
JSON Schema
```

---

### D

直接 OpenAPI。

---

请选：

| 选项 | 含义 |
|--------|--------|
| A | TypeScript Interface |
| B | JSON Schema |
| C | Zod First |
| D | OpenAPI |

---

## 用户

B

---

## ChatGPT

确认：问题 39 选择 **B：JSON Schema**。

这个选择和你前面选的：

```text id="bgvxyh"
JSON-RPC 2.0
Browser API 粒度 Tool
Capability-based Registration
```

是匹配的。

---

# 问题 40：Tool 返回结果要不要强制 Schema 化？

这个问题在决定：

```text id="0nd4g0"
Tool Result
```

是自由返回还是强约束返回。

例如：

```text id="1aw3uo"
tabs.query
```

返回结果怎么定义。

---

## 选项 A：返回任意 JSON

### 是什么

Tool 直接返回对象。

```json
{
  "tabs": [...]
}
```

或者：

```json
{
  "items": [...]
}
```

或者：

```json
{
  "result": [...]
}
```

开发者自己决定。

### 优点

| 优点 |
|--------|
| 实现最快 |
| 灵活 |
| Tool 开发简单 |

### 缺点

| 缺点 |
|--------|
| 不同 Tool 风格不一致 |
| Agent Prompt 更复杂 |
| Tool Result 不容易验证 |
| 后期维护困难 |

### 适合

```text id="axsqrn"
Demo
原型
工具数量很少
```

---

## 选项 B：每个 Tool 都有 Input Schema 和 Output Schema

### 是什么

Tool 定义：

```json
{
  "inputSchema": {},
  "outputSchema": {}
}
```

例如：

```json
{
  "outputSchema": {
    "type": "object",
    "properties": {
      "tabs": {
        "type": "array"
      }
    }
  }
}
```

### 优点

| 优点 |
|--------|
| Tool 完全可描述 |
| LLM 理解更稳定 |
| 可以自动验证 |
| 可以自动生成文档 |
| 可以自动生成 Tool Catalog |

### 缺点

| 缺点 |
|--------|
| 开发量增加 |
| 每个 Tool 都要维护两套 Schema |

### 适合

```text id="jlwmic"
Agent Framework
MCP 风格架构
长期项目
```

---

## 选项 C：Input Schema 强制，Output 自由

### 是什么

参数必须校验：

```json
{
  "active": true
}
```

返回随意：

```json
{
  "tabs": [...]
}
```

### 优点

| 优点 |
|--------|
| 开发成本较低 |
| 参数安全 |
| 实现简单 |

### 缺点

| 缺点 |
|--------|
| 返回值逐渐失控 |
| Tool 风格不统一 |

### 适合

```text id="tt4fkh"
中小型 Agent
```

---

## 选项 D：统一 Result Envelope

所有 Tool 返回：

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

同时：

```json
{
  "error": {}
}
```

错误统一。

但 data 内部不强约束。

### 优点

| 优点 |
|--------|
| 错误处理统一 |
| 前端处理方便 |
| 比 A 规范很多 |

### 缺点

| 缺点 |
|--------|
| data 仍然不受约束 |
| Tool Catalog 信息不完整 |

### 适合

```text id="kmkdrw"
工程项目
但不想维护 Output Schema
```

---

## 举例

以：

```text id="x8c86n"
tabs.query
```

为例。

### B

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "active": {
        "type": "boolean"
      }
    }
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "tabs": {
        "type": "array"
      }
    }
  }
}
```

Agent 完全知道：

```text id="twwzwp"
输入长什么样
输出长什么样
```

---

## 我的建议

这里我倾向 **B**。

原因：

你已经选了：

```text id="e86wzj"
JSON-RPC
JSON Schema
Browser API Tool
Capability Registry
```

再往前一步就是：

```text id="l5hz3f"
Input Schema
Output Schema
```

这样 Tool Catalog 基本完整。

---

请选择：

| 选项 | 含义 |
|--------|--------|
| A | 返回任意 JSON |
| B | Input Schema + Output Schema |
| C | 只约束 Input |
| D | 统一 Envelope，不约束 Data |

---

## 用户

兼容openai的接口就行

---

## ChatGPT

这个回答比 A/B/C/D 更重要，因为你实际上在说：

> **我不关心内部 Tool Schema 的理论完美性，我关心兼容 OpenAI Tool Calling 生态。**

那问题 40 应该重新定义。

---

## 问题 40（修正版）

Tool Schema 是否直接兼容 OpenAI Function Calling？

### 选项 A：自定义 Schema

例如：

```json
{
  "name": "tabs.query",
  "input": {},
  "output": {}
}
```

#### 优点

- 完全自由
- 可以按自己需求设计

#### 缺点

- 无法直接接 OpenAI
- 无法直接接 Claude
- 无法直接接 Gemini
- 后面还要写 Adapter

---

### 选项 B：OpenAI Tool Schema

例如：

```json
{
  "type": "function",
  "function": {
    "name": "tabs_query",
    "description": "Query browser tabs",
    "parameters": {
      "type": "object",
      "properties": {
        "active": {
          "type": "boolean"
        }
      }
    }
  }
}
```

#### 优点

- OpenAI 原生支持
- Claude 基本兼容
- Gemini 容易转换
- MCP 容易转换
- 大量 Agent Framework 直接支持

#### 缺点

- 只能描述 Input Schema
- 对 Output Schema 没有标准

---

### 选项 C：OpenAI Tool Schema + 自定义 Metadata

例如：

```json
{
  "type": "function",
  "function": {
    "name": "tabs_query",
    "description": "Query browser tabs",
    "parameters": {}
  },
  "x-risk-level": "low",
  "x-capability": "tabs",
  "x-confirmation-required": false
}
```

#### 优点

- 保持 OpenAI 兼容
- 可以增加 Browser Agent 特有信息
- 支持 Guardrail
- 支持风险分级

#### 缺点

- 需要定义扩展字段规范

---

### 选项 D：MCP Tool Schema

直接采用 MCP Tool 定义。

#### 优点

- Agent 生态标准化方向

#### 缺点

- 对浏览器扩展 MVP 有点超前
- Provider 兼容性不如 OpenAI

---

## 我建议

对于你现在的项目：

```text
OpenAI Tool Schema
+
少量扩展字段
```

也就是 **C**。

例如：

```json
{
  "type": "function",
  "function": {
    "name": "tabs_query",
    "description": "Query browser tabs",
    "parameters": {
      "type": "object",
      "properties": {
        "active": {
          "type": "boolean"
        }
      }
    }
  },
  "x-capability": "tabs",
  "x-risk-level": "low",
  "x-confirmation-required": false
}
```

这样未来：

```text
OpenAI
Claude
Gemini
OpenRouter
Ollama
LM Studio
vLLM
```

全部都容易适配。

---

请选择：

| 选项 | 含义 |
|------|------|
| A | 完全自定义 Tool Schema |
| B | 纯 OpenAI Tool Schema |
| C | OpenAI Tool Schema + 扩展字段 |
| D | MCP Tool Schema |
