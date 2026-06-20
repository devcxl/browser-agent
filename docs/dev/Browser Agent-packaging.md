# 开发文档: T20 - Chrome + Firefox 打包签名

**Project:** Browser Agent
**Task ID:** T20
**Slug:** packaging
**Issue:** #20
**类型:** infrastructure
**Batch:** 10
**依赖:** T19（测试通过）

---

## 1. 目标

通过 WXT 构建 Chrome 和 Firefox 两个生产级 zip 包，配置 CI 自动构建脚本，验证产物在两个浏览器中正常加载运行，Manifest 权限差异正确处理，zip 包 <2MB。

---

## 2. 前置条件

- [x] T19: 所有测试通过（单元测试覆盖率 >70%，E2E 通过）
- [x] WXT 项目配置完成（`wxt.config.ts`）
- [x] 所有功能模块实现完毕
- [x] `package.json` scripts 已配置 `build:chrome` / `build:firefox` / `zip`

---

## 3. 实现步骤

### 3.1 WXT 构建配置

**文件:** `wxt.config.ts`

```ts
import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// 扩展 ID（仅开发模式，生产环境不固定）
const EXTENSION_ID = "browser-agent-dev";

export default defineConfig({
  // 扩展基本信息
  manifest: {
    name: "Browser Agent",
    description: "AI-powered browser assistant - manage tabs, bookmarks, history, and more with natural language",
    version: "0.1.0",
    permissions: [
      "tabs",
      "windows",
      "tabGroups",
      "bookmarks",
      "history",
      "downloads",
      "cookies",
      "sessions",
      "scripting",
      "storage",
      "clipboardRead",
      "clipboardWrite",
      "notifications",
      "contextMenus",
      "sidePanel",
      "alarms",
    ],
    host_permissions: ["<all_urls>"],
    
    // 浏览器特定差异在下面处理
  },

  // 入口点
  entrypointsDir: "src/entrypoints",
  
  // 输出目录
  outDir: "dist",

  // Vite 配置
  vite: () => ({
    plugins: [tailwindcss()],
    build: {
      // 控制 chunk 大小
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          // 手动分包，避免重复打包
          manualChunks: {
            react: ["react", "react-dom"],
            vendor: ["idb"],
          },
        },
      },
    },
  }),

  // Chrome 特定配置
  // WXT 通过 manifestVersion 和 browser 自动处理差异
  // 以下通过 hooks 处理跨浏览器差异
});
```

### 3.2 Manifest 差异处理

#### 3.2.1 Chrome vs Firefox Manifest 差异

| 差异项 | Chrome | Firefox | 处理方式 |
|--------|--------|---------|----------|
| `manifest_version` | 3 | 3 | 统一 MV3 |
| `background` | `service_worker` | `scripts` (MV3) | WXT 自动处理 |
| `browser_specific_settings` | 不需要 | 需要 `gecko.id` | 通过 `wxt.config.ts` hooks 添加 |
| `side_panel` | 支持 | 不支持 | Chrome 独有权限，Firefox 不声明 |
| `tabGroups` 权限 | 支持 | 不支持 | Firefox 不声明 |
| `sessions` 权限 | 支持 | 行为不同 | 使用自定义实现，权限声明保留 |
| `clipboardRead` | 支持 | 有限支持 | 两个都声明，运行时能力检测 |
| `host_permissions` 中的 `*://` | 不支持，需 `<all_urls>` | 支持 `<all_urls>` | 统一 `<all_urls>` |

#### 3.2.2 wxt.config.ts Hooks 实现

