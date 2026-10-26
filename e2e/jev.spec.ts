import { test as base, expect, chromium, type Page, type BrowserContext } from '@playwright/test';
import path from 'path';
import { createMockResponder, noSkillResponse } from './helpers/mock-llm';
import { TOOL_CATEGORY_DESCRIPTIONS } from '../src/shared/tool-categories';
import type { ToolCategory } from '../src/shared/types/tool';

const EXTENSION_PATH = path.resolve(import.meta.dirname, '../dist/chrome-mv3');
const SIDEPANEL_PATH = 'sidepanel.html';
const JEV_API_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const JEV_MODEL = 'jev-1.13.0';
const TOOL_CATEGORIES = Object.keys(TOOL_CATEGORY_DESCRIPTIONS) as ToolCategory[];

const MOCK_PROVIDER = {
  id: 'mock-provider',
  name: 'Mock Provider',
  providerId: 'mock',
  endpoint: 'https://mock-api.example.com/v1',
  api: 'https://mock-api.example.com/v1',
  npm: '@ai-sdk/openai-compatible',
  apiKey: 'sk-mock-key',
  isLocalTrusted: false,
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
};

const test = base.extend<TestFixtures>({
  extensionContext: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--lang=zh-CN',
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ extensionContext }, use) => {
    let worker = extensionContext.serviceWorkers()[0] ?? null;
    if (!worker) {
      worker = await extensionContext.waitForEvent('serviceworker', { timeout: 15000 });
    }
    await use(worker.url().split('/')[2]!);
  },
});

async function seedStorage(
  context: BrowserContext,
  extensionId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${SIDEPANEL_PATH}`);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((seed) => new Promise<void>((resolve) => {
    chrome.storage.local.set(seed, resolve);
  }), data);
  await page.close();
}

async function openSidepanel(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${SIDEPANEL_PATH}`);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

function createJevResponse(overrides: Partial<Record<ToolCategory, number>> = {}) {
  return {
    model: JEV_MODEL,
    answers: Object.fromEntries(TOOL_CATEGORIES.map((category) => [category, {
      type: 'noul',
      noul: overrides[category] ?? 0.01,
    }])),
    usage: { input_tokens: 50, output_tokens: 20 },
  };
}

function createCategoryResponse(...categories: ToolCategory[]) {
  return {
    id: 'mock-classifier',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: JSON.stringify(categories) },
      finish_reason: 'stop',
    }],
  };
}

type ChatRequest = {
  tools?: Array<{ function?: { name?: string } }>;
  messages?: Array<{ content?: string }>;
};

async function mockChat(page: Page, responses: object[]): Promise<ChatRequest[]> {
  const requests: ChatRequest[] = [];
  let responseIndex = 0;
  await page.route('**/v1/chat/completions', async (route) => {
    const request = route.request().postDataJSON() as ChatRequest & { stream?: boolean };
    requests.push(request);
    const response = responses[responseIndex] ?? responses.at(-1)!;
    responseIndex += 1;

    if (request.stream) {
      await createMockResponder([response])(route);
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
  return requests;
}

async function mockJev(context: BrowserContext, responseBody: unknown, status = 200) {
  const requests: Array<{ body: Record<string, unknown>; authorization?: string }> = [];
  await context.route('**/v1/systemone*', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization,content-type',
        },
      });
      return;
    }

    requests.push({
      body: route.request().postDataJSON() as Record<string, unknown>,
      authorization: route.request().headers().authorization,
    });
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(responseBody),
    });
  });
  return requests;
}

async function seedChatStorage(
  context: BrowserContext,
  extensionId: string,
  jevSettings: { enabled: boolean; apiKey: string },
): Promise<void> {
  await seedStorage(context, extensionId, {
    providers: [MOCK_PROVIDER],
    preferences: { theme: 'system', sidebarExpanded: true, reasoningAutoExpand: false },
    skills: [],
    jevSettings,
  });
}

