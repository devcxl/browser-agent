# ADR: Chrome Web Store 自动发布改用 API v2 + 服务账号

- **日期**: 2026-10-01
- **状态**: Implemented
- **相关**: [CWS 自动发布调研记录](../auto-publish-research.md) · `chatgpt-markdown-exporter` 的 `AGENTS.md`（配置步骤的权威来源）

---

## 背景

Chrome Web Store API v1.1 于 **2026-10-15 停用**，而本仓库的 `.github/workflows/publish-stores.yml` 当时用 `wxt submit` 提交 Chrome，参数是 v1.1 的 `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` / `CHROME_REFRESH_TOKEN`（OAuth 刷新令牌）。

调研阶段（`docs/auto-publish-research.md`）记录过一个附加风险：OAuth 同意屏幕若停留在「测试」状态，刷新令牌 7 天即失效，CI 会在某个时间点静默变成红色。

实现阶段又发现两个具体障碍：

1. `wxt submit` 是 `publish-browser-extension` 的别名转发，而 wxt 0.21.0 声明的依赖范围解析到 **4.0.5**，该版本不支持 v2 参数；能否用上 v2 取决于 wxt 的传递依赖版本，不可控。
2. 把私钥/令牌拼进命令行参数会出现在进程 argv 里，共享 runner 上没有必要。

## 决策

1. **认证改用 GCP 服务账号**。CWS API v2 原生支持服务账号，Google 明确推荐用于 CI/CD，令牌不过期、无需人工授权流程。凭证为 `CHROME_PUBLISHER_ID` + `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` + `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`，服务账号不做任何 IAM 授权，权限全部来自开发者后台的绑定。
2. **三个仓库统一用 `wxt submit` 提交，CLI 版本靠「直接 devDependency + 包管理器 overrides」锁定在 `^6.1.1`**，并固定 `--chrome-api-version v2`。`wxt submit` 是零成本的 CLI 透传入口，但它加载哪个版本取决于 wxt 自己声明的依赖范围（见方案 B），因此 override 是这套方案的必要组成，不是可选项。
3. **凭证经环境变量传入**（该 CLI 原生读取 `CHROME_*` 环境变量），不进入 argv。
4. **私钥必须是带真实换行的 PEM**。workflow 增加前置校验，把「拷贝 JSON 里的字面量 `\n`」这类错误拦在提交前，而不是等到签名时报 `DECODER routines::unsupported`。
5. **Chrome 与 Firefox 提交拆成两个独立步骤**，各自判定凭证是否齐备，互不影响。

提交语义保持不变：仍使用 `--chrome-skip-submit-review`，即只上传、不提交审核。

## 替代方案

### 方案 A：保留 v1.1 + OAuth 刷新令牌

不采用。v1.1 已于 2026-10-15 停用；且测试态同意屏幕的刷新令牌 7 天失效，会让 CI 间歇性失败。

### 方案 B：升级 wxt，让 CLI 版本由 wxt 的依赖范围决定

不采用（但其中的关键事实决定了最终方案）。

`wxt submit` 的实现只是 `await import('publish-browser-extension/cli')`，按 wxt **自身的模块解析路径**加载 CLI，所以实际生效的版本由 wxt 声明的依赖范围决定；项目里的直接依赖只在 wxt 允许的范围内参与选版。实测：wxt 0.21.0 的范围是 `^2.3.0 || ^3.0.2 || ^4.0.4`，即便项目已直接依赖 6.x，`wxt submit` 仍加载嵌套的 4.0.5，`--chrome-api-version v2` 直接报 `Unknown option --chromeApiVersion`。

于是把解析强制到 6.1.1 而不是升级 wxt：直接依赖声明 `^6.1.1`（npm 用 `overrides`，pnpm 用 `pnpm.overrides`）覆盖 wxt 范围内的旧版本。这样既保住了统一的 `wxt submit` 入口，又不动构建工具链。

升级 wxt 本身也能达到同样效果，但代价更高：把 `chatgpt-markdown-exporter` 升到 wxt 0.21.4 后，生成的 tsconfig 严格度变化导致约 10 个既有测试文件报 TS2532 / TS18048，影响面远超本次目标。`chatgpt-analytics` 的 wxt 0.21.4 范围已是 `^5.1.0 || ^6.0.0`，无需 override。

### 方案 C：改用 `chrome-webstore-upload-cli`

不采用。它已支持 v2 的 publisher 路径，但认证只支持 OAuth 刷新令牌，不支持服务账号，等于把方案 A 的失效风险留着。

## 影响

- **每个发布者只能绑定一个服务账号**（官方限制，换绑需先在后台删除旧的）。三个扩展同属一个发布者，因此共用同一套凭证；`8abf8c9c-...` 发布者下原先绑定的历史服务账号已解绑。
- 服务账号 JSON 密钥是长期凭证：本地备份不入库，GitHub 侧只放 PEM 私钥本身。
- `docs/auto-publish-research.md` 中的 v1.1 配置章节已成为历史记录，正文顶部加了实施更新提示。
- Chrome 上传仍会产生商店后台的待处理版本，需人工在后台提交审核（与改动前一致）。
- `overrides` 是对 wxt 声明范围的强制覆盖（wxt 只用到该包的 CLI 入口，不涉及内部 JS API）。若将来 wxt 把范围放宽到 6.x，可删掉 override，行为不变。

## 回退路径

v1.1 停用后没有等价的 API 回退路径。若 v2 提交出现故障，临时手段是在开发者后台手动上传 `.output/*-chrome.zip`；workflow 的 Chrome 步骤在凭证缺失时会跳过并给出 notice，不会阻塞 Firefox 发布。

## 后续行动

1. 三个仓库已统一：`wxt submit` 提交、CLI 锁在 `^6.1.1`（本仓库提交见本 ADR 所在 commit；`chatgpt-analytics` 为 `9c498a4`、`25dfb62`；`chatgpt-markdown-exporter` 的 `pnpm.overrides` 见对应 commit）。
2. 服务账号密钥按 Google 建议周期轮换（约 90 天），轮换时同步更新三个仓库的 `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`。

## 验证

- 三个扩展的 v2 `:fetchStatus` 直连返回 200。
- `npx wxt submit --dry-run --chrome-... --chrome-api-version v2` 在三个仓库均通过（都经 `wxt submit`，且各自解析到 6.1.1）；该 CLI 的「Validating credentials」阶段本身就是一次真实的 `:fetchStatus` 调用，不是本地格式检查。
- 版本解析实测：wxt 0.20.27 / 0.21.0 加 override 后 `wxt submit` 均由 4.0.5 变为 6.1.1（加 override 前 0.20.27 实测报 `Unknown option --chromeApiVersion`）。
- workflow 的凭证校验脚本按场景实跑：凭证齐备时 `chrome=true` 退出 0，缺字段 / 缺 zip / 全缺失时各自报错退出 1。
- PEM 守卫实测：真实 PEM 通过，字面量 `\n` 版本被拦截。
- `chatgpt-markdown-exporter` 侧加 override 后 wxt 保持 0.20.27，typecheck / lint / 367 个测试 / `build:all` 全通过。
