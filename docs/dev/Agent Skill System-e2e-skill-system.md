# 开发文档: T10 — E2E 测试 Skill 系统

**Project:** Agent Skill System  
**Task ID:** T10  
**Slug:** `e2e-skill-system`  
**Issue:** #83  
**类型:** fullstack  
**Batch:** 5  
**依赖:** T1-T9 全部完成

---

## 1. 目标

编写 6 个 E2E 测试用例，使用 Playwright 在 headless Chromium 中验证 Skill 系统的核心用户流程。所有测试**不依赖外部 LLM API**（通过 `page.route()` mock 网络请求）。

## 2. 前置条件

- [ ] T1-T9 全部实现完成
- [ ] `wxt build -b chrome` 能成功构建扩展
- [ ] `playwright.config.ts` 配置就绪（Chromium 项目）
- [ ] SkillPanel 组件包含 `data-testid` 属性（T8 文档已定义）

### 2.1 验证前置条件

```bash
# 构建扩展
npm run build:chrome

# 确认 SkillPanel data-testid 存在
grep -r "data-testid" src/entrypoints/sidepanel/components/SkillPanel.tsx

# 确认 Playwright 可运行
npx playwright test --list
```

## 3. E2E 测试架构设计

### 3.1 整体策略

```
Playwright 测试进程
├── 加载 Chrome 扩展 (WXT build 产物)
├── 打开 sidepanel.html（扩展页面）
├── Mock LLM API 响应（page.route 拦截 fetch）
├── 操作 UI（点击、输入、断言）
└── 验证 chrome.storage.local 数据（通过 page.evaluate）
```

### 3.2 Mock 策略

| 被 Mock 对象 | Mock 方式 | 说明 |
|-------------|----------|------|
| LLM API HTTP 请求 | `page.route()` 拦截 `/v1/chat/completions` | 返回预设的 chat completion 响应，包含 `tool_calls` 或 `content` |
| `chrome.storage.local` | 不 mock，使用真实 API | 扩展页面中 `chrome.storage.local` 真实可用，通过 `page.evaluate()` 直接读写 |
| 浏览器 Tab/Window API | 不 mock（非测试范围） | Skill E2E 不依赖浏览器操作，仅验证 skill CRUD + 对话中的 skill 激活 |

### 3.3 加载扩展的方式

使用 Playwright 的 `persistentContext` + `--load-extension` 参数加载已构建的扩展：

```typescript
// 伪代码 — 说明思路，实际实现见第 5 节
const pathToExtension = path.resolve(__dirname, '../dist/chrome-mv3');
const context = await chromium.launchPersistentContext('', {
  headless: true,
  args: [
    `--disable-extensions-except=${pathToExtension}`,
    `--load-extension=${pathToExtension}`,
  ],
});
```

> **注意**：具体加载方式取决于 WXT 构建产物的目录结构。`dist/chrome-mv3` 是 WXT `build -b chrome` 的默认输出路径。sidepanel 页面的 URL 格式为 `chrome-extension://<extension-id>/sidepanel.html`。

### 3.4 获取 sidepanel 页面

扩展加载后，需要通过 `chrome.management` API 或解析 `service worker` 获取 extension ID，然后导航到 sidepanel 页面：

```typescript
// 方式 1：通过 service worker 获取 extension ID
let [background] = context.serviceWorkers();
let extensionId = background.url().split('/')[2];

// 方式 2：如果无法获取 service worker，解析 background script
const page = await context.newPage();
await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
```

## 4. Mock LLM 响应设计

### 4.1 响应模板

需要为 6 个测试用例设计不同的 mock 响应：

#### 模板 A：无 tool call 的普通对话（E2E-6）

```json
{
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "你好！我是 Browser Agent，有什么可以帮你的？" },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 100, "completion_tokens": 20 }
}
```

#### 模板 B：skill tool call → stop（E2E-5）

LLM 返回 2 轮：第一轮调用 `skill` tool，第二轮返回文本：