async function sendChatMessage(page: Page, message: string): Promise<void> {
  const input = page.getByTestId('message-input');
  await input.fill(message);
  await input.press('Enter');
  await expect(page.locator('[data-testid="message-bubble"]').last()).toContainText(
    '有什么可以帮你的',
    { timeout: 20000 },
  );
}

function getToolNames(request: ChatRequest | undefined): string[] {
  return (request?.tools ?? [])
    .map((tool) => tool.function?.name)
    .filter((name): name is string => Boolean(name));
}

function getAgentRequests(requests: ChatRequest[]): ChatRequest[] {
  return requests.filter((request) => Array.isArray(request.tools));
}

function getClassifierRequests(requests: ChatRequest[]): ChatRequest[] {
  return requests.filter((request) => request.messages?.some((message) => (
    message.content?.includes('浏览器工具分类器')
  )));
}

test.describe('Jev settings', () => {
  test('stores a user key, keeps Jev opt-in, and clears it independently', async ({
    extensionContext,
    extensionId,
  }) => {
    await seedStorage(extensionContext, extensionId, {
      providers: [MOCK_PROVIDER],
      preferences: { theme: 'system', sidebarExpanded: true, reasoningAutoExpand: false },
    });

    const page = await openSidepanel(extensionContext, extensionId);
    await page.getByTestId('settings-button').click();
    await page.getByRole('button', { name: 'Jev' }).click();

    const enabledSwitch = page.getByRole('switch', { name: '启用 Jev' });
    const apiKeyInput = page.getByLabel('TypeSafe API key');
    await expect(enabledSwitch).toHaveAttribute('aria-checked', 'false');
    await expect(enabledSwitch).toBeDisabled();
    await expect(apiKeyInput).toHaveAttribute('type', 'password');
    await expect(page.getByText(/本机访问/)).toBeVisible();

    await apiKeyInput.fill('ts-test-secret');
    await page.getByRole('button', { name: '保存 Jev API key' }).click();
    await expect(enabledSwitch).toBeEnabled();
    await enabledSwitch.click();
    await expect(enabledSwitch).toHaveAttribute('aria-checked', 'true');

    await page.reload();
    await page.getByTestId('settings-button').click();
    await page.getByRole('button', { name: 'Jev' }).click();
    await expect(page.getByRole('switch', { name: '启用 Jev' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel('TypeSafe API key')).toHaveValue('ts-test-secret');

    await page.getByRole('button', { name: '清除 Jev API key' }).click();
    await expect(page.getByRole('switch', { name: '启用 Jev' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: '启用 Jev' })).toBeDisabled();

    const saved = await page.evaluate(async () => chrome.storage.local.get(['jevSettings', 'providers']));
    expect(saved.jevSettings).toEqual({ enabled: false, apiKey: '' });
    expect(saved.providers[0].isLocalTrusted).toBe(false);
  });
});

test.describe('Jev tool routing', () => {
  test('disabled Jev keeps generated classification and does not call TypeSafe', async ({
    extensionContext,
    extensionId,
  }) => {
    await seedChatStorage(extensionContext, extensionId, { enabled: false, apiKey: 'ts-test-key' });
    const page = await openSidepanel(extensionContext, extensionId);
    const chatRequests = await mockChat(page, [createCategoryResponse('history'), noSkillResponse]);
    const jevRequests = await mockJev(extensionContext, createJevResponse({ history: 0.99 }));

    await sendChatMessage(page, 'Review my recent activity.');

    expect(jevRequests).toHaveLength(0);
    expect(getClassifierRequests(chatRequests)).toHaveLength(1);
    const [agentRequest] = getAgentRequests(chatRequests);
    expect(getAgentRequests(chatRequests)).toHaveLength(1);
    const routedTools = getToolNames(agentRequest);
    expect(routedTools).toContain('history_search');
    expect(routedTools).not.toContain('bookmark_search');
  });

  test('local keyword hits bypass Jev when Jev is enabled', async ({ extensionContext, extensionId }) => {
    await seedChatStorage(extensionContext, extensionId, { enabled: true, apiKey: 'ts-test-key' });
    const page = await openSidepanel(extensionContext, extensionId);
    const chatRequests = await mockChat(page, [noSkillResponse]);
    const jevRequests = await mockJev(extensionContext, createJevResponse({ history: 0.99 }));

    await sendChatMessage(page, '查询标签页');

    expect(jevRequests).toHaveLength(0);
    expect(getAgentRequests(chatRequests)).toHaveLength(1);
  });

  test('enabled Jev narrows the chat request to the confidently selected category', async ({
    extensionContext,
    extensionId,
  }) => {
    await seedChatStorage(extensionContext, extensionId, { enabled: true, apiKey: 'ts-test-key' });
    const page = await openSidepanel(extensionContext, extensionId);
    const chatRequests = await mockChat(page, [noSkillResponse]);
    const jevRequests = await mockJev(extensionContext, createJevResponse({ history: 0.99 }));

    await sendChatMessage(page, 'Review my recent activity.');

    expect(jevRequests).toHaveLength(1);
    expect(jevRequests[0]?.authorization).toBe('Bearer ts-test-key');
    expect(jevRequests[0]?.body).toMatchObject({ model: JEV_MODEL, state: 'Review my recent activity.' });
    expect(getClassifierRequests(chatRequests)).toHaveLength(0);
    const [agentRequest] = getAgentRequests(chatRequests);
    expect(getAgentRequests(chatRequests)).toHaveLength(1);
    const routedTools = getToolNames(agentRequest);
    expect(routedTools).toContain('history_search');
    expect(routedTools).not.toContain('bookmark_search');
  });

  test('Jev enables every confidently selected category', async ({ extensionContext, extensionId }) => {
    await seedChatStorage(extensionContext, extensionId, { enabled: true, apiKey: 'ts-test-key' });
    const page = await openSidepanel(extensionContext, extensionId);
    const chatRequests = await mockChat(page, [noSkillResponse]);
    const jevRequests = await mockJev(extensionContext, createJevResponse({ history: 0.99, bookmarks: 0.94 }));

    await sendChatMessage(page, 'Review my recent activity.');

    expect(jevRequests).toHaveLength(1);
    expect(getClassifierRequests(chatRequests)).toHaveLength(0);
    const [agentRequest] = getAgentRequests(chatRequests);
    const routedTools = getToolNames(agentRequest);
    expect(routedTools).toContain('history_search');
    expect(routedTools).toContain('bookmark_search');
    expect(routedTools).not.toContain('download_search');
  });

  test('uncertain Jev decisions leave the full tool set available without another classifier call', async ({
    extensionContext,
    extensionId,
  }) => {
    await seedChatStorage(extensionContext, extensionId, { enabled: true, apiKey: 'ts-test-key' });
    const page = await openSidepanel(extensionContext, extensionId);
    const chatRequests = await mockChat(page, [noSkillResponse]);
    const jevRequests = await mockJev(extensionContext, createJevResponse({ history: 0.5 }));

    await sendChatMessage(page, 'Review my recent activity.');

    expect(jevRequests).toHaveLength(1);
    const [agentRequest] = getAgentRequests(chatRequests);
    expect(getAgentRequests(chatRequests)).toHaveLength(1);
    const routedTools = getToolNames(agentRequest);
    expect(routedTools).toContain('history_search');
    expect(routedTools).toContain('bookmark_search');
  });

  test('Jev service errors safely leave all tools available', async ({ extensionContext, extensionId }) => {
    await seedChatStorage(extensionContext, extensionId, { enabled: true, apiKey: 'ts-test-key' });
    const page = await openSidepanel(extensionContext, extensionId);
    const chatRequests = await mockChat(page, [noSkillResponse]);
    const jevRequests = await mockJev(extensionContext, { error: 'rate limited' }, 429);

    await sendChatMessage(page, 'Review my recent activity.');

    expect(jevRequests).toHaveLength(1);
    const [agentRequest] = getAgentRequests(chatRequests);
    expect(getAgentRequests(chatRequests)).toHaveLength(1);
    expect(getToolNames(agentRequest)).toContain('bookmark_search');
  });
});
