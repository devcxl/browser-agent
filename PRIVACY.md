# Privacy Policy for Browser Agent

**Last updated: 2026-11-03**

## Overview

Browser Agent is an open-source browser extension that enables natural language control of your browser through an AI-powered interface. This privacy policy explains how your data is handled when you use this extension.

## Data Collection by the Developer

**The developer of Browser Agent operates no server and does NOT collect, store, or receive any of your personal data or browsing information.** The extension contains no analytics, telemetry, crash reporting, or advertising.

The extension does transmit data to services **you configure or opt into**: the OpenAI-compatible AI provider you configure, and — only if you enable it — the optional Jev tool-routing service. What is sent, and when, is described below.

## Data Processing on Your Device

The extension processes the following data **locally on your device** to fulfill your requests:

- **Tab information** (URLs, titles, favicons, states) — to manage, switch, group, and organize your tabs
- **Bookmarks** — to search, create, and organize your bookmarks
- **Browsing history** — to search your browsing history upon your request
- **Downloads** — to manage download states (pause, cancel, resume)
- **Cookies** — to read, modify, or delete cookies when you explicitly request it (requires your confirmation)
- **Session data** — to backup and restore browser sessions
- **Page content** — to extract text, Markdown, metadata, or take screenshots when you explicitly request it

Some of this data also becomes part of the context sent to the services you configure when you ask the assistant to work with it — see the next two sections.

## Data Sent to AI Service Providers

When you use the extension's AI features, the OpenAI-compatible API endpoint **that you configure** receives the text of the current conversation — your messages, the assistant's replies, earlier tool calls and their results, and a conversation summary after context compaction — together with the browser context the assistant needs to answer, subject to the local filters below: for example tab titles and URLs, bookmark titles, or text read from a page you asked about.

Tool results pass through local filters before they can reach a remote provider. Results classified as _critical_ (for example cookie values) are never sent to a remote provider. Results classified as _sensitive_ (for example page text and browsing history) are withheld by default; they are forwarded only if the session has been granted permission to send sensitive data, and any field a tool marks as sensitive is replaced with a redaction marker first. Marking the provider as a _local trusted_ connection in its configuration disables these filters.

- You must provide your own API key, which is stored **locally** in your browser's extension storage
- The API key is only sent to the API endpoint you configure — never to the developer
- You are responsible for reviewing the privacy policy of your chosen AI service provider

## Optional Tool-Routing Service (Jev)

Jev is an optional structured-decision service that only decides which tool categories (tabs, bookmarks, history, page, and so on) a request needs. It does not generate chat replies and cannot read or change your browser.

Jev is **disabled by default**. It is used only after you save your own TypeSafe API key and switch it on under Settings → Jev. Once both are in place, on each chat message:

- **What is sent** — only the text of the message being routed, and only when the extension's local keyword rules cannot classify it. Each request also carries a fixed set of tool-category questions, the model name (`jev-1.13.0`), and your TypeSafe API key in the `Authorization` header.
- **Where it goes** — `https://api.typesafe.ai/v1/systemone` over HTTPS, without cookies and with redirects refused. Requests time out after 5 seconds.
- **What is not sent** — other messages in the conversation, tab or bookmark data, page content, and tool results are not part of the request. No fallback call is made to your AI provider if Jev fails; routing simply proceeds locally with the full tool set.
- **Your key** — stored in your browser's local extension storage, which is **not encrypted** and does not protect it from anyone with access to this browser profile. It is removed when you clear the key and is excluded from exported conversation/settings files.

You are responsible for reviewing TypeSafe's privacy policy, just as for your AI provider.

## Permissions and Their Purposes

| Permission | Purpose |
|---|---|
| `tabs` | Query, create, update, close browser tabs |
| `tabGroups` | Create and manage tab groups |
| `storage` | Store settings, session data, API key (local only) |
| `sessions` | Backup and restore browser sessions |
| `bookmarks` | Search, create, delete bookmarks |
| `downloads` | Search, pause, cancel, resume downloads |
| `cookies` | Read, set, delete cookies (requires user confirmation) |
| `history` | Search and delete browsing history |
| `windows` | Create, update, close browser windows |
| `privacy` | Query browser privacy settings (Expert Mode, opt-in) |
| `proxy` | Configure proxy settings (Expert Mode, opt-in) |
| `notifications` | Display desktop notifications |
| `declarativeNetRequest` | Declarative network request rules (Expert Mode, opt-in) |
| `sidePanel` | Provide the sidebar chat interface |

## Optional Permissions (Expert Mode)

The following permissions require you to manually enable Expert Mode:

- `management` — manage other installed extensions
- `clipboardRead` / `clipboardWrite` — clipboard access
- `debugger` — Chrome DevTools Protocol for advanced page operations

These permissions are **opt-in** and disabled by default.

## Data Storage

Conversation history, tool call logs, and session snapshots are stored **locally** in your browser's IndexedDB storage. Settings, including your AI provider and Jev API keys, are stored locally in the extension's browser storage. This data is not encrypted at rest, is not uploaded by the extension except as the conversation context sent to your configured AI provider and, for messages routed through Jev, the message text sent to TypeSafe (see above), and can be cleared by uninstalling the extension.

## Your Choices

- **Disable Jev** — switch it off under Settings → Jev, or clear the API key; the extension continues to work with local keyword routing and your AI provider.
- **Remove stored data** — clear a Jev key in Settings, delete conversations in the extension, or uninstall the extension to remove its local storage and IndexedDB data.
- **Change AI provider** — only the AI endpoint currently configured is used; no other provider receives your data.

## Third-Party Services

- **Your AI provider** — receives the conversation and tool context described above; no other AI provider is contacted.
- **TypeSafe (Jev)** — contacted only if you enable Jev; receives only the message text being routed, plus your API key for authentication.
- **GitHub** — the extension may fetch skill definitions from repositories you subscribe to. No personal data is sent in these requests.

## Children's Privacy

This extension is not directed at children under the age of 13. We do not knowingly collect personal information from children.

## Changes to This Privacy Policy

This privacy policy may be updated from time to time. Changes will be reflected in the extension's source repository.

## Contact

If you have questions about this privacy policy, please open an issue at:
[https://github.com/devcxl/browser-agent/issues](https://github.com/devcxl/browser-agent/issues)

## Source Code

The complete source code of this extension is publicly available at:
[https://github.com/devcxl/browser-agent](https://github.com/devcxl/browser-agent)