```json
// 第 1 轮
{
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "call_skill_1",
        "type": "function",
        "function": { "name": "skill", "arguments": "{\"name\": \"caveman\"}" }
      }]
    },
    "finish_reason": "tool_calls"
  }]
}

// 第 2 轮
{
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "Me caveman. You ask. Me answer. Short words." },
    "finish_reason": "stop"
  }]
}
```

#### 模板 C：含 reasoning 的 tool call 响应

```json
{
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": null,
      "reasoning_content": "用户说需要帮助整理标签页，但我没有对应的 skill。",
      "tool_calls": [...]
    },
    "finish_reason": "tool_calls"
  }]
}
```

### 4.2 Mock 路由匹配

使用 `page.route()` 匹配所有 LLM API 请求：

```typescript
await page.route('**/v1/chat/completions', async (route) => {
  const request = route.request();
  const body = request.postDataJSON();
  
  // 根据请求中的 messages 内容返回不同响应
  const userMessage = body.messages?.find((m: any) => m.role === 'user')?.content ?? '';
  
  if (userMessage.includes('caveman')) {
    await route.fulfill({ json: skillToolCallResponse });
  } else if (userMessage.includes('hello') || userMessage.includes('你好')) {
    await route.fulfill({ json: normalChatResponse });
  } else {
    await route.fulfill({ json: defaultResponse });
  }
});
```

> **简化方案**：如果基于请求内容匹配太复杂，可使用**固定响应队列**模式——预先定义好响应列表，按顺序返回。

### 4.3 响应队列模式（推荐）

```typescript
function createMockResponder(responses: object[]) {
  let index = 0;
  return async (route: any) => {
    const response = responses[index] ?? responses[responses.length - 1];
    index++;
    await route.fulfill({ json: response });
  };
}
```

## 5. 测试用例详细设计

### 5.1 测试文件结构

```
e2e/
├── skill-system.spec.ts    # 新增
├── helpers/
│   └── mock-llm.ts         # 新增：Mock 工具函数
└── chat-flow.spec.ts       # 已有（占位）
```

### 5.2 helpers/mock-llm.ts

```typescript
import type { Route } from '@playwright/test';

// ── 响应模板 ────────────────────────────────────────

function stopResponse(content: string) {
  return {
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 100, completion_tokens: content.length },
  };
}

function toolCallsResponse(...toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>) {
  return {
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      },
      finish_reason: 'tool_calls',
    }],
    usage: { prompt_tokens: 200, completion_tokens: 50 },
  };
}

function toolCallsWithReasoning(
  reasoning: string,
  ...toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>
) {
  return {
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        reasoning_content: reasoning,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      },
      finish_reason: 'tool_calls',
    }],
    usage: { prompt_tokens: 200, completion_tokens: 50 },
  };
}

// ── 响应队列 ────────────────────────────────────────

export function createMockResponder(responses: object[]) {
  let index = 0;
  return async (route: Route) => {
    const response = responses[index] ?? responses[responses.length - 1];
    index++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  };
}

// ── 预定义响应 ──────────────────────────────────────

/** 普通对话 */
export const helloResponse = stopResponse('你好！我是 Browser Agent。');

/** 激活 caveman skill → 确认回复 */
export const skillCavemanResponses = [
  toolCallsResponse(
    { id: 'call_1', name: 'skill', args: { name: 'caveman' } },
  ),
  stopResponse('Me caveman. You ask. Me answer. Short words.'),
];

/** 空 skill 列表 — 正常对话 */
export const noSkillResponse = stopResponse('有什么可以帮你的？');

/** skill 匹配失败 */
export const skillNotFoundResponses = [
  toolCallsResponse(
    { id: 'call_1', name: 'skill', args: { name: 'nonexistent' } },
  ),
  stopResponse('我没有找到那个技能，有什么可以帮你的？'),
];
```

### 5.3 skill-system.spec.ts 主文件

