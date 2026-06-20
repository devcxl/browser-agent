import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CapabilityDetector } from '../capability-detector';
import type { IBrowserAdapter } from '@/adapters/types';

describe('CapabilityDetector', () => {
  beforeEach(() => {
    (globalThis as any).browser = {
      notifications: {},
      contextMenus: {},
      alarms: {},
      webRequest: {},
      runtime: { connectNative: vi.fn() },
    };
    (globalThis as any).chrome = {
      bookmarks: {},
      history: {},
      downloads: {},
      cookies: {},
      sessions: {},
      scripting: {},
      clipboard: {},
      sidePanel: {},
      proxy: {},
      privacy: {},
      management: {},
      debugger: {},
      declarativeNetRequest: {},
      identity: {},
    };
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
    delete (globalThis as any).browser;
  });

  it('should detect all capabilities on Chrome', async () => {
    const adapter: IBrowserAdapter = { browserType: 'chrome' } as any;
    const detector = new CapabilityDetector(adapter);

    const caps = await detector.detect();

    expect(caps.tabs).toBe(true);
    expect(caps.windows).toBe(true);
    expect(caps.tabGroups).toBe(true);
    expect(caps.bookmarks).toBe(true);
    expect(caps.history).toBe(true);
    expect(caps.downloads).toBe(true);
    expect(caps.cookies).toBe(true);
    expect(caps.sessions).toBe(true);
    expect(caps.scripting).toBe(true);
    expect(caps.clipboard).toBe(true);
    expect(caps.notifications).toBe(true);
    expect(caps.contextMenus).toBe(true);
    expect(caps.sidePanel).toBe(true);
    expect(caps.alarms).toBe(true);
    expect(caps.proxy).toBe(true);
    expect(caps.privacy).toBe(true);
    expect(caps.management).toBe(true);
    expect(caps.debugger).toBe(true);
    expect(caps.webRequest).toBe(true);
    expect(caps.declarativeNetRequest).toBe(true);
    expect(caps.nativeMessaging).toBe(true);
    expect(caps.identity).toBe(true);
  });

  it('should detect limited capabilities on Firefox', async () => {
    const adapter: IBrowserAdapter = { browserType: 'firefox' } as any;
    const detector = new CapabilityDetector(adapter);

    const caps = await detector.detect();

    expect(caps.tabs).toBe(true);
    expect(caps.windows).toBe(true);
    expect(caps.tabGroups).toBe(false);
    expect(caps.bookmarks).toBe(false);
    expect(caps.history).toBe(false);
    expect(caps.scripting).toBe(false);
    expect(caps.notifications).toBe(true);
    expect(caps.contextMenus).toBe(true);
    expect(caps.alarms).toBe(true);
    expect(caps.webRequest).toBe(true);
    expect(caps.nativeMessaging).toBe(true);
  });

  it('should handle missing browser APIs gracefully', async () => {
    delete (globalThis as any).browser;
    (globalThis as any).browser = {};

    const adapter: IBrowserAdapter = { browserType: 'chrome' } as any;
    const detector = new CapabilityDetector(adapter);

    const caps = await detector.detect();

    expect(caps.notifications).toBe(false);
    expect(caps.contextMenus).toBe(false);
    expect(caps.alarms).toBe(false);
    expect(caps.webRequest).toBe(false);
    expect(caps.nativeMessaging).toBe(false);
  });
});
