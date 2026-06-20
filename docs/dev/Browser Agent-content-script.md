# 开发文档: T16 - Content Script + Page Tools

**Project:** Browser Agent
**Task ID:** T16
**Slug:** content-script
**Issue:** #16
**类型:** backend
**Batch:** 6
**依赖:** T2 (define-types), T4 (jsonrpc-impl), T8 (background-infra)

## 1. 目标

实现 Content Script 的 JSON-RPC Handler，集成 `@mozilla/readability` 实现页面正文提取，实现选中文本读取和页面元数据提取。将 3 个 Page 工具注册到 ToolRegistry。Content Script 通过 `manifest.content_scripts` 声明式注入所有页面。

## 2. 前置条件

- [x] T2: `shared/types/jsonrpc.ts` 中的 JSON-RPC 协议类型已定义
- [x] T2: `shared/types/tool.ts` 中的 `ToolDefinition`、`ToolResult` 类型已定义
- [x] T4: JSON-RPC Client 和 Router 已实现
- [x] T8: `ContentBridge`（Background 端消息转发到 Content Script）已实现
- [x] `@mozilla/readability` 已安装（`npm install @mozilla/readability`）

## 3. 实现步骤

### 3.1 类型定义

Content Script 内部使用的类型：

```ts
// src/content/types.ts

/** page.getContent 返回结构 */
interface PageContent {
  title: string;
  textContent: string;
  excerpt: string;
  byline: string | null;
  siteName: string | null;
}

/** page.getSelection 返回结构 */
interface PageSelection {
  text: string;
  html?: string;
}

/** page.getMetadata 返回结构 */
interface PageMetadata {
  title: string;
  url: string;
  description: string | null;
  ogImage: string | null;
}
```

### 3.2 Content Script 入口 — JSON-RPC Handler

**文件:** `src/content/index.ts`

**关键设计：**
- Content Script 通过 `browser.runtime.onConnect` 监听来自 Background 的连接
- 接收 JSON-RPC 请求，路由到对应 handler
- 返回 JSON-RPC 响应

```ts
// src/content/index.ts

import { ReadabilityExtractor } from './readability-extractor';
import { SelectionReader } from './selection-reader';
import { MetadataReader } from './metadata-reader';
import type { JsonRpcRequest, JsonRpcResponse } from '../shared/types/jsonrpc';

// 使用 WXT 的 browser API
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const readabilityExtractor = new ReadabilityExtractor();
    const selectionReader = new SelectionReader();
    const metadataReader = new MetadataReader();

    // 监听来自 Background 的连接
    browser.runtime.onConnect.addListener((port) => {
      if (port.name !== 'content-script-bridge') return;

      port.onMessage.addListener(async (message: JsonRpcRequest) => {
        const { id, method, params } = message;

        try {
          const result = await handleMethod(method, params ?? {});
          const response: JsonRpcResponse = {
            jsonrpc: '2.0',
            id,
            result,
          };
          port.postMessage(response);
        } catch (error) {
          const response: JsonRpcResponse = {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: (error as Error).message,
            },
          };
          port.postMessage(response);
        }
      });
    });

    async function handleMethod(
      method: string,
      params: Record<string, unknown>,
    ): Promise<unknown> {
      switch (method) {
        case 'page.getContent':
          return readabilityExtractor.extract();

        case 'page.getSelection':
          return selectionReader.getSelection();

        case 'page.getMetadata':
          return metadataReader.getMetadata();

        default:
          throw new Error(`未知方法: ${method}`);
      }
    }
  },
});
```

### 3.3 Readability 正文提取器

**文件:** `src/content/readability-extractor.ts`

