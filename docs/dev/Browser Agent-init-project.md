# 开发文档: T1 - WXT 项目骨架初始化 + 构建配置

**Project:** Browser Agent
**Task ID:** T1
**Slug:** init-project
**Issue:** #1
**类型:** infrastructure
**Batch:** 1
**依赖:** 无

## 1. 目标

初始化 WXT 扩展项目骨架，配置 TypeScript strict、TailwindCSS 4、ESLint + Prettier，支持 Chrome/Firefox 双构建。

## 2. 前置条件

- Node.js >= 20.x
- npm >= 10.x
- 全局无特殊依赖

## 3. 实现步骤

### 3.1 项目初始化

```bash
npm create wxt@latest browser-agent-extension -- --template react
cd browser-agent-extension
```

WXT 模板会自动生成基础目录结构。创建完成后调整 `package.json`。

**文件: `package.json`**

关键字段（参考技术方案 10.2）：

```json
{
  "name": "browser-agent-extension",
  "version": "0.1.0",
  "type": "module",
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
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write 'src/**/*.{ts,tsx,css,json}'",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@mozilla/readability": "^0.5.0",
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "wxt": "^0.19.0",
    "typescript": "^5.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.45.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint-plugin-react-hooks": "^4.6.0"
  }
}
```

### 3.2 WXT 配置

