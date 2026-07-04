# Browser Agent Extension

<p align="center">
  <a href="README.zh.md">中文文档</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <em>AI-powered browser agent extension — control tabs, windows, bookmarks, history, downloads, cookies, and more with natural language.</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/devcxl/browser-agent" alt="License"></a>
  <a href="https://github.com/devcxl/browser-agent/releases"><img src="https://img.shields.io/github/v/release/devcxl/browser-agent" alt="Release"></a>
  <a href="https://github.com/devcxl/browser-agent/actions"><img src="https://img.shields.io/github/actions/workflow/status/devcxl/browser-agent/build.yml" alt="Build"></a>
  <a href="https://chrome.google.com/webstore"><img src="https://img.shields.io/badge/Chrome-MV3-blue" alt="Chrome"></a>
  <a href="https://addons.mozilla.org"><img src="https://img.shields.io/badge/Firefox-MV2-orange" alt="Firefox"></a>
</p>

## Features

- 🧠 **Natural Language** — Control your browser via a sidebar chat interface
- 🗂️ **Full Browser Management** — Tabs, windows, groups, bookmarks, history, downloads, cookies, sessions, and more
- 🔒 **Safety Guardrails** — Sensitive operations require user confirmation to prevent accidents
- 🎯 **Cross-Browser** — Supports both Chrome (MV3) and Firefox
- 🧩 **Extensible Tool System** — Phased registration with Expert Mode support
- 🎤 **Voice Input** — Voice interaction support (in development)

## Quick Start

```bash
# Install dependencies
npm install

# Dev mode (Chrome)
npm run dev:chrome

# Dev mode (Firefox)
npm run dev:firefox

# Build
npm run build

# Build all browser versions
npm run build:all

# Run tests
npm run test:run

# Lint
npm run lint

# Type check
npm run typecheck
```

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | [WXT](https://wxt.dev) — Next-gen Web Extension Framework |
| UI | React 18 + TypeScript |
| Styling | TailwindCSS v4 |
| Build | Vite |
| Testing | Vitest + Playwright + Testing Library |
| Lint | ESLint + Prettier |

## Project Structure

```
src/
├── adapters/        # Chrome/Firefox browser adapter layer
├── agent/           # Agent loop, context, system prompts
├── background/      # Service Worker logic
├── chat/            # Chat logic
├── content/         # Content Script
├── conversation/    # Conversation management
├── entrypoints/     # WXT entrypoints
│   ├── background.ts
│   ├── content.ts
│   └── sidepanel/   # Sidebar UI (App.tsx + components)
├── guardrail/       # Safety guardrails, confirmation
├── provider/        # LLM & voice recognition clients
├── registry/        # Tool registration
├── tools/           # Browser API tools
│   ├── tabs/        # Tab operations
│   ├── bookmarks/   # Bookmark operations
│   ├── cookies/     # Cookie operations
│   ├── downloads/   # Download management
│   ├── history/     # History
│   ├── sessions/    # Session snapshots
│   ├── windows/     # Window management
│   ├── tabgroups/   # Tab groups
│   ├── page/        # Page content reading
│   └── misc/        # Miscellaneous
├── types/           # Type definitions
└── shared/          # Shared utilities
```

## Build Outputs

| Browser | Manifest | Output |
|---------|----------|--------|
| Chrome | MV3 | `.output/chrome-mv3/` |
| Firefox | MV2 | `.output/firefox-mv2/` |

```bash
# Package as zip
npm run zip

# Full build + verification
npm run pre-release
```

## Capabilities

**Default:** tabs, windows, tabGroups, bookmarks, history, downloads, sessions, page content, cookies, storage, clipboard, notifications, contextMenus, sidePanel (Chrome), alarms

**Expert Mode (manual enable):** proxy, privacy, management, debugger, webRequest, declarativeNetRequest, nativeMessaging, identity

## Development Guide

```bash
# Run tests (watch mode)
npm run test

# Run specific tests
npx vitest run src/tools/tabs

# E2E tests
npx playwright test

# Format code
npm run format
```

## Documentation

- [PRD](docs/prd/PRD.md)
- [Design Docs](docs/design/)
- [Review Records](docs/review/)
- [Issue Diagnosis](docs/dev/)