```ts
import { defineConfig } from "wxt";

export default defineConfig({
  // ... 基础配置

  // Chrome 特定
  // WXT 自动处理 Chrome 的 service_worker
  // 不需要额外配置

  // Firefox 特定：添加 browser_specific_settings
  hooks: {
    "build:manifestGenerated": (wxt, manifest) => {
      if (wxt.config.browser === "firefox") {
        // 添加 Firefox 必需的 gecko.id
        manifest.browser_specific_settings = {
          gecko: {
            id: "browser-agent@example.com", // 生产环境替换为实际 ID
            strict_min_version: "128.0",
          },
        };

        // 移除 Firefox 不支持的权限
        if (manifest.permissions) {
          manifest.permissions = manifest.permissions.filter(
            (p) => !["tabGroups", "sidePanel"].includes(p as string)
          );
        }

        // 移除 side_panel 配置（Firefox 不支持）
        delete (manifest as any).side_panel;
      }

      if (wxt.config.browser === "chrome") {
        // Chrome 的 side_panel 配置
        manifest.side_panel = {
          default_path: "sidepanel.html",
        };
      }
    },
  },
});
```

### 3.3 资源优化

#### 3.3.1 图标生成

**文件:** `scripts/generate-icons.sh`

```bash
#!/bin/bash
# 从 512x512 源图标生成所有尺寸
# 依赖: imagemagick (convert)

SOURCE="assets/icon-source.png"
OUTDIR="public/icons"

mkdir -p "$OUTDIR"

for size in 16 32 48 96 128 256 512; do
  convert "$SOURCE" -resize ${size}x${size} "$OUTDIR/icon-${size}.png"
done
```

**manifest 中声明图标:**
```json
{
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "96": "icons/icon-96.png",
    "128": "icons/icon-128.png",
    "256": "icons/icon-256.png",
    "512": "icons/icon-512.png"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    },
    "default_title": "Browser Agent"
  }
}
```

#### 3.3.2 包体积控制

**目标:** zip < 2MB

**策略:**
1. **TailwindCSS 4 自动 treeshaking:** 只包含使用的 CSS 类，产物体积 ~10KB
2. **React 生产构建:** Vite 自动启用 minify + treeshaking
3. **不打包 Readability 到 Chat Page:** `@mozilla/readability` 只在 Content Script 中使用，Chat Page 不加载
4. **WXT 自动分包:** background、content script、chat page 各自独立打包
5. **移除 sourcemap:** 生产构建不包含 `.map` 文件
6. **图片资源压缩:** 图标使用 PNG 优化（`pngquant` 或 `optipng`）

**体积检查脚本:**

**文件:** `scripts/check-size.sh`

```bash
#!/bin/bash
MAX_SIZE_KB=2048  # 2MB

for browser in chrome firefox; do
  ZIP="dist/browser-agent-0.1.0-${browser}.zip"
  if [ -f "$ZIP" ]; then
    SIZE_KB=$(du -k "$ZIP" | cut -f1)
    echo "📦 ${browser}: ${SIZE_KB}KB"
    
    if [ "$SIZE_KB" -gt "$MAX_SIZE_KB" ]; then
      echo "❌ ${browser} zip 超过 ${MAX_SIZE_KB}KB 限制"
      exit 1
    else
      echo "✅ ${browser} zip 体积合格"
    fi
  else
    echo "⚠️  ${browser} zip 不存在"
  fi
done
```

### 3.4 CI 构建脚本

#### 3.4.1 GitHub Actions

**文件:** `.github/workflows/build.yml`

```yaml
name: Build and Package

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      
      - run: npm ci
      - run: npm run test -- --coverage
      
      - name: Check coverage
        run: |
          COVERAGE=$(node -e "const r=require('./coverage/coverage-summary.json');console.log(r.total.lines.pct)")
          if (( $(echo "$COVERAGE < 70" | bc -l) )); then
            echo "❌ Coverage $COVERAGE% < 70%"
            exit 1
          fi
          echo "✅ Coverage $COVERAGE%"

  build:
    needs: test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chrome, firefox]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      
      - run: npm ci
      
      - name: Build ${{ matrix.browser }}
        run: npm run build:${{ matrix.browser }}
      
      - name: Create zip
        run: npm run zip -b ${{ matrix.browser }}
      
      - name: Check zip size
        run: bash scripts/check-size.sh
      
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: browser-agent-${{ matrix.browser }}
          path: dist/*.zip
          retention-days: 30

  e2e:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      
      - run: npm ci
      - run: npx playwright install chromium
      
      - name: Download chrome artifact
        uses: actions/download-artifact@v4
        with:
          name: browser-agent-chrome
          path: dist/
      
      - name: Run E2E
        run: xvfb-run npm run test:e2e -- --project=chrome

  release:
    needs: [build, e2e]
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: browser-agent-*
          path: dist/
          merge-multiple: true
      
      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          files: dist/*.zip
          generate_release_notes: true
```