**文件: `wxt.config.ts`**

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: 'dist',

  manifest: ({ browser }) => ({
    name: 'Browser Agent',
    description: 'AI-powered browser agent extension',
    permissions: [
      'tabs',
      'windows',
      'storage',
      'sessions',
      'scripting',
      'alarms',
      ...(browser === 'chrome'
        ? ['tabGroups', 'sidePanel', 'clipboardRead', 'clipboardWrite', 'notifications', 'contextMenus']
        : []),
    ],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Browser Agent',
    },
    ...(browser === 'chrome'
      ? { side_panel: { default_path: 'sidepanel.html' } }
      : { browser_action: { default_title: 'Browser Agent' } }),
  }),

  vite: () => ({
    // TailwindCSS 4 通过 Vite 插件注入，此处无需额外配置
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }),
});
```

### 3.3 TypeScript 配置

**文件: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["chrome", "wxt/client", "wxt/browser"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

### 3.4 TailwindCSS 4 配置

**文件: `src/assets/tailwind.css`**

```css
@import "tailwindcss";
```

**文件: `vite.config.ts`** (如果 WXT 没有自动注入 TailwindCSS)

WXT 0.19+ 通过 `@tailwindcss/vite` 插件支持 TailwindCSS 4。确保 `wxt.config.ts` 的 `vite.plugins` 中注册。

### 3.5 ESLint 配置

**文件: `eslint.config.js`** (ESLint 9 flat config)

```js
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['dist/', 'node_modules/', '.wxt/'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
```

### 3.6 Prettier 配置

**文件: `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

### 3.7 目录结构

创建以下基础目录：

```
src/
├── entrypoints/
│   ├── background.ts          # 空骨架
│   ├── content.ts             # 空骨架
│   └── chat/
│       ├── index.html         # Chat Page 入口
│       └── main.tsx           # React 入口
├── adapters/                  # T3 填充
├── agent/                     # T15 填充
├── chat/                      # T17 填充
│   ├── components/
│   └── hooks/
├── conversation/              # T14 填充
├── content/                   # T16 填充
├── guardrail/                 # T12 填充
├── provider/                  # T13 填充
├── registry/                  # T6 填充
├── shared/
│   ├── types/                 # T2 填充
│   ├── jsonrpc/               # T4 填充
│   ├── db/                    # T5 填充
│   └── storage/               # T5 填充
├── tools/
│   ├── tabs/                  # T9 填充
│   ├── windows/               # T10 填充
│   ├── tabGroups/             # T11 填充
│   ├── page/                  # T16 填充
│   └── ...                    # T18 填充
└── assets/
    └── tailwind.css
```

### 3.8 入口骨架文件

**文件: `src/entrypoints/background.ts`**

```ts
export default defineBackground(() => {
  console.log('Browser Agent background service worker started');
});
```

**文件: `src/entrypoints/content.ts`**

```ts
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('Browser Agent content script injected');
  },
});
```

**文件: `src/entrypoints/chat/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Browser Agent</title>
    <link rel="stylesheet" href="@/assets/tailwind.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./main.tsx" type="module"></script>
  </body>
</html>
```

**文件: `src/entrypoints/chat/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';

function App() {
  return <div className="p-4 text-lg">Browser Agent</div>;
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
```

### 3.9 Vitest 配置

**文件: `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
  },
});
```

## 4. 接口/契约

本任务不定义新接口。产出的构建配置契约：

| 命令 | 产物 | 验证方式 |
|------|------|----------|
| `npm run dev` | 开发环境启动 | 终端输出无报错，Chrome 扩展加载成功 |
| `npm run dev:firefox` | Firefox 开发环境 | 终端输出无报错 |
| `npm run build` | `dist/chrome-mv3/` + `dist/firefox-mv3/` | 两个目录均有 manifest.json |
| `npm run zip` | `dist/*.zip` 两个 zip | 两个 zip 文件存在 |
| `npm run typecheck` | 类型检查 | `tsc --noEmit` 零错误 |

## 5. 测试指引

### 5.1 构建验证

```bash
# 1. 安装依赖
npm install

# 2. 类型检查
npm run typecheck
# 预期：零错误

# 3. 构建 Chrome
npm run build:chrome
ls dist/chrome-mv3/manifest.json
# 预期：manifest.json 存在

# 4. 构建 Firefox
npm run build:firefox
ls dist/firefox-mv3/manifest.json
# 预期：manifest.json 存在

# 5. 打包
npm run zip
ls dist/*.zip
# 预期：两个 zip 文件存在

# 6. ESLint
npm run lint
# 预期：零错误（空骨架不应该有 lint 错误）
```

### 5.2 Chrome 扩展加载验证

1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `dist/chrome-mv3/` 目录
5. 确认扩展图标出现在工具栏，点击弹出 Chat Page

### 5.3 Firefox 扩展加载验证

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击"临时载入附加组件"
3. 选择 `dist/firefox-mv3/manifest.json`
4. 确认扩展加载成功

## 6. 验收标准

- [ ] `npm run dev` 正常启动开发环境（Chrome）
- [ ] `npm run build` 产出 `dist/chrome-mv3/` 和 `dist/firefox-mv3/`
- [ ] `npm run zip` 产出两个 zip 文件
- [ ] TypeScript strict 模式编译零错误（`npm run typecheck`）
- [ ] ESLint + Prettier 配置生效（`npm run lint` 零错误）
- [ ] TailwindCSS 4 正常编译（Chat Page 可见 Tailwind 样式）
- [ ] 目录结构符合规范（`src/` 下包含所有模块目录）

## 7. 注意事项

- **WXT 版本**：锁定 `^0.19.0`，避免主版本差异。Firefox MV3 支持取决于 WXT 版本，如遇兼容问题，在 `wxt.config.ts` 中通过 `browser` 参数做条件判断。
- **TailwindCSS 4**：使用 `@tailwindcss/vite` 插件而非 PostCSS 配置，因为 WXT 基于 Vite。注意 TailwindCSS 4 的 `@import "tailwindcss"` 语法与 v3 的 `@tailwind base` 不同。
- **React 模板**：WXT 的 react 模板会自动安装 `@wxt-dev/module-react`，需要在 `wxt.config.ts` 的 `modules` 中声明。
- **路径别名**：`@/` 映射到 `src/`，需要在 `tsconfig.json` 和 `vite.config.ts`（或 `wxt.config.ts` 的 vite 配置）中同时配置。
- **ESLint 9**：使用 flat config（`eslint.config.js`），与 ESLint 8 的 `.eslintrc` 格式不同。
- **Chrome 类型**：安装 `@types/chrome` 以获得 `chrome.*` API 的类型支持。WXT 同时提供 `wxt/client` 和 `wxt/browser` 类型。
- **Firefox manifest 差异**：`tabGroups`、`sidePanel`、`clipboardRead`、`clipboardWrite`、`notifications`、`contextMenus` 权限仅在 Chrome manifest 中声明。`wxt.config.ts` 通过 `browser` 参数做条件判断。