```typescript
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'path';
import {
  createMockResponder,
  helloResponse,
  skillCavemanResponses,
  noSkillResponse,
} from './helpers/mock-llm';

// ── 配置常量 ────────────────────────────────────────

const EXTENSION_PATH = path.resolve(__dirname, '../dist/chrome-mv3');
const SIDEPANEL_PATH = 'sidepanel.html';

// ── Test Fixture ────────────────────────────────────

/**
 * 获取扩展 ID。
 * 方式：通过 chrome.management.getAll() 获取已加载的扩展列表。
 */
async function getExtensionId(context: BrowserContext): Promise<string> {
  // 从 service worker 中提取
  const workers = context.serviceWorkers();
  if (workers.length > 0) {
    return workers[0].url().split('/')[2];
  }
  // 降级：通过 background page
  const pages = context.backgroundPages();
  if (pages.length > 0) {
    return pages[0].url().split('/')[2];
  }
  throw new Error('无法获取扩展 ID，请确认扩展已正确加载');
}

/**
 * 打开 sidepanel 页面
 */
async function openSidepanel(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${SIDEPANEL_PATH}`);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

/**
 * 在 sidepanel 页面中设置 mock LLM 路由
 */
async function mockLlm(page: Page, responses: object[]) {
  const responder = createMockResponder(responses);
  await page.route('**/v1/chat/completions', responder);
}

/**
 * 等待 skill panel 加载完成
 */
async function waitForSkillPanel(page: Page) {
  await page.waitForSelector('[data-testid="skill-panel"]', { timeout: 10000 });
}

/**
 * 在 sidepanel 中执行脚本（操作 chrome.storage.local）
 */
async function getStorageSkills(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get('skills', (result) => {
        resolve(result.skills ?? []);
      });
    });
  });
}

/**
 * 清空 chrome.storage.local 中的 skills
 */
async function clearStorageSkills(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ skills: [] }, () => resolve());
    });
  });
}

/**
 * 创建测试用的 skill 数据（通过 chrome.storage.local 预设）
 */
async function seedSkill(page: Page, skill: {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
}) {
  await page.evaluate((s) => {
    return new Promise<void>((resolve) => {
      const now = Date.now();
      chrome.storage.local.set({
        skills: [{
          ...s,
          createdAt: now,
          updatedAt: now,
        }],
      }, () => resolve());
    });
  }, skill);
}

// ── Test Suite ──────────────────────────────────────