#### 3.4.2 本地构建脚本

**文件:** `scripts/build-all.sh`

```bash
#!/bin/bash
set -euo pipefail

echo "🧹 Cleaning..."
rm -rf dist/

echo "🔨 Building Chrome..."
npm run build:chrome

echo "🔨 Building Firefox..."
npm run build:firefox

echo "📦 Creating zip packages..."
npm run zip -b chrome
npm run zip -b firefox

echo "📏 Checking package sizes..."
bash scripts/check-size.sh

echo "✅ Build complete!"
ls -lh dist/*.zip
```

### 3.5 产物验证

#### 3.5.1 结构验证

**Chrome 产物结构（`dist/chrome/` 或 `dist/browser-agent-0.1.0-chrome/`）:**
```
chrome-mv3/
├── manifest.json
├── background.js          # service_worker
├── chat.html              # Chat Page
├── sidepanel.html         # Side Panel (Chrome only)
├── content-scripts/
│   └── content.js
├── assets/
│   ├── chat-*.js
│   ├── chat-*.css
│   └── ...
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-256.png
│   └── icon-512.png
└── _locales/              # (可选) 国际化
```

**Firefox 产物结构（`dist/firefox/` 或 `dist/browser-agent-0.1.0-firefox/`）:**
```
firefox-mv3/
├── manifest.json           # 含 browser_specific_settings，无 tabGroups/sidePanel
├── background.js           # background script
├── chat.html
├── content-scripts/
│   └── content.js
├── assets/
│   └── ...
├── icons/
│   └── ...
└── _locales/
```

#### 3.5.2 Manifest 差异验证

**文件:** `scripts/verify-manifest.sh`

```bash
#!/bin/bash
set -euo pipefail

echo "🔍 Verifying Chrome manifest..."
CHROME_MANIFEST="dist/browser-agent-*-chrome/manifest.json"
# 验证 Chrome manifest 包含 side_panel
jq -e '.side_panel' $CHROME_MANIFEST > /dev/null && echo "  ✅ side_panel present" || echo "  ❌ side_panel missing"
# 验证 Chrome manifest 包含 tabGroups
jq -e '.permissions | contains(["tabGroups"])' $CHROME_MANIFEST > /dev/null && echo "  ✅ tabGroups permission" || echo "  ❌ tabGroups missing"
# 验证 manifest_version
jq -e '.manifest_version == 3' $CHROME_MANIFEST > /dev/null && echo "  ✅ MV3" || echo "  ❌ Not MV3"

echo "🔍 Verifying Firefox manifest..."
FF_MANIFEST="dist/browser-agent-*-firefox/manifest.json"
# 验证 Firefox manifest 不包含 side_panel
jq -e '.side_panel' $FF_MANIFEST > /dev/null && echo "  ❌ side_panel should not exist" || echo "  ✅ side_panel absent"
# 验证 Firefox manifest 不包含 tabGroups
jq -e '.permissions | contains(["tabGroups"])' $FF_MANIFEST > /dev/null && echo "  ❌ tabGroups should not exist" || echo "  ✅ tabGroups absent"
# 验证 browser_specific_settings
jq -e '.browser_specific_settings.gecko.id' $FF_MANIFEST > /dev/null && echo "  ✅ gecko.id present" || echo "  ❌ gecko.id missing"
# 验证 strict_min_version
jq -e '.browser_specific_settings.gecko.strict_min_version' $FF_MANIFEST > /dev/null && echo "  ✅ strict_min_version" || echo "  ❌ strict_min_version missing"
```

#### 3.5.3 手动加载验证

