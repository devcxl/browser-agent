/**
 * 浮动按钮 E2E 测试。
 *
 * 测试内容：
 * - 加载扩展后，测试页出现浮动按钮 host 与按钮
 * - 点击按钮打开面板，iframe 加载 sidepanel.html?embedded=1
 * - 再次点击按钮关闭面板
 *
 * 前置条件：
 *   运行 `npm run build:chrome` 生成 dist/chrome-mv3/
 *
 * 运行方式：
 *   npx playwright test e2e/tests/floating-widget.spec.ts
 *
 * 实现说明：
 * - 浮动控件使用 closed shadow root（ADR 2026-07-19-floating-widget-native-dom
 *   刻意选择，用于与宿主页面强隔离）。Playwright 的 CSS / role 选择器无法穿透
 *   closed shadow 边界，因此通过 CDP 的 DOM.getDocument({ pierce: true }) 定位
 *   按钮节点，再用 DOM.getBoxModel 取中心坐标，以鼠标事件驱动真实点击。
 * - host 是零尺寸容器（`pointer-events: none`，内部按钮为 `auto`），断言必须用
 *   attached 而非 visible。
 * - 不能用 `window.frames` 检测 iframe：sandbox 属性使 JS 无法枚举该 frame。
 *   改用 Playwright 的 page.frames() 观察真实 browsing context。
 * - 扩展 UI 语言跟随浏览器 UI 语言（标准 _locales），故断言文案取 zh_CN 语言包。
 */

import { test, expect, chromium, type BrowserContext, type Page, type CDPSession } from '@playwright/test';
import path from 'path';

/** 构建产物的扩展目录（Chrome MV3） */
const EXTENSION_PATH = path.resolve(import.meta.dirname, '../../dist/chrome-mv3');

/** 浮动按钮 Shadow host 的 DOM id */
const HOST_ID = '#ba-floating-host';

/** 按钮 aria-label（扩展以 --lang=zh-CN 启动，取 zh_CN 语言包） */
const BUTTON_LABEL = '打开聊天';

interface CdpNode {
  nodeName: string;
  nodeId: number;
  attributes?: string[];
  children?: CdpNode[];
  shadowRoots?: CdpNode[];
  contentDocument?: CdpNode;
}

function nodeAttributes(node: CdpNode): Record<string, string> {
  const attrs: Record<string, string> = {};
  const list = node.attributes ?? [];
  for (let i = 0; i < list.length; i += 2) {
    attrs[list[i]!] = list[i + 1]!;
  }
  return attrs;
}

/** 在 pierce 后的 DOM 树中递归查找满足条件的节点 */
function findNode(root: CdpNode, predicate: (node: CdpNode) => boolean): CdpNode | null {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const hit = findNode(child, predicate);
    if (hit) return hit;
  }
  for (const shadow of root.shadowRoots ?? []) {
    const hit = findNode(shadow, predicate);
    if (hit) return hit;
  }
  if (root.contentDocument) {
    const hit = findNode(root.contentDocument, predicate);
    if (hit) return hit;
  }
  return null;
}

interface ShadowSnapshot {
  buttonCenter: { x: number; y: number } | null;
  panelDisplay: string | null;
}

/** 一次 CDP 往返取出按钮坐标与面板容器 display */
async function inspectShadow(cdp: CDPSession): Promise<ShadowSnapshot> {
  const { root } = (await cdp.send('DOM.getDocument', { depth: -1, pierce: true })) as {
    root: CdpNode;
  };

  const button = findNode(
    root,
    (node) => node.nodeName === 'BUTTON' && nodeAttributes(node)['aria-label'] === BUTTON_LABEL,
  );
  const panel = findNode(root, (node) => nodeAttributes(node)['class'] === 'panel-container');

  let buttonCenter: ShadowSnapshot['buttonCenter'] = null;
  if (button) {
    const box = (await cdp.send('DOM.getBoxModel', { nodeId: button.nodeId })) as {
      model: { content: number[] };
    };
    const [x1, y1, x2, y2] = box.model.content as [number, number, number, number];
    buttonCenter = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }

  let panelDisplay: string | null = null;
  if (panel) {
    const { computedStyle } = (await cdp.send('CSS.getComputedStyleForNode', {
      nodeId: panel.nodeId,
    })) as { computedStyle: Array<{ name: string; value: string }> };
    panelDisplay = computedStyle.find((p) => p.name === 'display')?.value ?? null;
  }

  return { buttonCenter, panelDisplay };
}

/** 点击穿透 closed shadow root 的浮动按钮 */
async function clickFloatingButton(page: Page, cdp: CDPSession): Promise<void> {
  const { buttonCenter } = await inspectShadow(cdp);
  if (!buttonCenter) throw new Error(`未找到 aria-label="${BUTTON_LABEL}" 的浮动按钮`);
  await page.mouse.click(buttonCenter.x, buttonCenter.y);
}

/** sidepanel iframe 是否已加载（sandbox 使 window.frames 不可枚举，故用 Playwright） */
function panelFrames(page: Page) {
  return page.frames().filter((f) => f.url().includes('sidepanel.html'));
}

test.describe('浮动按钮 E2E', () => {
  let context: BrowserContext;
  let page: Page;
  let cdp: CDPSession;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // 扩展 UI 文案跟随浏览器 UI 语言（标准 _locales）
        '--lang=zh-CN',
      ],
      viewport: { width: 1280, height: 720 },
    });

    // 等待 Service Worker / background 就绪
    await context.waitForEvent('serviceworker', { timeout: 30000 }).catch(() => {
      // Chrome 扩展可能没有 service worker，忽略
    });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test.beforeEach(async () => {
    page = await context.newPage();
    cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    // host 是零尺寸 Shadow 容器，必须用 attached 语义
    await page.locator(HOST_ID).waitFor({ state: 'attached', timeout: 15000 });
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('加载扩展后，测试页出现浮动按钮 host 与按钮', async () => {
    await expect(page.locator(HOST_ID)).toBeAttached();
    // 按钮位于 closed shadow root 内，须经 CDP 穿透确认其已渲染且有尺寸
    await expect.poll(async () => (await inspectShadow(cdp)).buttonCenter).not.toBeNull();
  });

  test('点击浮动按钮打开面板，iframe 加载 sidepanel.html', async () => {
    expect(panelFrames(page)).toHaveLength(0);

    await clickFloatingButton(page, cdp);

    // 面板容器由 none 变为 block
    await expect.poll(async () => (await inspectShadow(cdp)).panelDisplay, { timeout: 10000 })
      .toBe('block');

    // iframe 已加载 sidepanel.html?embedded=1
    await expect.poll(() => panelFrames(page).length, { timeout: 15000 }).toBeGreaterThan(0);
    expect(panelFrames(page)[0]!.url()).toContain('embedded=1');
  });

  test('再次点击按钮关闭面板', async () => {
    await clickFloatingButton(page, cdp);
    await expect.poll(async () => (await inspectShadow(cdp)).panelDisplay, { timeout: 10000 })
      .toBe('block');

    // 再次点击按钮 → toggle 关闭面板（250ms transition）
    await clickFloatingButton(page, cdp);

    await expect.poll(async () => (await inspectShadow(cdp)).panelDisplay, {
      timeout: 10000,
      intervals: [200],
    }).toBe('none');
  });
});