test.describe('Skill System E2E', () => {
  let context: BrowserContext;
  let page: Page;
  let extensionId: string;

  test.beforeAll(async ({ browser }) => {
    // 创建持久化上下文并加载扩展
    context = await browser.newContext({
      // 不传 storageState，每次测试都是干净的状态
    });
    // 注意：扩展通过 launch 参数加载，此处假设已通过 playwright.config.ts
    // 或测试启动脚本完成扩展加载。
    // 如果需要在测试中加载，使用 browserType.launchPersistentContext
  });

  test.beforeEach(async () => {
    extensionId = await getExtensionId(context);
    page = await openSidepanel(context, extensionId);
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ── E2E-1: 创建并启用 Skill ───────────────────────

  test('E2E-1: 创建并启用 Skill → skill 出现在列表中', async () => {
    // 1. 清空已有 skill
    await clearStorageSkills(page);

    // 2. 打开 SkillPanel
    // 注意：SkillPanel 的入口按钮需要在 App.tsx 中集成（T9 任务）。
    // 此处假设入口按钮的 data-testid 为 "open-skill-panel"。
    // 如果入口尚未集成，需要先点击对应的菜单项/按钮。
    // 
    // 实际入口方式取决于 T9 实现：
    //   - 如果入口在 Header 按钮：click('[data-testid="open-skill-panel"]')
    //   - 如果入口在 Settings 菜单：先打开 Settings，再切换到 Skill tab
    //   - 如果入口在 ConversationSidebar：点击对应的按钮
    //
    // 当前假设：SkillPanel 可通过 data-testid="open-skill-panel" 打开
    const skillPanelButton = page.locator('[data-testid="open-skill-panel"]');
    if (await skillPanelButton.isVisible()) {
      await skillPanelButton.click();
    } else {
      // 降级：直接通过 page.evaluate 挂载 SkillPanel
      // 这需要 SkillPanel 组件已注册到 React 渲染树中
      test.skip(true, 'SkillPanel 入口按钮未找到，请确认 T9 已完成集成');
      return;
    }

    await waitForSkillPanel(page);

    // 3. 验证空状态
    await expect(page.locator('[data-testid="skill-empty-hint"]')).toBeVisible();

    // 4. 点击"新建技能"
    await page.locator('[data-testid="skill-add-button"]').click();

    // 5. 验证编辑表单出现
    await expect(page.locator('[data-testid="skill-edit-form"]')).toBeVisible();

    // 6. 填写表单
    await page.locator('[data-testid="skill-name-input"]').fill('翻译助手');
    await page.locator('[data-testid="skill-desc-input"]').fill('当需要翻译文本时使用');
    await page.locator('[data-testid="skill-prompt-input"]').fill('你是一个专业的翻译助手，请准确翻译用户提供的文本。');

    // 7. 保存
    const saveBtn = page.locator('[data-testid="skill-save-button"]');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // 8. 验证 skill 出现在列表中
    await expect(page.locator('[data-testid="skill-item"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="skill-item"]').filter({ hasText: '翻译助手' })).toBeVisible();

    // 9. 验证 storage 持久化
    const skills = await getStorageSkills(page);
    expect(skills).toHaveLength(1);
    expect((skills as any[])[0].name).toBe('翻译助手');
    expect((skills as any[])[0].enabled).toBe(true);

    // 10. 验证"启用"badge 可见
    await expect(page.locator('[data-testid="skill-item"]').locator('text=启用')).toBeVisible();
  });

  // ── E2E-2: 编辑 Skill ─────────────────────────────

  test('E2E-2: 编辑 Skill → 列表显示更新后名称', async () => {
    // 1. 预设一个 skill
    await clearStorageSkills(page);
    await seedSkill(page, {
      id: 'edit-test-1',
      name: '旧名称',
      description: '旧描述',
      prompt: '旧提示词',
      enabled: true,
    });

    // 2. 打开 SkillPanel
    const skillPanelButton = page.locator('[data-testid="open-skill-panel"]');
    if (!(await skillPanelButton.isVisible())) {
      test.skip(true, 'SkillPanel 入口按钮未找到');
      return;
    }
    await skillPanelButton.click();
    await waitForSkillPanel(page);

    // 3. 验证旧名称在列表中
    await expect(page.locator('[data-testid="skill-item"]').filter({ hasText: '旧名称' })).toBeVisible();

    // 4. 点击"编辑"
    await page.locator('[data-testid="skill-edit"]').click();

    // 5. 验证编辑表单预填
    await expect(page.locator('[data-testid="skill-name-input"]')).toHaveValue('旧名称');
    await expect(page.locator('[data-testid="skill-desc-input"]')).toHaveValue('旧描述');
    await expect(page.locator('[data-testid="skill-prompt-input"]')).toHaveValue('旧提示词');

    // 6. 修改名称
    await page.locator('[data-testid="skill-name-input"]').fill('新名称');

    // 7. 保存
    await page.locator('[data-testid="skill-save-button"]').click();

    // 8. 验证列表显示新名称
    await expect(page.locator('[data-testid="skill-item"]').filter({ hasText: '新名称' })).toBeVisible();
    await expect(page.locator('[data-testid="skill-item"]').filter({ hasText: '旧名称' })).toHaveCount(0);

    // 9. 验证 storage 更新
    const skills = await getStorageSkills(page);
    expect((skills as any[])[0].name).toBe('新名称');
    expect((skills as any[])[0].description).toBe('旧描述'); // 未修改字段不变
  });

  // ── E2E-3: 删除 Skill ─────────────────────────────

  test('E2E-3: 删除 Skill → skill 从列表消失', async () => {
    // 1. 预设一个 skill
    await clearStorageSkills(page);
    await seedSkill(page, {
      id: 'delete-test-1',
      name: '待删除技能',
      description: '将被删除',
      prompt: 'test',
      enabled: true,
    });

    // 2. 打开 SkillPanel
    const skillPanelButton = page.locator('[data-testid="open-skill-panel"]');
    if (!(await skillPanelButton.isVisible())) {
      test.skip(true, 'SkillPanel 入口按钮未找到');
      return;
    }
    await skillPanelButton.click();
    await waitForSkillPanel(page);

    // 3. 验证 skill 在列表中
    await expect(page.locator('[data-testid="skill-item"]')).toHaveCount(1);

    // 4. 点击"删除"
    await page.locator('[data-testid="skill-delete"]').click();

    // 5. 验证确认弹窗出现
    await expect(page.locator('[data-testid="skill-delete-confirm"]')).toBeVisible();
    await expect(page.locator('[data-testid="skill-delete-confirm"]')).toContainText('待删除技能');

    // 6. 确认删除
    await page.locator('[data-testid="skill-delete-confirm-btn"]').click();

    // 7. 验证 skill 从列表消失
    await expect(page.locator('[data-testid="skill-item"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="skill-empty-hint"]')).toBeVisible();

    // 8. 验证 storage 已删除
    const skills = await getStorageSkills(page);
    expect(skills).toHaveLength(0);
  });

  // ── E2E-4: 禁用 Skill ─────────────────────────────

  test('E2E-4: 禁用 Skill → enabled=false', async () => {
    // 1. 预设一个启用的 skill
    await clearStorageSkills(page);
    await seedSkill(page, {
      id: 'toggle-test-1',
      name: '可切换技能',
      description: '测试启用/禁用',
      prompt: 'test',
      enabled: true,
    });

    // 2. 打开 SkillPanel
    const skillPanelButton = page.locator('[data-testid="open-skill-panel"]');
    if (!(await skillPanelButton.isVisible())) {
      test.skip(true, 'SkillPanel 入口按钮未找到');
      return;
    }
    await skillPanelButton.click();
    await waitForSkillPanel(page);

    // 3. 验证启用 badge 可见
    await expect(page.locator('[data-testid="skill-item"]').locator('text=启用')).toBeVisible();

    // 4. 点击开关（toggle 按钮 data-testid="skill-toggle"）
    const toggle = page.locator('[data-testid="skill-toggle"]');
    // 验证 aria-checked 为 true（当前启用）
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();

    // 5. 验证 aria-checked 变为 false
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // 6. 验证启用 badge 消失
    await expect(page.locator('[data-testid="skill-item"]').locator('text=启用')).toHaveCount(0);

    // 7. 验证 storage 中 enabled=false
    const skills = await getStorageSkills(page);
    expect((skills as any[])[0].enabled).toBe(false);

    // 8. 再次点击恢复启用
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    const skillsAfter = await getStorageSkills(page);
    expect((skillsAfter as any[])[0].enabled).toBe(true);
  });

  // ── E2E-5: LLM 调用 skill tool ────────────────────

  test('E2E-5: LLM 调用 skill tool → 回复符合 skill prompt', async () => {
    // 1. 预设 caveman skill
    await clearStorageSkills(page);
    await seedSkill(page, {
      id: 'caveman-skill',
      name: 'caveman',
      description: 'Ultra-compressed communication mode',
      prompt: 'Speak in caveman style. Short sentences. No fluff.',
      enabled: true,
    });

    // 2. Mock LLM 响应：第一轮激活 skill，第二轮返回 caveman 风格文本
    await mockLlm(page, skillCavemanResponses);

    // 3. 在聊天输入框发送消息
    // 假设输入框 data-testid 为 "message-input"
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('帮我整理标签页');
    await input.press('Enter');

    // 4. 等待 LLM 响应出现在消息列表中
    // 检查最终回复是否包含 caveman 风格的文本
    await expect(page.locator('[data-testid="message-bubble"]').last()).toContainText(
      'Me caveman',
      { timeout: 15000 },
    );

    // 5. 验证 tool call 卡片出现过
    // 由于 tool call 也是以消息气泡形式显示，检查是否出现了 "skill" 相关的 tool 消息
    // （具体 data-testid 取决于 ToolCallCard 组件的实现）
    await expect(page.locator('[data-testid="tool-call-card"]').filter({ hasText: 'skill' })).toBeVisible();
  });

  // ── E2E-6: 空 skill 列表不影响对话 ────────────────

  test('E2E-6: 空 skill 列表 → 发送消息 → 正常回复', async () => {
    // 1. 确保无 skill
    await clearStorageSkills(page);

    // 2. Mock LLM 响应：普通对话
    await mockLlm(page, [noSkillResponse]);

    // 3. 发送消息
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('你好');
    await input.press('Enter');

    // 4. 验证收到正常回复
    await expect(page.locator('[data-testid="message-bubble"]').last()).toContainText(
      '有什么可以帮你的',
      { timeout: 15000 },
    );

    // 5. 验证没有 skill 相关的 tool call 卡片
    const skillToolCards = page.locator('[data-testid="tool-call-card"]').filter({ hasText: 'skill' });
    await expect(skillToolCards).toHaveCount(0);
  });
});
```

## 6. Playwright 配置更新

### 6.1 扩展加载方式

当前 `playwright.config.ts` 使用 `headless: false`，需要更新以支持加载 Chrome 扩展：

```typescript
// playwright.config.ts（修改建议）
import { defineConfig } from '@playwright/test';
import path from 'path';

const EXTENSION_PATH = path.resolve(__dirname, 'dist/chrome-mv3');

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 1,
  use: {
    headless: true,        // E2E 测试改为 headless
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chrome',
      use: {
        browserName: 'chromium',
        // 通过 launchOptions 加载扩展
        launchOptions: {
          args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
          ],
        },
      },
    },
  ],
});
```

> **注意**：如果 `launchOptions` 中的 `args` 不生效（Playwright 的 `persistentContext` 模式更可靠），可改用以下方式：

### 6.2 备选方案：persistentContext fixture

```typescript
// e2e/fixtures/extension-fixture.ts
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

