# 研究报告：Chrome 扩展自动发布到 Chrome Web Store 的 CI/CD 方案

## 1. 研究结论摘要

本项目（browser-agent）已通过 **WXT** 构建，已有较完整的 CI（lint + test + build + package）和 Release（tag 触发 → 构建 → 发布 AMO → 创建 GitHub Release）pipeline。**核心缺失环节是 Chrome Web Store 的自动发布**。

**推荐方案：利用 WXT 内置的 `wxt submit` 命令，在现有 release.yml 中增加 CWS 发布步骤。** 这是与当前技术栈最匹配、维护成本最低的方案。

关键发现：
- Chrome Web Store API V2（2025 年 10 月发布）新增了 **Service Account 支持**，可以不用个人 OAuth 流程，更安全
- WXT `submit` 命令原生支持 Chrome / Firefox / Edge 三商店一键发布
- **V1 API 将于 2026 年 10 月 15 日停用**，需确保工具链支持 V2
- 2025 年 5 月新推出了 **Verified CRX Upload** 功能，可作为额外安全层

---

## 2. 背景与问题定义

### 2.1 目标

在 GitHub Actions 上实现 Chrome 扩展的自动构建、上传、发布到 Chrome Web Store，形成一个完整的 Release Pipeline。

### 2.2 项目现状

| 维度 | 状态 |
|------|------|
| 构建工具 | WXT ^0.21.0 |
| 目标浏览器 | Chrome (MV3) + Firefox (MV3) |
| 已有 CI | `ci.yml` - lint + test |
| 已有构建 | `build.yml` - lint → test → package (zip for chrome + firefox) |
| 已有发布 | `release.yml` - tag `v*` 触发，构建 + 发布 AMO + 创建 GH Release |
| 缺失 | **Chrome Web Store 自动发布** |

### 2.3 范围与限制

- 首次发布需**手动完成**（创建 Store Listing、提交审核），后续更新可自动化
- Google 要求启用 **两步验证** 才能使用 API 发布/更新扩展
- V1 API 将于 2026-10-15 停用，需关注工具链更新

---

## 3. 研究方法

- 来源类型：官方文档、GitHub Marketplace、开源项目、技术博客
- 搜索策略：多轮搜索（CWS API → WXT 集成 → GitHub Actions → 最佳实践 → 安全考量）
- 迭代次数：3 轮
- 局限性：WXT `submit` 底层依赖的 `chrome-webstore-upload` 包尚未确认是否已支持 CWS API V2

---

## 4. 关键发现

### 4.1 Chrome Web Store API 机制

#### API 版本演进

| 版本 | 发布时间 | 停用时间 | 关键区别 |
|------|----------|----------|----------|
| V1 | 2014 | **2026-10-15** | 需 OAuth 2.0 用户凭证 |
| V2 | **2025-10-15** | TBD | 支持 **Service Account**、百分比灰度发布、取消提交 |

