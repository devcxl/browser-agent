# PR #21 审查报告：T1: WXT 项目骨架初始化 + 构建配置

**审查日期**: 2026-06-20
**审查人**: OpenCode (AI Review)
**结论**: ✅ **APPROVE** — 无 Critical/High 问题

---

## 一、验证结果

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `tsc --noEmit` | ✅ 零错误 | Strict 模式通过 |
| `eslint src/` | ⚠️ 2 warnings | console 警告（骨架入口预期行为） |
| `wxt build -b chrome` | ✅ 成功 | 产出版本 chrome-mv3，169.25 kB |
| `wxt build -b firefox` | ✅ 成功 | 产出版本 firefox-mv2，169.1 kB |
| `wxt zip -b chrome` | ✅ 成功 | 产出 54.92 kB zip |
| `wxt zip -b firefox` | ✅ 成功 | 产出 54.84 kB zip |
| `vitest run` | ⚠️ 无测试文件 | 骨架阶段预期，jsdom 依赖待安装 |

---

## 二、变更文件清单（30 个新增文件）

### 核心配置文件
- `package.json` — 项目元数据 + 脚本 + 依赖声明
- `wxt.config.ts` — WXT 构建配置，Chrome/Firefox 差异化权限
- `tsconfig.json` — TypeScript strict 模式
- `vitest.config.ts` — 测试框架配置
- `eslint.config.js` — ESLint 9 flat config
- `.prettierrc` — 代码格式化配置

### 入口文件
- `src/entrypoints/background.ts` — Service Worker 入口
- `src/entrypoints/chat/index.html` — Chat 面板 HTML
- `src/entrypoints/chat/main.tsx` — Chat 面板 React 入口
- `src/entrypoints/content.ts` — Content Script 入口

### 基础设施
- `src/assets/tailwind.css` — TailwindCSS 4 入口
- 12 个 `.gitkeep` 文件 — 模块目录骨架

### 锁文件
- `package-lock.json` — npm 依赖锁定

---

## 三、逐项审查

### [SUGGESTION] `wxt.config.ts:27` — Firefox `browser_action` vs `action`
```typescript
...(browser === 'chrome'
  ? { side_panel: { default_path: 'sidepanel.html' } }
  : { browser_action: { default_title: 'Browser Agent' } }),
```
`manifest` 中已声明 `action`（通用属性），Firefox 分支覆盖为 `browser_action` 是正确的 MV2 兼容写法。`action` 和 `browser_action` 在同一个对象中通过展开运算符合并时，后者会覆盖前者，行为正确。

### [SUGGESTION] `eslint.config.js:1` — Flat config 导入方式
```javascript
import tseslint from '@typescript-eslint/eslint-plugin';
```
ESLint 9 flat config 推荐使用 `typescript-eslint` 包的 `config()` 辅助函数。当前手动注册 plugin 方式可用，但后续可考虑迁移到推荐写法（非阻塞）。

### [SUGGESTION] `vitest.config.ts` — `jsdom` 环境依赖
测试配置中 `environment: 'jsdom'`，但 `package.json` 中未声明 `jsdom` 依赖。当前无测试文件，不触发错误。添加第一个测试前需安装 `jsdom`。

### [SUGGESTION] `wxt.config.ts` — Firefox `data_collection_permissions` 警告
Firefox 构建输出以下警告：
```
WARN  Firefox requires data_collection_permissions for new extensions from November 3, 2025
```
若仅用于开发/内部使用，可忽略。若计划上架 Firefox Add-ons，需在 manifest 中添加 `data_collection_permissions` 声明。

### [INFO] `package.json` 版本号差异
- `wxt: ^0.20.26` — 已知兼容版本，功能正常 ✅
- `eslint-plugin-react-hooks: ^5.0.0` — v5 与 ESLint 9 兼容，v4 不兼容 ✅
- `@types/chrome: ^0.0.280` — 版本略旧但功能完整，不影响开发 ✅

### [INFO] `tsconfig.json` — `types` 数组
```json
"types": ["chrome", "wxt/browser"]
```
不包含 `wxt/client` 是因为 wxt 0.20.x 不提供独立声明文件，移除合理 ✅

---

## 四、安全检查

| 检查项 | 结果 |
|--------|------|
| 硬编码凭据 | ✅ 无 |
| SQL 注入风险 | ✅ 无数据库操作 |
| XSS 漏洞 | ✅ 无用户输入处理 |
| 路径遍历 | ✅ 无文件系统操作 |
| 敏感信息泄露 | ✅ 无 |

---

## 五、代码质量

| 检查项 | 结果 |
|--------|------|
| 大文件 (>800 行) | ✅ 最大文件 package-lock.json（自动生成） |
| 大函数 (>50 行) | ✅ 无 |
| 深层嵌套 | ✅ 最深 2 层 |
| console.log | ⚠️ 2 处（骨架入口，后续业务代码应移除） |
| 错误处理 | ✅ 无需要处理的异步操作 |

---

## 六、总结

PR #21 实现了 WXT 项目骨架初始化的所有目标：

- ✅ TypeScript strict 模式，零编译错误
- ✅ Chrome/Firefox 双构建产出正确
- ✅ ESLint + Prettier 配置生效
- ✅ TailwindCSS 4 正常编译
- ✅ 模块目录结构清晰合理
- ✅ 无安全风险
- ✅ 无越界修改

**建议**：
1. 添加第一个测试文件时，记得安装 `jsdom` 依赖
2. 后续业务代码中移除 console.log（当前骨架入口的 console 可保留至功能实现）
3. 若计划上架 Firefox Add-ons，处理 `data_collection_permissions` 警告

**审查结论**: APPROVE ✅