```ts
// src/content/readability-extractor.ts

import { Readability } from '@mozilla/readability';
import type { PageContent } from './types';

const EXTRACT_TIMEOUT_MS = 30_000;

export class ReadabilityExtractor {
  async extract(): Promise<PageContent> {
    // 克隆当前文档以避免修改原始 DOM
    const documentClone = document.cloneNode(true) as Document;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // 超时：尝试返回部分结果
        try {
          const partial = this.tryExtract(documentClone);
          if (partial) {
            resolve(partial);
          } else {
            reject(new Error('页面正文提取超时'));
          }
        } catch {
          reject(new Error('页面正文提取超时'));
        }
      }, EXTRACT_TIMEOUT_MS);

      try {
        const result = this.tryExtract(documentClone);
        clearTimeout(timeoutId);

        if (result) {
          resolve(result);
        } else {
          // Readability 无法解析时返回基本页面信息
          resolve({
            title: document.title,
            textContent: document.body?.innerText?.slice(0, 5000) ?? '',
            excerpt: document.body?.innerText?.slice(0, 200) ?? '',
            byline: null,
            siteName: null,
          });
        }
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private tryExtract(doc: Document): PageContent | null {
    const article = new Readability(doc).parse();
    if (!article) return null;

    return {
      title: article.title ?? '',
      textContent: article.textContent ?? '',
      excerpt: article.excerpt ?? article.textContent?.slice(0, 200) ?? '',
      byline: article.byline ?? null,
      siteName: article.siteName ?? null,
    };
  }
}
```

### 3.4 选中文本读取器

**文件:** `src/content/selection-reader.ts`

```ts
// src/content/selection-reader.ts

import type { PageSelection } from './types';

export class SelectionReader {
  getSelection(): PageSelection {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
      return { text: '' };
    }

    const text = selection.toString();

    // 尝试获取 HTML 格式的选中内容
    let html: string | undefined;
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = document.createElement('div');
      container.appendChild(range.cloneContents());
      html = container.innerHTML;
    }

    return { text, html };
  }
}
```

### 3.5 页面元数据读取器

**文件:** `src/content/metadata-reader.ts`

```ts
// src/content/metadata-reader.ts

import type { PageMetadata } from './types';

export class MetadataReader {
  getMetadata(): PageMetadata {
    const getMeta = (name: string): string | null => {
      // 先查 <meta name="...">
      const metaByName = document.querySelector(`meta[name="${name}"]`);
      if (metaByName) return metaByName.getAttribute('content');

      // 再查 <meta property="og:...">
      const metaByProp = document.querySelector(`meta[property="og:${name}"]`);
      if (metaByProp) return metaByProp.getAttribute('content');

      return null;
    };

    return {
      title: document.title,
      url: window.location.href,
      description: getMeta('description'),
      ogImage: getMeta('image'),
    };
  }
}
```

### 3.6 Page 工具定义（注册到 ToolRegistry）

**文件:** `src/tools/page/page-get-content.ts`

```ts
// src/tools/page/page-get-content.ts

import type { ToolDefinition } from '../../shared/types/tool';

export function createPageGetContentTool(
  executeFn: (params: Record<string, unknown>) => Promise<ToolResult>,
): ToolDefinition {
  return {
    name: 'page_getContent',
    description: '提取当前页面的正文内容。返回标题、纯文本正文、摘要、作者和站点名称。',
    schema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: '目标标签页 ID。不传则使用当前活跃标签页。',
        },
      },
    },
    category: 'page',
    riskLevel: 'high', // 读取页面内容属于高风险（可能包含敏感信息）
    confirmationRequired: true,
    resultSensitivity: 'sensitive', // 页面内容可能包含敏感信息
    requireContentScript: true,
    execute: executeFn,
    preflight: async (params) => ({
      affectedObjects: [{
        type: 'page',
        id: String(params.tabId ?? 'current'),
        title: '当前页面',
        reason: '读取页面正文内容',
      }],
      warnings: ['页面内容可能包含敏感信息，确认发送给 LLM？'],
    }),
  };
}
```

**文件:** `src/tools/page/page-get-selection.ts`

```ts
// src/tools/page/page-get-selection.ts

import type { ToolDefinition } from '../../shared/types/tool';

export function createPageGetSelectionTool(
  executeFn: (params: Record<string, unknown>) => Promise<ToolResult>,
): ToolDefinition {
  return {
    name: 'page_getSelection',
    description: '获取用户在页面上选中的文本。',
    schema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: '目标标签页 ID。不传则使用当前活跃标签页。',
        },
      },
    },
    category: 'page',
    riskLevel: 'medium',
    confirmationRequired: false,
    resultSensitivity: 'sensitive',
    requireContentScript: true,
    execute: executeFn,
  };
}
```

