import { describe, it, expect, vi } from 'vitest';
import { collectBrowserEnv } from '../browser-env';

function mockBrowser(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal('browser', {
    i18n: { getUILanguage: vi.fn().mockResolvedValue('zh-CN') },
    runtime: {
      getPlatformInfo: vi.fn().mockResolvedValue({ os: 'linux', arch: 'x86-64' }),
    },
    ...overrides,
  });
}

describe('collectBrowserEnv', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('采集版本/语言/时区/平台', async () => {
    mockBrowser();
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0',
      language: 'zh-CN',
      languages: ['zh-CN', 'en-US'],
    });

    const env = await collectBrowserEnv();

    expect(env.browser).toBe('Firefox 141.0');
    expect(env.uiLanguage).toBe('zh-CN');
    expect(env.language).toBe('zh-CN');
    expect(env.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(env.platform).toBe('Linux x86-64');
  });

  it('Chrome/Edge UA 识别', async () => {
    mockBrowser();
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      language: 'en-US',
    });
    expect((await collectBrowserEnv()).browser).toContain('Chrome');

    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Edg/126.0.0.0',
      language: 'en-US',
    });
    expect((await collectBrowserEnv()).browser).toContain('Edge');
  });

  it('WebExt API 缺失时降级到 navigator', async () => {
    // API 不存在（非 rejected）：直接缺方法
    mockBrowser({
      i18n: {},
      runtime: {},
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Firefox/141.0',
      language: 'ja-JP',
      platform: 'MacIntel',
    });

    const env = await collectBrowserEnv();
    expect(env.uiLanguage).toBe('ja-JP');
    expect(env.platform).toBe('MacIntel');
  });
});
