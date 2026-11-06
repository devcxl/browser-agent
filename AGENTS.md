# AGENTS.md

本文件为在本仓库中工作的编码代理（pi / Claude Code / OpenCode 等）提供指引。

浏览器扩展（WXT + React 19 + TypeScript，MV3），Chrome 与 Firefox 双目标。代码注释与文档以中文为主，新增注释沿用中文。

## 常用命令

```bash
npm install                 # 首次准备
npm run dev:chrome          # WXT 开发模式（启动浏览器 + HMR）
npm run dev:firefox         # Firefox MV3
npm run build:chrome        # -> dist/chrome-mv3/
npm run build:firefox       # -> dist/firefox-mv3/
npm run lint                # eslint src/（当前基线：0 error，48 条 no-console warning）
npm run lint:fix
npm run format              # prettier，仅 src/**/*.{ts,tsx,css,json}
npm run typecheck           # 会自动先跑 pretypecheck = wxt prepare
npm run test:run            # 全量 vitest，约 20s，127 文件 / 1743 用例
npm run test                # vitest watch
npm run test:e2e            # playwright（需前置构建，见下）
```

只跑一个文件 / 一个包 / 一个用例：

```bash
npx vitest run src/tools/tabs
npx vitest run src/agent/__tests__/circuit-breaker.test.ts
npx vitest run -t "将点号 key 映射为下划线 message name"
```

发布前本地等价门禁：`npm run pre-release`（= `test:run` → `build:all` → `check:size` → `verify:manifest`）。

## 强制顺序与前置条件

- `npm run typecheck` 依赖 `.wxt/types`（gitignored 的生成产物）。干净 clone 直接跑 `npx tsc --noEmit` 会报大量 `Cannot find name 'browser'`；必须走 `npm run typecheck`，由 `pretypecheck` 钩子执行 `wxt prepare` 重建。
- e2e 必须先在 `dist/chrome-mv3/` 有构建产物（`npm run build:chrome`），且需要完整 Chromium（`npx playwright install --with-deps chromium`）；`playwright.config.ts` 固定 `channel: 'chromium'`，headless shell 不支持 `--load-extension`。
- e2e 串行执行（`fullyParallel: false, workers: 1`）：扩展共享持久化 context 与 `chrome.storage`，并行 worker 会互相污染。
- CI（`.github/workflows/ci.yml`）的必过聚合 job 是 `ci`，它只聚合 `lint` / `typecheck` / `test` / `action-contract`；`e2e` 不在其中。`test` 先跑 `test:run` 再跑 `npx vitest run --coverage`。

## 覆盖率陷阱

`vitest.config.ts` 设了全局 95% 阈值（lines/functions/branches/statements），且阈值在**部分**运行时同样生效。因此：

- `npx vitest run src/tools/tabs` → 通过。
- `npx vitest run --coverage src/tools/tabs` → **失败**（退出码非 0，只统计了被跑到的文件）。做聚焦验证时不要加 `--coverage`；只有全量 `npx vitest run --coverage` 才是绿的（当前约 99%）。

## 架构：一次对话怎么跑起来

```
sidepanel (React, 扩展页面)          background (service worker)        content script
  ToolLoopAdapter + ToolRegistry  --JSON-RPC(port "chat-agent")-->  JsonRpcRouter --> *-proxy --> browser.* API
  Guardrail + LlmClient                                               ContentBridge --(port "content-script-bridge")--> 页面提取/点击/滚动/eval
```

关键事实：

