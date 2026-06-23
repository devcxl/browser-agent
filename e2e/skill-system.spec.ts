import { test as base, expect, chromium, type Page, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createMockResponder,
  skillCavemanResponses,
  noSkillResponse,
} from './helpers/mock-llm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../dist/chrome-mv3');
const CHROMIUM_PATH = '/home/devcxl/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const SIDEPANEL_PATH = 'sidepanel.html';

const MOCK_PROVIDER = {
  id: 'mock-provider',
  name: 'Mock Provider',
  endpoint: 'https://mock-api.example.com',
  apiKey: 'sk-mock-key',
  model: 'mock-model',
  isLocalTrusted: true,
};

type TestFixtures = {
  extensionContext: BrowserContext;
  extensionId: string;
  sidepanel: Page;
};

const test = base.extend<TestFixtures>({
  extensionContext: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
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

async function getStorageSkills(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get('skills', (result) => {
        resolve(result.skills ?? []);
      });
    });
  });
}

async function clearStorageSkills(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ skills: [] }, () => resolve());
    });
  });
}

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

async function openSkillPanel(page: Page) {
  await page.locator('[data-testid="skill-panel-trigger"]').click();
  await page.waitForSelector('[data-testid="skill-panel"]', { timeout: 10000 });
}

async function mockLlm(page: Page, responses: object[]) {
  const responder = createMockResponder(responses);
  await page.route('**/v1/chat/completions', responder);
}

test.describe('Skill System E2E', () => {
  test('E2E-1: 创建并启用 Skill → skill 出现在列表中', async ({ sidepanel: page }) => {
    await clearStorageSkills(page);
    await openSkillPanel(page);

    await expect(page.locator('[data-testid="skill-empty-hint"]')).toBeVisible();

    await page.locator('[data-testid="skill-add-button"]').click();
    await expect(page.locator('[data-testid="skill-edit-form"]')).toBeVisible();

    await page.locator('[data-testid="skill-name-input"]').fill('翻译助手');
    await page.locator('[data-testid="skill-desc-input"]').fill('当需要翻译文本时使用');
    await page.locator('[data-testid="skill-prompt-input"]').fill('你是一个专业的翻译助手，请准确翻译用户提供的文本。');

    const saveBtn = page.locator('[data-testid="skill-save-button"]');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    await expect(page.locator('[data-testid="skill-item"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="skill-item"]').filter({ hasText: '翻译助手' })).toBeVisible();

    const skills = await getStorageSkills(page);
    expect(skills).toHaveLength(1);
    expect((skills as any[])[0].name).toBe('翻译助手');
    expect((skills as any[])[0].enabled).toBe(true);

    await expect(page.locator('[data-testid="skill-item"]').locator('text=启用')).toHaveCount(1);
  });

  test('E2E-2: 编辑 Skill → 列表显示更新后名称', async ({ sidepanel: page }) => {
    await clearStorageSkills(page);
    await seedSkill(page, {
      id: 'edit-test-1',
      name: '旧名称',
      description: '旧描述',
      prompt: '旧提示词',
      enabled: true,
    });

    await openSkillPanel(page);
    await expect(page.locator('[data-testid="skill-item"]').filter({ hasText: '旧名称' })).toBeVisible();

    await page.locator('[data-testid="skill-edit"]').click();
    await expect(page.locator('[data-testid="skill-name-input"]')).toHaveValue('旧名称');
    await expect(page.locator('[data-testid="skill-desc-input"]')).toHaveValue('旧描述');
    await expect(page.locator('[data-testid="skill-prompt-input"]')).toHaveValue('旧提示词');

    await page.locator('[data-testid="skill-name-input"]').fill('新名称');
    await page.locator('[data-testid="skill-save-button"]').click();

    await expect(page.locator('[data-testid="skill-item"]').filter({ hasText: '新名称' })).toBeVisible();
    await expect(page.locator('[data-testid="skill-item"]').filter({ hasText: '旧名称' })).toHaveCount(0);

    const skills = await getStorageSkills(page);
    expect((skills as any[])[0].name).toBe('新名称');
    expect((skills as any[])[0].description).toBe('旧描述');
  });

  test('E2E-3: 删除 Skill → skill 从列表消失', async ({ sidepanel: page }) => {
    await clearStorageSkills(page);
    await seedSkill(page, {
      id: 'delete-test-1',
      name: '待删除技能',
      description: '将被删除',
      prompt: 'test',
      enabled: true,
    });

    await openSkillPanel(page);
    await expect(page.locator('[data-testid="skill-item"]')).toHaveCount(1);

    await page.locator('[data-testid="skill-delete"]').click();
    await expect(page.locator('[data-testid="skill-delete-confirm"]')).toBeVisible();
    await expect(page.locator('[data-testid="skill-delete-confirm"]')).toContainText('待删除技能');

    await page.locator('[data-testid="skill-delete-confirm-btn"]').click();

    await expect(page.locator('[data-testid="skill-item"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="skill-empty-hint"]')).toBeVisible();

    const skills = await getStorageSkills(page);
    expect(skills).toHaveLength(0);
  });

  test('E2E-4: 禁用 Skill → enabled=false', async ({ sidepanel: page }) => {
    await clearStorageSkills(page);
    await seedSkill(page, {
      id: 'toggle-test-1',
      name: '可切换技能',
      description: '测试启用/禁用',
      prompt: 'test',
      enabled: true,
    });

    await openSkillPanel(page);
    await expect(page.locator('[data-testid="skill-item"]').getByText('启用', { exact: true })).toBeVisible();

    const toggle = page.locator('[data-testid="skill-toggle"]');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('[data-testid="skill-item"]').getByText('启用', { exact: true })).toHaveCount(0);

    const skills = await getStorageSkills(page);
    expect((skills as any[])[0].enabled).toBe(false);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    const skillsAfter = await getStorageSkills(page);
    expect((skillsAfter as any[])[0].enabled).toBe(true);
  });

  test('E2E-5: LLM 调用 skill tool → 回复符合 skill prompt', async ({ extensionContext, extensionId }) => {
    await seedStorage(extensionContext, extensionId, {
      providers: [MOCK_PROVIDER],
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
