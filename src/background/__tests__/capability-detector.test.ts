import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CapabilityDetector } from '../capability-detector';
import type { IBrowserAdapter } from '@/adapters/types';

function createMockAdapter(browserType: 'chrome' | 'firefox'): IBrowserAdapter {
  return {
    browserType,
    tabs: {} as any,
    windows: {} as any,
    tabGroups: {} as any,
    history: {} as any,
    notifications: {} as any,
    addListener: vi.fn() as any,
  };
}

function setBrowser(obj: Record<string, any>): void {
  (globalThis as any).browser = obj;
}

const ALL_APIS: Record<string, any> = {
  sessions: {},
  scripting: {},
  notifications: {},
  contextMenus: {},
  alarms: {},
  proxy: {},
  privacy: {},
  management: {},
  debugger: {},
  webRequest: {},
  declarativeNetRequest: {},
  runtime: { connectNative: {} },
  identity: {},
};

describe('CapabilityDetector', () => {
  let adapter: IBrowserAdapter;

  // ── Chrome 环境 ──────────────────────────────────────

  describe('Chrome 环境', () => {
    beforeEach(() => {
      adapter = createMockAdapter('chrome');
      setBrowser(ALL_APIS);
    });

    it('tabGroups / sidePanel / clipboard 为 true', () => {
      const detector = new CapabilityDetector(adapter);
      const caps = detector.detect();
      expect(caps.tabGroups).toBe(true);
      expect(caps.sidePanel).toBe(true);
      expect(caps.clipboard).toBe(true);
    });

    it('核心能力（tabs / windows）为 true', () => {
      const detector = new CapabilityDetector(adapter);
      const caps = detector.detect();
      expect(caps.tabs).toBe(true);
      expect(caps.windows).toBe(true);
      expect(caps.bookmarks).toBe(true);
      expect(caps.history).toBe(true);
      expect(caps.downloads).toBe(true);
      expect(caps.cookies).toBe(true);
    });

    it('覆盖全部 22 个能力域', () => {
      const detector = new CapabilityDetector(adapter);
      const caps = detector.detect();
      const keys = Object.keys(caps);
      expect(keys).toHaveLength(22);
      for (const v of Object.values(caps)) {
        expect(typeof v).toBe('boolean');
      }
    });
  });

  // ── Firefox 环境 ─────────────────────────────────────

  describe('Firefox 环境', () => {
    beforeEach(() => {
      adapter = createMockAdapter('firefox');
      setBrowser(ALL_APIS);
    });

    it('tabGroups / sidePanel / clipboard 为 false', () => {
      const detector = new CapabilityDetector(adapter);
      const caps = detector.detect();
      expect(caps.tabGroups).toBe(false);
      expect(caps.sidePanel).toBe(false);
      expect(caps.clipboard).toBe(false);
    });

    it('核心能力仍为 true', () => {
      const detector = new CapabilityDetector(adapter);
      const caps = detector.detect();
      expect(caps.tabs).toBe(true);
      expect(caps.windows).toBe(true);
    });
  });

  // ── 缓存行为 ────────────────────────────────────────

  describe('缓存', () => {
    it('缓存生效：首次检测后修改 adapter，仍返回缓存结果', () => {
      adapter = createMockAdapter('chrome');
      setBrowser({ sessions: {} });

      const detector = new CapabilityDetector(adapter);
      const first = detector.detect();
      expect(first.tabGroups).toBe(true);

      (adapter as any).browserType = 'firefox';
      const second = detector.detect();
      expect(second.tabGroups).toBe(true);
    });

    it('invalidateCache 后重新检测', () => {
      adapter = createMockAdapter('chrome');
      setBrowser({ sessions: {} });

      const detector = new CapabilityDetector(adapter);
      const first = detector.detect();
      expect(first.tabGroups).toBe(true);

      detector.invalidateCache();
      (adapter as any).browserType = 'firefox';
      const second = detector.detect();
      expect(second.tabGroups).toBe(false);
    });
  });

  // ── checkApi 运行时检测 ──────────────────────────────

  describe('checkApi 运行时检测', () => {
    beforeEach(() => {
      adapter = createMockAdapter('chrome');
    });

    it('API 不存在时返回 false', () => {
      setBrowser({});

      const detector = new CapabilityDetector(adapter);
      const caps = detector.detect();
      expect(caps.scripting).toBe(false);
      expect(caps.sessions).toBe(false);
    });

    it('API 存在时返回 true', () => {
      setBrowser({ scripting: {}, sessions: {} });

      const detector = new CapabilityDetector(adapter);
      const caps = detector.detect();
      expect(caps.scripting).toBe(true);
      expect(caps.sessions).toBe(true);
    });

    it('nativeMessaging 依赖 runtime.connectNative', () => {
      setBrowser({ runtime: {}, sessions: {} });
      const detector1 = new CapabilityDetector(adapter);
      expect(detector1.detect().nativeMessaging).toBe(false);

      setBrowser({ runtime: { connectNative: {} }, sessions: {} });
      const detector2 = new CapabilityDetector(adapter);
      expect(detector2.detect().nativeMessaging).toBe(true);
    });
  });

  // ── 返回结果独立性 ──────────────────────────────────

  describe('返回结果独立性', () => {
    it('两次调用返回不同对象引用', () => {
      adapter = createMockAdapter('chrome');
      setBrowser({ sessions: {} });

      const detector = new CapabilityDetector(adapter);
      const first = detector.detect();
      const second = detector.detect();

      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });

    it('修改返回值不影响缓存', () => {
      adapter = createMockAdapter('chrome');
      setBrowser({ sessions: {} });

      const detector = new CapabilityDetector(adapter);
      const first = detector.detect();
      (first as any).tabs = false;

      const second = detector.detect();
      expect(second.tabs).toBe(true);
    });
  });
});
