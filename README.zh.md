<p align="center">
  <img src="public/logo-128.png" alt="Browser Agent Logo" width="128" height="128">
</p>

<h1 align="center">Browser Agent Extension</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文文档</a>
</p>

<p align="center">
  <em>AI 驱动的浏览器 Agent 扩展 — 通过自然语言管理标签页、窗口、书签、历史记录、下载、Cookie 等浏览器数据。</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/devcxl/browser-agent" alt="License"></a>
  <a href="https://github.com/devcxl/browser-agent/releases"><img src="https://img.shields.io/github/v/release/devcxl/browser-agent" alt="Release"></a>
  <a href="https://github.com/devcxl/browser-agent/actions"><img src="https://img.shields.io/github/actions/workflow/status/devcxl/browser-agent/build.yml" alt="Build"></a>
  <a href="https://chromewebstore.google.com/detail/browser-agent/ocdmppclkippfbdhephcacmpmomkmdip"><img src="https://img.shields.io/badge/Chrome-MV3-blue" alt="Chrome"></a>
  <a href="https://addons.mozilla.org/zh-CN/firefox/addon/browser-agent/"><img src="https://img.shields.io/badge/Firefox-MV2-orange" alt="Firefox"></a>
</p>

## 特性

- 🧠 **自然语言交互** — 在侧边栏聊天界面中用自然语言控制浏览器
- 🗂️ **全方位浏览器管理** — 标签页、窗口、分组、书签、历史、下载、Cookie、会话等
- 🔒 **Guardrail 安全机制** — 敏感操作需用户确认，防止误操作
- 🎯 **双浏览器支持** — Chrome (MV3) + Firefox 同时支持
- 🧩 **可扩展工具系统** — 分阶段注册，支持 Expert Mode
- 🎤 **语音输入** — 支持语音交互（开发中）

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（Chrome）
npm run dev:chrome

# 开发模式（Firefox）
npm run dev:firefox

# 构建
npm run build

# 构建所有浏览器版本
npm run build:all

# 运行测试
npm run test:run

# Lint
npm run lint

# 类型检查
npm run typecheck
```

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | [WXT](https://wxt.dev) — Next-gen Web Extension Framework |
| UI | React 18 + TypeScript |
| 样式 | TailwindCSS v4 |
| 构建 | Vite |
| 测试 | Vitest + Playwright + Testing Library |
| Lint | ESLint + Prettier |

## 项目结构

```
src/
├── adapters/        # Chrome/Firefox 浏览器适配层
├── agent/           # Agent 循环、上下文构建、系统提示词
├── background/      # Service Worker 后台逻辑
├── chat/            # 聊天相关逻辑
├── content/         # Content Script
├── conversation/    # 会话管理
├── entrypoints/     # WXT 入口
│   ├── background.ts
│   ├── content.ts
│   └── sidepanel/   # 侧边栏 UI (App.tsx + 组件)
├── guardrail/       # 安全护栏、操作确认
├── provider/        # LLM 客户端、语音识别客户端
├── registry/        # 工具注册
├── tools/           # 浏览器 API 工具
│   ├── tabs/        # 标签页操作
│   ├── bookmarks/   # 书签操作
│   ├── cookies/     # Cookie 操作
│   ├── downloads/   # 下载管理
│   ├── history/     # 历史记录
│   ├── sessions/    # 会话快照
│   ├── windows/     # 窗口管理
│   ├── tabgroups/   # 标签组
│   ├── page/        # 页面内容读取
│   └── misc/        # 其他工具
├── types/           # 类型定义
└── shared/          # 共享工具函数
```

## 构建产物

| 浏览器 | Manifest | 输出目录 |
|--------|----------|----------|
| Chrome | MV3 | `.output/chrome-mv3/` |
| Firefox | MV2 | `.output/firefox-mv2/` |

```bash
# 打包为 zip
npm run zip

# 全量构建 + 校验
npm run pre-release
```

## 能力覆盖

**默认能力：** tabs, windows, tabGroups, bookmarks, history, downloads, sessions, page content, cookies, storage, clipboard, notifications, contextMenus, sidePanel (Chrome), alarms

**Expert Mode（手动开启）：** proxy, privacy, management, debugger, webRequest, declarativeNetRequest, nativeMessaging, identity

## 开发指南

```bash
# 运行测试（watch 模式）
npm run test

# 运行特定测试
npx vitest run src/tools/tabs

# E2E 测试
npx playwright test

# 格式化代码
npm run format
```

## 文档

- [PRD](docs/prd/PRD.md)
- [设计文档](docs/design/)
- [Review 记录](docs/review/)
- [问题诊断](docs/dev/)