来源: [CWS API Reference](https://developer.chrome.com/docs/webstore/api) (2025-10-13) · 来源评分: 权威性5/5，一手性5/5，时效性5/5
置信度: **高**

#### V2 新增重要能力

1. **Service Account 支持**（CI/CD 最需要）：创建 GCP Service Account，添加到 CWS Developer Dashboard 即可用，无需维护用户 Refresh Token
2. **百分比灰度发布**：> 10,000 周活用户的扩展可控制发布百分比
3. **取消待审核提交**：不再需要等待审核完成才能提交新版本
4. **查询已发布/草稿状态**：可分别获取已发布版本和待审核版本的信息

来源: [Introducing CWS API V2](https://developer.chrome.com/blog/cws-api-v2) (2025-10-15) · 来源评分: 权威性5/5，一手性5/5，时效性5/5
置信度: **高**

#### 认证方式对比

| 方式 | 适用场景 | 维护成本 | 安全性 |
|------|----------|----------|--------|
| **OAuth 2.0 用户凭证** (V1) | 个人开发者 | 中 - 需定期刷新 Token | 中 - 依赖个人账号 |
| **Service Account** (V2) | **CI/CD 推荐** | 低 - 密钥文件 + GCP 管理 | **高** - 非人类账号、独立权限 |
| **Verified CRX Upload** | 高安全需求场景 | 高 - 额外密钥管理 | **最高** - 防止凭证泄露后的未授权上传 |

来源: [CWS Service Account](https://developer.chrome.com/docs/webstore/service-accounts) (2025-10-15) · [Verified CRX Upload](https://developer.chrome.com/blog/extension-news-june-2025) (2025-06)
置信度: **高**

### 4.2 WXT `submit` 命令

WXT 内置了 `wxt submit` 命令，支持一键发布到三个商店：

```bash
# 交互式初始化（生成 .env.submit）
npx wxt submit init

# 发布（需要先 build + zip）
npx wxt submit --chrome-zip .output/*-chrome.zip

# 仅上传不提交审核
npx wxt submit --chrome-zip .output/*-chrome.zip --chrome-skip-submit-review

# Dry-run 测试凭证
npx wxt submit --dry-run --chrome-zip .output/*-chrome.zip
```

所需环境变量：

| 变量 | 用途 |
|------|------|
| `CHROME_EXTENSION_ID` | CWS 中扩展的 ID |
| `CHROME_CLIENT_ID` | Google OAuth Client ID |
| `CHROME_CLIENT_SECRET` | Google OAuth Client Secret |
| `CHROME_REFRESH_TOKEN` | OAuth Refresh Token |

来源: [WXT Publishing Guide](https://wxt.dev/guide/essentials/publishing) (2026年有效) · 来源评分: 权威性4/5，一手性5/5，时效性5/5
置信度: **高**

> ⚠️ **重要提示**：WXT `submit` 当前使用 [chrome-webstore-upload](https://github.com/fregante/chrome-webstore-upload) npm 包，该包目前使用 **CWS API V1**。Issue [#114](https://github.com/fregante/chrome-webstore-upload/issues/114) 正在跟踪 V2 升级。V1 在 2026-10-15 前仍可用，但建议关注更新。

### 4.3 可用的 GitHub Actions 方案对比

| 方案 | 方式 | 优势 | 劣势 | 推荐度 |
|------|------|------|------|--------|
| **WXT submit** | `npx wxt submit` | 与现有栈完全匹配、统一管理多商店、简单 | 依赖 WXT 版本、目前用 V1 API | ⭐⭐⭐⭐⭐ |
| `browser-actions/release-chrome-extension` | GitHub Action | 专注一件事、社区维护 | 额外依赖、不统一管理 | ⭐⭐⭐⭐ |
| `mnao305/chrome-extension-upload` | GitHub Action | 支持 publish flag | 更新频率一般 | ⭐⭐⭐ |
| `ExtensionNinja/extension-publish` | GitHub Action | upload/publish/testers 三种模式 | 非官方 | ⭐⭐⭐ |
| `puzzlers-labs/chrome-webstore-publish` | GitHub Action | 支持 CRX 签名、快速审核 | 功能偏重 | ⭐⭐⭐ |
| `fregante/chrome-webstore-upload-cli` | NPM CLI | 灵活、可与其他工具组合 | 需自行编写 CI 步骤 | ⭐⭐⭐⭐ |
| **原生 curl** | 直接调用 REST API | 无依赖、完全控制 | 需要自行处理 Token 刷新和错误 | ⭐⭐ |

来源: GitHub Marketplace 及各项目 README (2024-2026)
置信度: **高**

### 4.4 认证凭证获取流程

**前置条件**：
1. 注册 [Chrome Web Store 开发者账号](https://chrome.google.com/webstore/devconsole/)（一次性费用 $5 USD）
2. 手动完成**首次发布**（填写 Store Listing + Privacy，提交审核通过）
3. 获取 Extension ID（发布后从 Developer Dashboard 获取）

**方式 A：OAuth 2.0 用户凭证（WXT submit 当前方式）**

```
1. Google Cloud Console → 启用 Chrome Web Store API
2. 配置 OAuth 同意屏幕（External，用个人邮箱作为 Test User）
3. 创建 OAuth Client ID（Web Application）
   - Authorized redirect URI: https://developers.google.com/oauthplayground
4. 访问 OAuth Playground → Use your own OAuth credentials
   - Scope: https://www.googleapis.com/auth/chromewebstore
   - 授权 → Exchange authorization code for tokens
5. 获得 Refresh Token（永久有效）
6. 将 CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN / EXTENSION_ID 存入 GitHub Secrets
```

**方式 B：Service Account（推荐，V2 专属）**

```
1. Google Cloud Console → 启用 Chrome Web Store API
2. IAM → Service Account → 创建服务账号
3. 生成 JSON 密钥文件
4. Chrome Web Store Developer Dashboard → Account → 添加 Service Account Email
5. 在 CI 中通过 google-github-actions/auth 获取 Access Token
```

来源: [CWS Using API Guide](https://developer.chrome.com/docs/webstore/using-api) (2026-06-17) · [CWS Service Account](https://developer.chrome.com/docs/webstore/service-accounts) (2025-10-15)
置信度: **高**

### 4.5 安全性考量

| 风险 | 缓解措施 |
|------|----------|
| OAuth 凭证泄露 | 使用 GitHub Encrypted Secrets；定期轮换 Refresh Token |
| CI 流水线被攻击 | 限制 workflow 触发条件（仅 tag 触发） |
| **凭证泄露后未授权发布** | **启用 Verified CRX Upload**（2025 年 5 月新功能），要求上传必须用私钥签名 |
| Service Account 密钥泄露 | GCP IAM 最小权限原则、密钥自动轮换 |

⚠️ **Warning**：OAuth Refresh Token 不会过期，一旦泄露攻击者可无限期发布更新。**强烈建议启用 Verified CRX Upload**。

来源: [Verified CRX Upload](https://developer.chrome.com/blog/extension-news-june-2025) (2025-06) · [Google Cloud Threat Horizons H2 2025](https://cloud.google.com/security/report/resources/cloud-threat-horizons-report-h2-2025) (2025)
置信度: **高**

### 4.6 release-please 自动版本管理

如果希望从 Conventional Commits 自动生成版本号和 Changelog，可集成 release-please：

```json
// release-please-config.json
{
  "packages": {
    ".": {
      "release-type": "node",
      "extra-files": [
        {
          "type": "json",
          "path": "package.json",
          "jsonpath": "$.version"
        }
      ]
    }
  }
}
```

由于 WXT 的 version 直接读取 `package.json`，不需要额外更新 manifest.json。release-please 自动创建 Release PR → merge 后触发发布 workflow。

来源: [release-please + CWS](https://zenn.dev/atani/articles/chrome-extension-auto-publish-guide) (2025) · 来源评分: 一手性3/5
置信度: **中**（取决于项目的 commit 规范程度）

---

## 5. 对比分析

### 方案推荐排序

| 方案 | 复杂度 | 维护成本 | 灵活性 | 与现有栈匹配度 | 总评 |
|------|--------|----------|--------|---------------|------|
| **1. WXT submit 集成到 release.yml** | ⭐ 低 | ⭐ 低 | ⭐⭐⭐ 中 | ⭐⭐⭐⭐⭐ | **最佳** |
| 2. 单独 GitHub Action | ⭐⭐ 中 | ⭐⭐ 中 | ⭐⭐⭐⭐ 高 | ⭐⭐⭐ 中 | 可选 |
| 3. 原生 curl + Service Account | ⭐⭐⭐⭐ 高 | ⭐⭐⭐ 中 | ⭐⭐⭐⭐⭐ 高 | ⭐⭐ 低 | 需定制时采用 |

### 元数据管理（简介、描述、Changelog 等）

这是一个关键问题。`wxt submit`（底层 `publish-browser-extension` v5.1.0）**只负责上传扩展包和提交审核，不管理商店展示元数据**。

#### 两个商店的元数据管理方式

| 元数据项 | Chrome Web Store | Firefox AMO |
|---------|-----------------|-------------|
| 扩展名称/描述 | CWS Dashboard | AMO Dashboard |
| 分类 (Categories) | CWS Dashboard | AMO Dashboard |
| 截图/宣传图 | CWS Dashboard | AMO Dashboard |
| 图标 | 在 `manifest.json` 中定义 | 在 `manifest.json` 中定义 |
| 隐私政策/权限说明 | CWS Dashboard | AMO Dashboard |
| 开发者信息/网站 | CWS Dashboard | 可通过 `amo-metadata.json`（web-ext）|
| Changelog / Release Notes | CWS Dashboard（手动填写） | AMO Dashboard（自动生成或手动） |
| 许可证 | 不展示 | 可通过 `amo-metadata.json`（web-ext）|

**关键结论**：无论你用什么工具提交，**商店元数据都不在提交 API 的管理范围内**。即使是 web-ext 的 `--amo-metadata`，也只是在首次提交时设置初始值。

#### 那 amo-metadata.json 还有用吗？

现有项目中的 `amo-metadata.json` 实际作用是：通过 `web-ext sign --amo-metadata` 在**首次提交**时一次性设置 AMO 商店的展示信息。后续更新时，web-ext 会忽略元数据文件中的大部分字段。

如果换成 WXT submit：
- **首次发布**：直接在 AMO Developer Dashboard 填写（只需一次）
- **后续更新**：无需关心元数据，dashboard 中已设置好的保持不变
- `amo-metadata.json` 可以作为**元数据备份**放在仓库中，但不再通过 CI 自动应用

> **类比**：wxt submit 做的事情等同于你在 CWS Dashboard 点"Upload new package"上传 zip，然后点"Submit for Review"。它不替你填描述、传截图。

#### Changelog / Release Notes 怎么处理？

| 场景 | 处理方式 |
|------|----------|
| **Chrome Release Notes** | CWS Dashboard → Package 标签 → 每次提交时手动填写。或保持空，CWS 会显示版本号 |
| **AMO Release Notes** | AMO Dashboard 中编辑版本，WXT submit 不会自动填充。目前无 API 支持自动设置 |
| **GitHub Release Notes** | 现有 release.yml 已经有基于 git log 自动生成，这不受影响 |

如果想自动化 Release Notes，目前没有 API 支持设置到商店中。可行的变通方案：
- 在 CWS/AMO Dashboard 中保持 Release Notes 为空（仅显示版本号）
- 详细 Changelog 通过 **GitHub Release** 展示（当前已有）
- 在扩展内部显示更新日志（通过 `chrome.runtime.onInstalled` + 存储上一次版本号）

### 深度对比：混合方案 vs 统一 WXT submit

| 对比维度 | 混合方案（当前） | 统一 WXT submit |
|----------|----------------|-----------------|
| **Chrome 发布** | `npx wxt submit --chrome-zip` | `npx wxt submit --chrome-zip` |
| **Firefox 发布** | `npx web-ext sign`（独立工具） | `npx wxt submit --firefox-zip --firefox-sources-zip` |
| **CI 步骤数** | 2 步（web-ext + wxt submit） | **1 步** |
| **维护复杂度** | 维护两套 CLI 参数和凭证格式 | **一套命令，统一凭证命名** |
| **Store Listing 元数据** | 通过 `--amo-metadata amo-metadata.json` 更新 | ❌ 无等效参数，需在 AMO Dashboard 手动维护 |
| **Firefox 源码上传** | `--upload-source-code` 显式上传 | `--firefox-sources-zip` 等效 |
| **Firefox channel 控制** | `--channel=listed` | `--firefox-channel listed` ✅ 等效 |
| **凭证变量** | `AMO_JWT_ISSUER` + `AMO_JWT_SECRET` | `FIREFOX_JWT_ISSUER` + `FIREFOX_JWT_SECRET`（仅命名差异） |
| **底层工具** | Mozilla 官方 `web-ext`（成熟） | `publish-browser-extension` npm 包（较新） |
| **Edge Addons** | 不支持 | ✅ `--edge-zip` 原生支持 |

#### WXT submit 的 Firefox 能力清单

WXT submit（底层使用 [publish-browser-extension](https://www.npmjs.com/package/publish-browser-extension)）支持以下 Firefox 参数：

| 参数 | 作用 | 与 web-ext 对应 |
|------|------|-----------------|
| `--firefox-zip` | 扩展构建产物 ZIP | `web-ext build` 产物 |
| `--firefox-sources-zip` | 源码 ZIP（MV3 要求） | `--upload-source-code` |
| `--firefox-extension-id` | AMO 扩展 ID | 内置在 `manifest.json` |
| `--firefox-jwt-issuer` | AMO API Key | `--api-key` |
| `--firefox-jwt-secret` | AMO API Secret | `--api-secret` |
| `--firefox-channel` | `listed` / `unlisted` | `--channel` |

来源: [WXT CLI 参考 - wxt submit init](https://wxt.dev/api/cli/wxt-submit-init) (2026) · 置信度: **高**

#### 缺失的功能

**`--amo-metadata` 不支持**：当前 release.yml 使用 `--amo-metadata amo-metadata.json` 在提交时更新商店展示信息（名称、描述、分类、开发者备注等）。WXT submit 没有等效参数。这意味着：
- 首次提交后，元数据在 AMO Developer Dashboard 中维护
- 后续更新不会自动同步 `amo-metadata.json` 中的变更
- **影响评估**：对于已发布的扩展，大多数元数据只需设置一次，后续更新很少修改。这通常不是问题。

#### 结论：建议统一

```
Merge to master → 打 tag v* →
  ┌─ CI: lint + test + typecheck
  ├─ Build: wxt zip (chrome + firefox) + 生成 sources.zip
  ├─ Submit: wxt submit → CWS + AMO + Edge (可选)   ← 一行搞定
  ├─ GitHub Release: draft release with zips (已有)
  └─ Notify: (可选)
```

**推荐理由**：
1. **减少维护量**：一套 CI 步骤替代两套，新成员只需理解 WXT
2. **一致的错误处理**：`wxt submit` 对三个商店返回一致的退出码和日志
3. **扩展性好**：想加 Edge Addons 只需加个 `--edge-zip` 参数，无需新工具
4. **未来兼容**：WXT 社区活跃，CWS API V2 升级会由框架处理

---

## 6. 反方观点与分歧

### 6.1 WXT submit 稳定性

- **担忧**：WXT 的 submit 功能相对较新，可能在边界情况不完善
- **事实**：WXT 已是 ^0.21.0 版本，submit 功能已有多项目使用（[aklinker1/github-better-line-counts](https://github.com/aklinker1/github-better-line-counts), [GuiEpi/plex-skipper](https://github.com/GuiEpi/plex-skipper) 等）
- **结论**：功能已经过验证，风险可控

### 6.2 为什么不用独立的 GitHub Action

- **观点**：专用 Action 可能更稳定、功能更全
- **事实**：WXT submit 本质上也是调用 chrome-webstore-upload CLI，与专用 Action 底层相同
- **优势**：WXT 方案可以一键同时发布 Chrome + Firefox + Edge，而独立 Action 需要分别配置

### 6.3 是否需要 Service Account

- **V1 现状**：WXT submit 目前使用 OAuth 用户凭证，不支持 Service Account
- **V2 计划**：chrome-webstore-upload 正在更新 V2（Issue #114），届时将支持 Service Account
- **权衡**：OAuth 用户凭证在 2026-10-15 前完全可用；Service Account 是更安全的长期方案

### 6.4 审核周期

- **误解**：自动发布 = 立即上线
- **事实**：无论 API 还是手动，CWS 都需要审核（通常 1-3 天）
- **影响**：发布流程可以自动化，但上线有时间延迟

---

## 7. 风险与不确定性

### 7.1 不确定信息

| 不确定项 | 影响 | 验证方式 |
|----------|------|----------|
| WXT 对 CWS API V2 的支持时间线 | 如不及时更新，2026-10 后无法使用 | 关注 [wxt-dev/wxt](https://github.com/wxt-dev/wxt) Release Notes |
| AMO 审核是否能完全自动化 | 现有 web-ext sign 使用 JWT | 已跑通，风险低 |
| 新增权限是否需要手动更新 Store Listing | 自动 publish 可能失败 | 增加 --chrome-skip-submit-review 手动控制 |

### 7.2 最坏情况分析

**场景**：CI 流水线凭证泄露，攻击者通过 GitHub Actions 发布恶意版本
- **影响范围**：所有 Chrome 用户
- **可回滚性**：CWS Developer Dashboard 可立即下架
- **缓解**：
  1. 启用 **Verified CRX Upload**（需私钥签名，仅 CI 有私钥也能防止未授权上传）
  2. GitHub Secrets 定期轮换
  3. workflow 仅允许特定 tag 触发
  4. Draft Release（人工审核后再发布）

### 7.3 元评审

- **剩余未知**：chrome-webstore-upload 对 V2 API 的具体支持时间
- **最弱证据**：release-please 集成方案未在本项目验证
- **可能错误的假设**：假设 WXT submit 在 CI 环境中与本地行为一致
- **遗漏的角度**：Edge Addons 自动发布（WXT submit 也支持 `--edge-zip`）

---

## 8. 建议

### 8.1 立即行动：改造 release.yml，统一使用 wxt submit

**推荐将现有的 Firefox web-ext 和新增的 Chrome 发布统一为 WXT submit**。改造后的核心步骤：

```yaml
# 在 build 和 zip 步骤之后，替换原有的 web-ext sign + 新增的 CWS 步骤
- name: Submit to stores
  env:
    # Chrome
    CHROME_EXTENSION_ID: ${{ secrets.CHROME_EXTENSION_ID }}
    CHROME_CLIENT_ID: ${{ secrets.CHROME_CLIENT_ID }}
    CHROME_CLIENT_SECRET: ${{ secrets.CHROME_CLIENT_SECRET }}
    CHROME_REFRESH_TOKEN: ${{ secrets.CHROME_REFRESH_TOKEN }}
    # Firefox
    FIREFOX_EXTENSION_ID: ${{ secrets.FIREFOX_EXTENSION_ID }}
    FIREFOX_JWT_ISSUER: ${{ secrets.FIREFOX_JWT_ISSUER }}
    FIREFOX_JWT_SECRET: ${{ secrets.FIREFOX_JWT_SECRET }}
  run: |
    npx wxt submit \
      --chrome-zip dist/*-chrome.zip \
      --chrome-skip-submit-review \
      --firefox-zip dist/*-firefox.zip \
      --firefox-sources-zip dist/*-sources.zip \
      --firefox-channel listed
```

> **关于 `--chrome-skip-submit-review`**：首次集成时建议添加，仅上传不提交审核，确认流程稳定后再移除实现全自动发布。
>
> **关于 `amo-metadata.json`**：切换后该文件不再通过 CI 自动应用。如果后续需要更新 AMO 商店元数据（描述、分类等），需在 AMO Developer Dashboard 手动操作。

#### 完整改造后的 release.yml 结构

```yaml
# .github/workflows/release.yml (改造后)
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run test:run
      - run: npm run typecheck

      # 构建 Chrome + Firefox + 源码 ZIP
      - run: npx wxt zip -b chrome
      - run: npx wxt zip -b firefox --mv3

      # 统一提交两个商店
      - name: Submit to Chrome & Firefox stores
        env:
          CHROME_EXTENSION_ID: ${{ secrets.CHROME_EXTENSION_ID }}
          CHROME_CLIENT_ID: ${{ secrets.CHROME_CLIENT_ID }}
          CHROME_CLIENT_SECRET: ${{ secrets.CHROME_CLIENT_SECRET }}
          CHROME_REFRESH_TOKEN: ${{ secrets.CHROME_REFRESH_TOKEN }}
          FIREFOX_EXTENSION_ID: ${{ secrets.FIREFOX_EXTENSION_ID }}
          FIREFOX_JWT_ISSUER: ${{ secrets.FIREFOX_JWT_ISSUER }}
          FIREFOX_JWT_SECRET: ${{ secrets.FIREFOX_JWT_SECRET }}
        run: |
          npx wxt submit \
            --chrome-zip dist/*-chrome.zip \
            --firefox-zip dist/*-firefox.zip \
            --firefox-sources-zip dist/*-sources.zip \
            --firefox-channel listed

      # 生成 Release Notes + Draft Release（保留现有逻辑）
      - name: Generate release notes
        # ... 保留现有脚本

      - name: Create draft release
        uses: softprops/action-gh-release@v2
        with:
          files: dist/*.zip
```

> 现有 release.yml 中的 AMO secrets 检测、源码压缩、web-ext sign 等步骤均可移除，大幅简化。

#### 版本兼容性检查

| 检查项 | 状态 |
|--------|------|
| 当前 WXT 版本 | ^0.21.0 ✅ |
| 是否支持 submit 命令 | 是（自 wxt 0.18+） ✅ |
| Firefox 支持 channel 参数 | 是 ✅ |
| 能否同时传 chrome + firefox 参数 | 是 ✅ |

### 8.2 短期（本周）

1. **注册 CWS 开发者账号**（$5 USD）
2. **手动完成首次发布**（填写 Store Listing + Privacy → 提交审核）
3. 记录 Extension ID
4. **获取 OAuth 凭证**（参考 4.4 方式 A）
5. 将 4 个 secrets 存入 GitHub：`CHROME_EXTENSION_ID` / `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` / `CHROME_REFRESH_TOKEN`
6. 先运行 `wxt submit --dry-run` 验证凭证

### 8.3 中期（1-2 个月）

1. 移除 `--chrome-skip-submit-review` 实现全自动发布
2. 关注 [chrome-webstore-upload #114](https://github.com/fregante/chrome-webstore-upload/issues/114) 的 V2 更新，升级后切换到 Service Account
3. **启用 Verified CRX Upload** 增强安全性
4. 考虑集成 Edge Addons 发布（`--edge-zip` 参数）

### 8.4 远期（可选）

1. 集成 **release-please** 实现 Conventional Commits → 自动版本号 + Changelog
2. 将单步 `submit` 拆分为 upload + publish 两步，支持灰度发布
3. 通过 CWS API V2 的 `cancelSubmission` 实现失败的自动回滚

### 8.5 所需 GitHub Secrets

统一方案需要以下 Secrets：

| Secret 名称 | 用途 | 来源 | 当前是否已有 |
|------------|------|------|-------------|
| `CHROME_EXTENSION_ID` | CWS 扩展 ID | CWS Developer Dashboard | ❌ 新增 |
| `CHROME_CLIENT_ID` | Google OAuth Client ID | Google Cloud Console | ❌ 新增 |
| `CHROME_CLIENT_SECRET` | Google OAuth Client Secret | Google Cloud Console | ❌ 新增 |
| `CHROME_REFRESH_TOKEN` | OAuth Refresh Token | OAuth Playground | ❌ 新增 |
| `FIREFOX_EXTENSION_ID` | AMO 扩展 ID | AMO Developer Hub | ✅ 已有（`amo-metadata.json` 中 gecko id） |
| `FIREFOX_JWT_ISSUER` | AMO API Key (JWT Issuer) | [AMO API Credentials](https://addons.mozilla.org/en-US/developers/addon/api/key/) | ✅ 已有（原名 `AMO_JWT_ISSUER`） |
| `FIREFOX_JWT_SECRET` | AMO API Secret (JWT Secret) | 同上 | ✅ 已有（原名 `AMO_JWT_SECRET`） |

> 如果保留 `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` 命名不变，可在 CI 步骤中通过 `env:` 映射为 `FIREFOX_JWT_ISSUER` / `FIREFOX_JWT_SECRET`，避免重新配置 Secrets。

---

## 9. 参考来源

| # | 标题 | URL | 发布者 | 时间 |
|---|------|-----|--------|------|
| 1 | CWS API Reference | https://developer.chrome.com/docs/webstore/api | Chrome for Developers | 2025-10-13 |
| 2 | Use the Chrome Web Store API | https://developer.chrome.com/docs/webstore/using-api | Chrome for Developers | 2026-06-17 |
| 3 | Use a Service Account with CWS API | https://developer.chrome.com/docs/webstore/service-accounts | Chrome for Developers | 2025-10-15 |
| 4 | Introducing CWS API V2 | https://developer.chrome.com/blog/cws-api-v2 | Chrome for Developers | 2025-10-15 |
| 5 | WXT Publishing Guide | https://wxt.dev/guide/essentials/publishing | WXT Team | 2026 |
| 6 | Verified CRX Upload | https://developer.chrome.com/blog/extension-news-june-2025 | Chrome for Developers | 2025-06 |
| 7 | chrome-webstore-upload CLI | https://github.com/fregante/chrome-webstore-upload-cli | fregante | 2024-2026 |
| 8 | chrome-webstore-upload V2 Issue | https://github.com/fregante/chrome-webstore-upload/issues/114 | fregante | 2025 |
| 9 | Automating CWS Publish (Zenn) | https://zenn.dev/atani/articles/chrome-extension-auto-publish-guide | atani | 2025 |
| 10 | browser-actions/release-chrome-extension | https://github.com/browser-actions/release-chrome-extension | browser-actions | 2024-2026 |
| 11 | Publish Chrome extension (Marketplace) | https://github.com/marketplace/actions/publish-chrome-extension-to-chrome-web-store | nkrusch | 2024-2026 |
| 12 | TurboStarter CWS Publishing | https://www.turbostarter.dev/docs/extension/publishing/chrome | TurboStarter | 2025-2026 |
| 13 | Google Cloud Threat Horizons H2 2025 | https://cloud.google.com/security/report/resources/cloud-threat-horizons-report-h2-2025 | Google Cloud | 2025 |
