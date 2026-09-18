import { test as base, expect, chromium, type Page, type BrowserContext } from '@playwright/test';
import path from 'path';
import {
  createMockResponder,
  skillCavemanResponses,
  noSkillResponse,
} from './helpers/mock-llm';

const EXTENSION_PATH = path.resolve(import.meta.dirname, '../dist/chrome-mv3');
const SIDEPANEL_PATH = 'sidepanel.html';

/**
 * seed 的 provider 必须通过 getProviderReadiness（endpoint + 至少一个合法 models 条目），
 * 否则 sidepanel 会渲染 Provider 引导页并隐藏 message-input。
 */
const MOCK_PROVIDER = {
  id: 'mock-provider',
  name: 'Mock Provider',
  providerId: 'mock',
  endpoint: 'https://mock-api.example.com/v1',
  api: 'https://mock-api.example.com/v1',
  npm: '@ai-sdk/openai-compatible',
  apiKey: 'sk-mock-key',
  isLocalTrusted: true,
  defaultModelId: 'mock-model',
  models: {
    'mock-model': {
      id: 'mock-model',
      name: 'Mock Model',
      limit: { context: 128000, output: 4096 },
      defaults: { maxOutputTokens: 4096 },
    },
  },
};

type TestFixtures = {
  extensionContext: BrowserContext;
  extensionId: string;
  sidepanel: Page;
};

const test = base.extend<TestFixtures>({
  extensionContext: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // 扩展 UI 语言跟随浏览器 UI 语言（标准 i18n），e2e 文案断言依赖中文
        '--lang=zh-CN',
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ extensionContext }, use) => {
    let workers = extensionContext.serviceWorkers();
    let worker = workers.length > 0 ? workers[0] : null;
    if (!worker) {
      worker = await extensionContext.waitForEvent('serviceworker', { timeout: 15000 });
    }
    const id = worker.url().split('/')[2];
    await use(id);
  },

  sidepanel: async ({ extensionContext, extensionId }, use) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/${SIDEPANEL_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

/** 在 sidepanel 页面打开前，通过临时页面写入 storage */
async function seedStorage(context: BrowserContext, extensionId: string, data: Record<string, unknown>) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${SIDEPANEL_PATH}`);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((d) => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set(d, () => resolve());
    });
  }, data);
  await page.close();
}

async function openFreshSidepanel(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${SIDEPANEL_PATH}`);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

async function mockLlm(page: Page, responses: object[]) {
  const responder = createMockResponder(responses);
  await page.route('**/v1/chat/completions', responder);
}

test.describe('Skill System E2E', () => {
  test('E2E-5: LLM 调用 skill tool → 回复符合 skill prompt', async ({ extensionContext, extensionId }) => {
    await seedStorage(extensionContext, extensionId, {
      providers: [MOCK_PROVIDER],
      preferences: { theme: 'system', sidebarExpanded: true, reasoningAutoExpand: false },
      skills: [{
        id: 'caveman-skill',
        name: 'caveman',
        description: 'Ultra-compressed communication mode',
        prompt: 'Speak in caveman style. Short sentences. No fluff.',
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
    });

    const page = await openFreshSidepanel(extensionContext, extensionId);
    await mockLlm(page, skillCavemanResponses);

    const input = page.locator('[data-testid="message-input"]');
    await input.fill('帮我整理标签页');
    await input.press('Enter');

    await expect(page.locator('[data-testid="message-bubble"]').last()).toContainText(
      'Me caveman',
      { timeout: 15000 },
    );
  });

  test('E2E-6: 空 skill 列表 → 发送消息 → 正常回复', async ({ extensionContext, extensionId }) => {
    await seedStorage(extensionContext, extensionId, {
      providers: [MOCK_PROVIDER],
      preferences: { theme: 'system', sidebarExpanded: true, reasoningAutoExpand: false },
      skills: [],
    });

    const page = await openFreshSidepanel(extensionContext, extensionId);
    await mockLlm(page, [noSkillResponse]);

    const input = page.locator('[data-testid="message-input"]');
    await input.fill('你好');
    await input.press('Enter');

    await expect(page.locator('[data-testid="message-bubble"]').last()).toContainText(
      '有什么可以帮你的',
      { timeout: 15000 },
    );
  });
});