**文件:** `src/tools/page/page-get-metadata.ts`

```ts
// src/tools/page/page-get-metadata.ts

import type { ToolDefinition } from '../../shared/types/tool';

export function createPageGetMetadataTool(
  executeFn: (params: Record<string, unknown>) => Promise<ToolResult>,
): ToolDefinition {
  return {
    name: 'page_getMetadata',
    description: '获取当前页面的元数据：标题、URL、描述、OG 图片。',
    schema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: '目标标签页 ID。不传则使用当前活跃标签页。',
        },
      },
    },
    category: 'page',
    riskLevel: 'low',
    confirmationRequired: false,
    resultSensitivity: 'low', // 元数据属于低敏
    requireContentScript: true,
    execute: executeFn,
  };
}
```

**文件:** `src/tools/page/index.ts`

```ts
// src/tools/page/index.ts

export { createPageGetContentTool } from './page-get-content';
export { createPageGetSelectionTool } from './page-get-selection';
export { createPageGetMetadataTool } from './page-get-metadata';
```

### 3.7 工具注册入口（在 Background 或初始化代码中调用）

```ts
// 示例注册代码（放在 Background 初始化或 Chat Page 初始化中）

import { createPageGetContentTool } from '../tools/page/page-get-content';
import { createPageGetSelectionTool } from '../tools/page/page-get-selection';
import { createPageGetMetadataTool } from '../tools/page/page-get-metadata';
import type { ToolResult } from '../shared/types/tool';

function registerPageTools(toolRegistry: IToolRegistry, rpcClient: IJsonRpcClient) {
  // 通过 JSON-RPC 调用 Content Script 的通用执行函数
  const executeViaContentScript = async (
    method: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> => {
    try {
      // 通过 Background ContentBridge 转发到目标 tab 的 Content Script
      const result = await rpcClient.request('content.execute', {
        tabId: params.tabId,
        method,
        params,
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  toolRegistry.register(createPageGetContentTool(
    (params) => executeViaContentScript('page.getContent', params),
  ));

  toolRegistry.register(createPageGetSelectionTool(
    (params) => executeViaContentScript('page.getSelection', params),
  ));

  toolRegistry.register(createPageGetMetadataTool(
    (params) => executeViaContentScript('page.getMetadata', params),
  ));
}
```

### 3.8 WXT Content Script 配置

在 `wxt.config.ts` 或 manifest 中确保 Content Script 声明式注入：

```ts
// wxt.config.ts 中的配置（WXT 通过 defineContentScript 自动处理）

// 无需额外配置，content/index.ts 中的 defineContentScript({ matches: ['<all_urls>'] })
// 会自动生成 manifest.content_scripts 配置
```

## 4. 接口/契约

### 4.1 Content Script JSON-RPC 方法

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `page.getContent` | `{}` | `PageContent` | 提取当前页面正文 |
| `page.getSelection` | `{}` | `PageSelection` | 获取用户选中文本 |
| `page.getMetadata` | `{}` | `PageMetadata` | 获取页面元数据 |

### 4.2 数据模型

```ts
interface PageContent {
  title: string;        // 页面标题
  textContent: string;  // 纯文本正文
  excerpt: string;      // 摘要（前 200 字符）
  byline: string | null;     // 作者
  siteName: string | null;   // 站点名称
}

interface PageSelection {
  text: string;          // 纯文本选中内容
  html?: string;         // HTML 格式选中内容
}

interface PageMetadata {
  title: string;             // 页面标题
  url: string;               // 当前 URL
  description: string | null; // meta description
  ogImage: string | null;     // OG 图片 URL
}
```

### 4.3 通信链路

```
Chat Page → JSON-RPC request → Background (ContentBridge)
  → browser.tabs.sendMessage(tabId, jsonRpcRequest)
  → Content Script (JSON-RPC Handler)
  → ReadabilityExtractor / SelectionReader / MetadataReader
  → JSON-RPC response → Background → Chat Page
```