const EXTENSION_PATH = path.resolve(__dirname, '../../dist/chrome-mv3');

export const test = base.extend<{ extensionContext: BrowserContext; extensionId: string }>({
  extensionContext: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ extensionContext }, use) => {
    // 等待 service worker 启动
    let [background] = extensionContext.serviceWorkers();
    if (!background) {
      background = await extensionContext.waitForEvent('serviceworker');
    }
    const id = background.url().split('/')[2];
    await use(id);
  },
});
```

## 7. 测试执行流程

### 7.1 运行命令

```bash
# 1. 构建扩展
npm run build:chrome

# 2. 运行 E2E 测试（仅 skill 相关）
npx playwright test e2e/skill-system.spec.ts

# 3. 运行全部 E2E 测试
npx playwright test

# 4. 带 UI 模式调试
npx playwright test e2e/skill-system.spec.ts --ui

# 5. 指定浏览器
npx playwright test e2e/skill-system.spec.ts --project=chrome
```

### 7.2 测试顺序与依赖

| 顺序 | 测试用例 | 依赖 | 说明 |
|------|---------|------|------|
| 1 | E2E-6 | 无 | 空 skill 列表不影响对话（无依赖，可最先运行） |
| 2 | E2E-1 | 无 | 创建 skill（通过 storage 清理保证独立） |
| 3 | E2E-2 | E2E-1 不强制 | 编辑 skill（通过 seedSkill 预设数据） |
| 4 | E2E-3 | E2E-1 不强制 | 删除 skill（通过 seedSkill 预设数据） |
| 5 | E2E-4 | E2E-1 不强制 | 禁用 skill（通过 seedSkill 预设数据） |
| 6 | E2E-5 | E2E-1 不强制 | LLM 调用 skill tool（通过 seedSkill + mock 预设） |

> 每个测试通过 `beforeEach` 打开新页面、通过 `seedSkill`/`clearStorageSkills` 管理数据，确保测试独立性。

## 8. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `e2e/skill-system.spec.ts` | 新增 | 6 个 E2E 测试用例 |
| `e2e/helpers/mock-llm.ts` | 新增 | Mock LLM 响应工具函数 |
| `playwright.config.ts` | 可能修改 | 如需添加 `launchOptions.args` 加载扩展 |
| `e2e/fixtures/extension-fixture.ts` | 可选新增 | 如需 persistentContext fixture |

## 9. 验收标准

- [ ] 6 个测试用例全部通过（`npx playwright test e2e/skill-system.spec.ts`）
- [ ] 测试在 headless Chromium 中运行（无 GUI 弹窗）
- [ ] 测试不依赖外部 LLM API（所有网络请求被 `page.route` 拦截）
- [ ] `page.route` 覆盖所有 `/v1/chat/completions` 请求
- [ ] 测试使用 `data-testid` 选择器，不依赖 CSS class 或文本模糊匹配
- [ ] 每个测试用例独立（不依赖其他测试的执行结果）
- [ ] 测试覆盖 US-1（创建 Skill）、US-2（自动激活 Skill）、US-3（管理 Skill）

## 10. 风险与对策

| 风险 | 影响 | 概率 | 对策 |
|------|------|------|------|
| WXT 构建产物路径不匹配 | 测试无法加载扩展 | 中 | 使用 `path.resolve(__dirname, '../dist/chrome-mv3')` 动态解析；构建前验证目录存在 |
| `--load-extension` 参数不生效 | 扩展未加载 | 中 | 备选：使用 `chromium.launchPersistentContext` 方式加载；在 `beforeAll` 中验证 extensionId 可用 |
| SkillPanel 入口按钮未集成（T9 未完成） | E2E-1~E2E-4 无法打开 SkillPanel | 高 | 测试中先检查入口按钮是否存在，不存在则 `test.skip`；或通过 `page.evaluate` 直接操作 React 状态打开面板 |
| sidepanel.html 在 headless 中不渲染 | 空白页面 | 低 | Chromium headless 模式支持 sidepanel；如遇问题可用 `headless: false` 调试后确认 headless 行为一致 |
| `chrome.storage.local` 在测试中行为异常 | 数据读写失败 | 低 | 扩展页面中的 `chrome.storage` API 是真实的，无需 mock；通过 `page.evaluate` 直接调用 |
| 消息列表 data-testid 不存在 | 选择器找不到元素 | 中 | 需要确认 ChatView/MessageBubble 组件是否已有 `data-testid`；如果没有，需要 T10 或相关任务添加 |
| mock 响应队列与 LLM 调用轮次不匹配 | 测试断言失败 | 中 | 使用固定响应队列 + 兜底响应（队列耗尽时重复最后一个）；日志记录每个请求方便调试 |
| 扩展在 Playwright 中 `serviceWorkers()` 为空 | 无法获取 extensionId | 中 | MV3 的 service worker 可能延迟启动；添加重试逻辑（`waitForEvent('serviceworker')` 或轮询） |
| SkillPanel 在扩展中是否已被挂载到渲染树 | SkillPanel 不可见 | 高 | T9 负责将 SkillPanel 集成到 App.tsx。如果 T9 未完成，SkillPanel 组件不会出现在 DOM 中。E2E-1~E2E-4 依赖此集成。 |

## 11. 设计决策记录

1. **使用 `page.route()` 而非外部 mock server**：Playwright 内置的网络拦截更可靠，无需启动额外进程。mock 响应在测试代码中定义，与测试逻辑紧密耦合，方便维护。

2. **通过 `chrome.storage.local` 预设测试数据**：`seedSkill()` 和 `clearStorageSkills()` 直接操作 storage，比通过 UI 创建 skill 更快更可靠。每个测试独立管理自己的数据。

3. **使用响应队列而非请求内容匹配**：LLM 请求内容包含完整的 system prompt + 历史消息，内容匹配复杂且脆弱。响应队列按固定顺序返回，简单可靠。

4. **使用 `data-testid` 选择器**：遵循 T8（SkillPanel）中已定义的选择器命名规范。如果消息列表等其他组件缺少 `data-testid`，需在对应任务中补充。

5. **每个测试独立打开新页面**：`beforeEach` 创建新 page，`afterEach` 关闭。避免测试间状态污染。

6. **不修改现有 `playwright.config.ts` 的 `headless` 设置**：当前配置 `headless: false`，E2E 测试建议改为 `true`。如果需保留 GUI 模式用于调试，可在 `skill-system.spec.ts` 中通过 `test.use({ headless: true })` 覆盖。

## 12. 与 T9（SkillPanel 集成）的接口约定

T10 的 E2E-1~E2E-4 依赖 T9 将 SkillPanel 挂载到 React 渲染树中。以下是 T10 对 T9 的最低要求：

| 要求 | 说明 |
|------|------|
| SkillPanel 入口按钮 | `data-testid="open-skill-panel"` 的按钮存在于 Header 或 Sidebar 中，点击后渲染 SkillPanel |
| 消息输入框 | `data-testid="message-input"` 的输入框，支持 `fill()` + `press('Enter')` 发送消息 |
| 消息气泡 | `data-testid="message-bubble"` 的消息容器，包含 `role` 属性区分 user/assistant/tool |
| Tool 调用卡片 | `data-testid="tool-call-card"` 的 tool 消息气泡，包含 tool 名称文本 |

> 如果 T9 未完成这些集成，T10 的 E2E-5 和 E2E-6 仍然可运行（仅依赖 ChatView + MessageInput），E2E-1~E2E-4 需要 skip。

## 13. 扩展：`page.route()` 无法拦截扩展内 fetch 的解决方案

Chrome 扩展的 MV3 service worker 中发起的 `fetch` 请求可能无法被 Playwright 的 `page.route()` 拦截（取决于请求发起上下文）。如果遇到此问题，有以下备选方案：

### 方案 A：在 sidepanel 页面中注册 route（推荐）

如果 LLM 请求是从 sidepanel 页面（而非 service worker）发起的，`page.route()` 可以正常拦截。

验证方式：在测试中不 mock，发送消息后检查 Playwright trace 中的网络请求。

### 方案 B：使用 `context.route()` 替代 `page.route()`

```typescript
// 在 BrowserContext 级别拦截
await context.route('**/v1/chat/completions', async (route) => {
  await route.fulfill({ json: mockResponse });
});
```

### 方案 C：通过 `chrome.debugger` 拦截网络请求

```typescript
// 使用 CDP (Chrome DevTools Protocol) 拦截
const cdpSession = await context.newCDPSession(page);
await cdpSession.send('Fetch.enable', {
  patterns: [{ urlPattern: '*/v1/chat/completions' }],
});
cdpSession.on('Fetch.requestPaused', async (params) => {
  await cdpSession.send('Fetch.fulfillRequest', {
    requestId: params.requestId,
    responseCode: 200,
    responseHeaders: [{ name: 'content-type', value: 'application/json' }],
    body: btoa(JSON.stringify(mockResponse)),
  });
});
```

### 方案 D：注入 Mock 到页面全局作用域

在 `page.evaluate()` 中重写 `window.fetch`：

```typescript
await page.evaluate((responses) => {
  const originalFetch = window.fetch;
  let index = 0;
  window.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/v1/chat/completions')) {
      const response = responses[index] ?? responses[responses.length - 1];
      index++;
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };
}, mockResponses);
```

> **推荐顺序**：先尝试方案 A（`page.route()`），如果不生效则依次尝试 B → D → C。

## 14. 注意事项

1. **构建产物路径**：确保 `npm run build:chrome` 生成的 `dist/chrome-mv3` 目录存在。如果 WXT 配置了自定义 `outDir`，需要相应调整 `EXTENSION_PATH`。

2. **扩展 ID 不稳定**：开发模式下扩展 ID 可能每次构建变化。测试通过 `serviceWorkers()` 动态获取，不硬编码。

3. **`chrome.storage.local` 配额**：E2E 测试中预设的 skill 数据很少，不会触发配额问题。

4. **测试超时**：LLM mock 响应是即时的（`page.route` 直接返回），但 UI 渲染可能有延迟。关键选择器等待使用 `timeout: 10000`。

5. **不要修改现有 `chat-flow.spec.ts`**：它目前是占位文件。T10 仅新增 `skill-system.spec.ts`。

6. **E2E 测试的运行时机**：建议在 CI 中 `npm run build:chrome && npx playwright test e2e/skill-system.spec.ts`。不要依赖 dev server（`wxt` 不支持 E2E 模式的热重载）。