**Chrome:**
1. 打开 `chrome://extensions/`
2. 开启 "开发者模式"
3. 点击 "加载已解压的扩展程序"
4. 选择 `dist/browser-agent-*-chrome/` 目录
5. 验证：工具栏出现图标、Chat Page 可打开、所有功能正常

**Firefox:**
1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击 "临时载入附加组件"
3. 选择 `dist/browser-agent-*-firefox/manifest.json`
4. 验证：工具栏出现图标、Chat Page 可打开、tabGroups 工具不出现

### 3.6 签名与发布准备

#### 3.6.1 Chrome Web Store

```bash
# Chrome 需要打包为 .crx 或提交 .zip
# 通过 Chrome Web Store Developer Dashboard 上传

# 生成私钥（首次）
# 注意：WXT 在 `wxt.config.ts` 中配置 key 路径
# 但实际提交 CWS 时，由 Google 管理签名，不需要本地私钥

# 提交命令（需要 Chrome Web Store API）
# 使用 chrome-webstore-upload-cli
npx chrome-webstore-upload-cli upload \
  --source dist/browser-agent-*-chrome.zip \
  --extension-id $EXTENSION_ID \
  --client-id $CLIENT_ID \
  --client-secret $CLIENT_SECRET \
  --refresh-token $REFRESH_TOKEN
```

#### 3.6.2 Firefox Add-ons (AMO)

```bash
# Firefox 需要通过 AMO 签名
# 使用 web-ext sign 命令

npx web-ext sign \
  --source-dir dist/browser-agent-*-firefox/ \
  --api-key $AMO_API_KEY \
  --api-secret $AMO_API_SECRET \
  --channel unlisted  # 或 listed
```

**CI 中集成签名（release workflow）:**
```yaml
- name: Sign Firefox
  if: startsWith(github.ref, 'refs/tags/v')
  run: |
    npx web-ext sign \
      --source-dir dist/browser-agent-*-firefox/ \
      --api-key ${{ secrets.AMO_API_KEY }} \
      --api-secret ${{ secrets.AMO_API_SECRET }} \
      --channel listed
```

---

## 4. 接口/契约

### 4.1 构建产物

| 产物 | 路径 | 说明 |
|------|------|------|
| Chrome 构建目录 | `dist/browser-agent-{version}-chrome/` | 未压缩，可直接加载 |
| Firefox 构建目录 | `dist/browser-agent-{version}-firefox/` | 未压缩，可直接加载 |
| Chrome zip | `dist/browser-agent-{version}-chrome.zip` | Chrome Web Store 提交用 |
| Firefox zip | `dist/browser-agent-{version}-firefox.zip` | AMO 提交用 |

### 4.2 构建命令

```json
{
  "scripts": {
    "dev": "wxt",
    "dev:chrome": "wxt -b chrome",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:chrome": "wxt build -b chrome",
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip",
    "zip:chrome": "wxt zip -b chrome",
    "zip:firefox": "wxt zip -b firefox",
    "build:all": "bash scripts/build-all.sh",
    "verify:manifest": "bash scripts/verify-manifest.sh",
    "check:size": "bash scripts/check-size.sh",
    "pre-release": "npm run test && npm run build:all && npm run check:size && npm run verify:manifest"
  }
}
```

### 4.3 环境变量

CI 中需要的 secrets：

| Secret | 用途 |
|--------|------|
| `AMO_API_KEY` | Firefox Add-ons 签名 API Key |
| `AMO_API_SECRET` | Firefox Add-ons 签名 API Secret |
| `CWS_CLIENT_ID` | Chrome Web Store API Client ID |
| `CWS_CLIENT_SECRET` | Chrome Web Store API Client Secret |
| `CWS_REFRESH_TOKEN` | Chrome Web Store API Refresh Token |
| `EXTENSION_ID` | Chrome Web Store 扩展 ID |

---

## 5. 测试指引

### 5.1 构建验证

```bash
# 清理 + 全量构建
npm run build:all

# 检查体积
npm run check:size

# 验证 Manifest 差异
npm run verify:manifest
```