## 5. 测试指引

### 5.1 单元测试

**文件:** 各模块测试文件

**Mock 策略：**
- Mock `document` 对象（jsdom）
- Mock `window.getSelection()`
- Mock `@mozilla/readability` 的 `Readability` 类

**测试场景及预期：**

| # | 场景 | 预期结果 |
|---|------|----------|
| 1 | `ReadabilityExtractor.extract()` 正常 | 返回 `PageContent`，title/textContent/excerpt 非空 |
| 2 | `ReadabilityExtractor.extract()` 超时 | 30s 后返回错误或部分结果 |
| 3 | `ReadabilityExtractor.extract()` 无法解析 | 返回基本页面信息（title + body.innerText） |
| 4 | `SelectionReader.getSelection()` 有选中 | 返回 `{ text: "选中文本", html: "<b>选中</b>" }` |
| 5 | `SelectionReader.getSelection()` 无选中 | 返回 `{ text: "" }` |
| 6 | `MetadataReader.getMetadata()` | 返回 title/url/description/ogImage |
| 7 | `MetadataReader.getMetadata()` 无 meta 标签 | description/ogImage 为 null |
| 8 | JSON-RPC Handler 路由正确 | `page.getContent` → ReadabilityExtractor |
| 9 | JSON-RPC Handler 未知方法 | 返回 JSON-RPC error |

### 5.2 集成测试

验证 Content Script 在真实页面中正常工作（使用 Playwright E2E，在 T19 完成）。

## 6. 验收标准

- [ ] Content Script 在所有页面自动注入（通过 `manifest.content_scripts` 声明）
- [ ] `page.getContent` 返回 `{ title, textContent, excerpt, byline, siteName }`
- [ ] `page.getSelection` 返回选中文本（纯文本 + HTML）
- [ ] `page.getMetadata` 返回 `{ title, url, description, ogImage }`
- [ ] Content Script 通过 JSON-RPC 与 Background 正常通信
- [ ] Readability 提取超时 30s 后返回部分结果或错误
- [ ] 3 个工具注册到 ToolRegistry，category 为 `"page"`
- [ ] 单元测试 mock DOM，覆盖正文提取和选中文本

## 7. 注意事项

1. **Readability 超时处理** — `@mozilla/readability` 在大页面（如 SPA）上可能耗时较长。使用 `setTimeout` 包裹，30s 后返回部分结果或错误。超时时先尝试同步调用 `tryExtract`，如果已有结果则返回。

2. **文档克隆** — `Readability` 会修改 DOM，必须使用 `document.cloneNode(true)` 创建副本后再解析，避免影响原始页面。

3. **Content Script 注入时机** — WXT 的 `defineContentScript` 默认在 `document_idle` 时注入，此时 DOM 已完全加载。Readability 需要完整 DOM，因此 `document_idle` 是最合适的时机。

4. **`tabId` 参数** — Page 工具的 `tabId` 参数用于指定目标标签页。Content Script 本身运行在指定页面内，不需要 `tabId` 来定位自己。`tabId` 由 Background 的 `ContentBridge` 使用，用于 `browser.tabs.sendMessage(tabId, ...)` 定位到正确的 Content Script 实例。

5. **`@mozilla/readability` 导入** — WXT 构建时会将 `@mozilla/readability` 打包进 Content Script。需要确保 WXT 配置正确处理该依赖。如有问题，可考虑将 Readability 源码内联（该库是纯 JS，无外部依赖）。

6. **安全性** — Content Script 运行在任意网页上下文中，需注意：
   - 不执行来自页面的代码（避免 XSS）
   - 不暴露 `window` 对象给 Background
   - 不修改页面 DOM（Readability 操作在克隆文档上）
   - JSON-RPC 请求仅处理已知方法

7. **manifest 权限** — Content Script 需要 `<all_urls>` 的 `host_permissions` 才能注入所有页面。还需要 `scripting` 权限（如使用动态注入）。