- **工具在 sidepanel 页面内组装**，不在 background。组装点是 `src/entrypoints/sidepanel/hooks/useAgent.ts`（动态 `import()` + `registry.registerAll`）；`src/tools/index.ts` 不存在，`src/tools/phase2-register.ts` 只承载第二批（bookmarks/history/downloads/cookies/sessions/misc/expert）。
- `src/entrypoints/background.ts` 只做 `initBackground()` + action 点击开面板；`src/background/index.ts` 是 RPC 注册总表，新增浏览器 API 能力要同时改 `*-proxy`、`src/background/index.ts` 的 `router.register`，以及 tools 层。
- 浏览器差异集中在 `src/adapters/`（`getAdapter()` 按 UA 选 Chrome/Firefox，测试用 `resetAdapter()`），不要在工具层写 `if (isFirefox)`。
- 数据面：IndexedDB（`idb`，`src/shared/db/schema.ts`）存会话/消息/技能内容；`chrome.storage.local` 经 `src/shared/storage/config-store.ts` 存配置（单例，测试需 `resetInstance()`）。
- 面板复用：`sidepanel.html?embedded=1` 被 content script 以 iframe 内嵌进页面（`src/content/floating-widget/panel.ts`），外层与 iframe 用 `src/shared/widget-protocol.ts` 的 postMessage 协议通信；`App.tsx` 依据 `embedded` 查询参数切换形态。

## 关键约定

- **Manifest 唯一来源是 `wxt.config.ts`**，仓库里没有手写的 `manifest.json`。权限按浏览器分支生成：Firefox 需要 `tabGroups`、且不能有 `windows`；Chrome 额外有 `sidePanel` / `declarativeNetRequest`。`sidepanel.html` 列在 `web_accessible_resources` 里，供 content script 的 iframe 加载，改动该列表会直接打断浮动面板。
- **工具命名是「动词型复合名」**（`tab_search`、`tab_open`、`bookmark_add`、`page_read_markdown`），不是 `tabs.query` 风格；RPC method 才是点号风格（`tabs.query`）。`ToolDefinition` 必填字段见 `src/shared/types/tool.ts`：`riskLevel`、`confirmationRequired`、`resultSensitivity`；按类型注释的约定，`high`/`critical` 应提供 `preflight`——`tool-loop-adapter` 用它算出确认弹窗里的「受影响对象」清单；缺失时不报错，但用户确认时看不到影响范围。
- 工具结果进 LLM 上下文前会被裁剪（`src/tools/tab-sanitize.ts` 去掉 `favIconUrl` 等重量级字段）与敏感度过滤（`src/guardrail/guardrail.ts` 的 `filterResultForRemote`）。新增返回页面的工具要声明 `resultSensitivity`，否则敏感数据可能流向远程 Provider。
- **i18n 是浏览器标准 `_locales`**：文案在 `public/_locales/{en,zh_CN}/messages.json`，代码里点号 key 映射为下划线 message name（`settings.tabs.appearance` → `settings_tabs_appearance`）。新增 UI 文案必须同时改**两个**语言包，`src/entrypoints/sidepanel/__tests__/i18n.test.tsx` 会断言 key 集合完全一致。测试环境由 `src/test/i18n-mock.ts` 直接 import 这两个 JSON，绕过 `browser.i18n`。
- 数据库版本号在 `src/shared/types/storage.ts`（`DB_VERSION`），升级处理在 `src/shared/db/schema.ts` 的 `upgrade()` 里按 `oldVersion < N` 累积；改结构要同时动这两处。

## 仓库陷阱（会让人改错文件）

- `src/content/floating-widget/grokbot/` 是 vendored 第三方源码（BSD-3-Clause，上游 `616c1dd`，见 `THIRD_PARTY_NOTICES.md`），**已被 tsconfig 与覆盖率排除，文件带 `@ts-nocheck`**。不要为「修类型」改动它，也不要把新逻辑塞进去。
- `src/tools/tabGroups/` 只有一个 `.gitkeep` 空占位；真实代码在 `src/tools/tabgroups/`。在错误的大小写目录里新建文件等于没写。
- 根目录 `skills/`（tabs/bookmarks/...）是历史上「内置技能设计草案」，**没有任何代码 import 它**，其中工具名（`tabs_query`）已过时。真正生效的内置技能是 `src/shared/skills/builtin-skills.ts` 里的 prompt 定义。改技能行为请改后者。
- `src/chat/components/`、`src/chat/hooks/` 是空目录（README 的结构图已过时，那里并没有「chat 逻辑」）。
- 全局测试前置是 `vitest.setup.ts`（`fake-indexeddb/auto` + jest-dom + `browser.i18n` 兜底 stub）；`src/test-setup.ts` 是没人引用的遗留文件（只在 `stryker.conf.json` 的 exclude 里出现），加全局 stub 请加到 `vitest.setup.ts`。
- `scripts/verify-manifest.sh` 对 Firefox 会打印 `❌ tabGroups should NOT be present`，但**退出码仍是 0**，而 `wxt.config.ts` 明确为 Firefox 140+ 添加 `tabGroups` 权限。看到这条 ❌ 不要顺手删 firefox 的 `tabGroups`；脚本判定与配置意图不一致，改动前先确认哪一边才是期望。
- `e2e/` 不在 `tsconfig` 的 include 内（`include` 只有 `src/**` 与 `.wxt/types`），e2e 代码不参与 typecheck。