### 5.2 手动加载验证

```bash
# Chrome
npm run build:chrome
# 打开 chrome://extensions/ → 加载已解压 → 选择 dist/browser-agent-*-chrome/

# Firefox
npm run build:firefox
# 打开 about:debugging → 临时载入 → 选择 dist/browser-agent-*-firefox/manifest.json
```

### 5.3 验证清单

| 验证项 | Chrome | Firefox |
|--------|--------|---------|
| 扩展正常加载 | □ | □ |
| 工具栏图标显示 | □ | □ |
| Chat Page 打开 | □ | □ |
| 标签页查询 | □ | □ |
| 标签页关闭（含确认） | □ | □ |
| Tab Groups 操作 | □ | N/A |
| 书签搜索 | □ | □ |
| 历史搜索 | □ | □ |
| Cookie 操作 | □ | □ |
| Side Panel | □ | N/A |
| Provider 配置保存 | □ | □ |
| 消息持久化（刷新不丢） | □ | □ |
| Console 无错误 | □ | □ |

---

## 6. 验收标准

- [ ] `npm run build:chrome` 成功，产出完整构建目录
- [ ] `npm run build:firefox` 成功，产出完整构建目录
- [ ] `npm run zip` 生成两个 `.zip` 文件
- [ ] Chrome zip 体积 < 2MB
- [ ] Firefox zip 体积 < 2MB
- [ ] Chrome manifest 包含 `side_panel`、`tabGroups`
- [ ] Firefox manifest 不含 `side_panel`、`tabGroups`，包含 `browser_specific_settings.gecko.id`
- [ ] Chrome 浏览器手动加载扩展，所有功能正常
- [ ] Firefox 浏览器手动加载扩展，所有功能正常（tabGroups 工具不出现）
- [ ] CI build workflow 通过（测试 → 构建 → 体积检查 → E2E）
- [ ] Release workflow 正确产出 zip artifacts

---

## 7. 注意事项

1. **Firefox MV3 限制:** Firefox 的 MV3 支持仍在完善中（截至 2026 年）。`service_worker` 在 Firefox MV3 中行为可能与 Chrome 不同。WXT 会自动处理 `background.scripts` vs `background.service_worker` 的差异。如果遇到问题，考虑 Firefox 使用 `background.scripts` 模式（WXT 默认行为）。
2. **扩展 ID:** Chrome 的扩展 ID 由私钥哈希决定。开发模式下每次加载解压扩展 ID 可能变化。E2E 测试中需要在构建后读取 manifest.json 中的固定 ID（如果配置了）或通过 `chrome.management` API 动态获取。
3. **Content Security Policy:** WXT 生成的 manifest 会自动设置 CSP。确保不使用 `eval`、`inline script`。TailwindCSS 4 不使用 `unsafe-inline`（CSS 通过 JS 注入），CSP 合规。
4. **包体积:** 注意 `react-dom` 约 130KB gzipped。React + ReactDOM + TailwindCSS + idb 总 gzip 约 160KB。加上业务代码、工具定义等，zip 总大小应在 500KB-1.5MB 之间，远低于 2MB 限制。如果超过，检查是否打包了不必要的依赖（如 `@mozilla/readability` 被错误打包到 Chat Page）。
5. **WXT 版本锁定:** 建议在 `package.json` 中锁定 WXT 版本（如 `"wxt": "~0.19.0"`），避免大版本升级导致构建配置不兼容。
6. **多语言支持:** MVP 不做国际化，但保留 `_locales/` 目录结构以便后续扩展。
7. **签名流程:** Chrome Web Store 和 Firefox AMO 的签名流程在 CI 中仅针对 tag 推送触发。日常 PR 构建不需要签名。
8. **Firefox 权限:** Firefox 对某些权限的审核更严格。`clipboardRead`/`clipboardWrite` 在 Firefox 中可能需要用户在 `about:addons` 中手动授权。提交 AMO 时需要提供详细的权限使用说明。