## 测试约定

- 单测与源码同目录：`**/__tests__/*.test.ts(x)`（vitest `include: ['src/**/*.test.{ts,tsx}']`）。
- 环境是 jsdom + `fake-indexeddb`，**没有真实浏览器 API**。需要 `browser.storage` 的测试用 `src/entrypoints/sidepanel/__tests__/test-utils.ts` 的 `mockBrowserStorage()`（内置 i18n mock 与 `ConfigStore.resetInstance()`），floating widget 用 `src/content/floating-widget/__tests__/helpers/widget-harness.ts`。
- 入口测试靠 stub WXT 的全局函数（`globalThis.defineContentScript` / `defineBackground`），参考 `src/entrypoints/__tests__/`。
- e2e 不 mock 网络栈以外的东西：真实构建产物 + `context.route()` 拦截 LLM 请求。LLM 必须返回 **SSE `text/event-stream`**（AI SDK 的 `openai-compatible` 要求），普通 JSON 会导致回复为空——参考 `e2e/helpers/mock-llm.ts`。seed 的 provider 必须通过 `getProviderReadiness`（endpoint + 至少一个合法 model），否则侧边栏渲染引导页、输入框消失。
- 变异测试可选：`npx stryker run`（`stryker.conf.json`，`break: null` 不阻断，`maxConcurrentTestRunners: 2`，很慢）。

## 协作流程

- `master` 已启用分支保护：**只能通过 PR 合并**。改动请走分支 → PR，不要直接 push `master`。
- 提交信息用 conventional commits + 作用域，中文描述，例如 `fix(settings): ...`、`ci(types): ...`、`build(deps): ...`；合并后带 `(#PR号)`。历史上有 merge commit，近期以 squash 为主。
- 依赖升级由 dependabot 每周处理（npm + github-actions）；`package.json` 的 `overrides` 锁住了 `publish-browser-extension@^6.1.1`（发布用 `wxt submit` 依赖它），不要随手移除。
- 发布流程靠 tag 驱动：tag 必须与 `package.json` 版本一致；`release.yml` 出草稿 release，`publish-stores.yml` 在 release published 后提交商店。产物校验要求恰好 1 个 `*-chrome.zip`、1 个 `*-firefox.zip`、1 个 `*-sources.zip`，单包 ≤ 2048KB（`scripts/check-size.sh`）。

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `devcxl/browser-agent`, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root (created lazily) plus `docs/adr/`. See `docs/agents/domain.md`. 领域词汇以 `CONTEXT.md` 为准（如「工具类别」「工具路由」「Jev 决策」「候选类别」「整理预览」）；`docs/adr/` 按日期前缀命名，改动相关领域前先读对应 ADR，与之冲突要显式说明而不是静默覆盖。

### PR review

Pull requests are reviewed by `devcxl/agentic-action/pr-review` (`.github/workflows/pr-review.yml`). The review is advisory by default: it posts a `<!-- pi-review:begin -->` comment and does not block merges. See `docs/agents/pr-review.md`. 该工作流在 CI 中有 `action-contract` job 校验上游 action 的输入与安全语义——改 `pr-review.yml` 时不要放宽 `tools:` 白名单（含 `bash`/`sh` 等可执行工具会让校验失败）。
