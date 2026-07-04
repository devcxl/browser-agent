import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
import { useI18n } from '../i18n/useI18n';
import { ConfigStore } from '@/shared/storage';

// ── browser.storage mock ────────────────────────────

function createMockBrowser() {
  const storage: Record<string, unknown> = {};
  const listeners: Array<(changes: Record<string, browser.storage.StorageChange>) => void> = [];

  const local = {
    get: vi.fn(async (keys: string | string[] | Record<string, unknown> | null) => {
      if (keys === null) return { ...storage };
      const keysArr = Array.isArray(keys) ? (keys as string[]) : [keys as string];
      const result: Record<string, unknown> = {};
      for (const key of keysArr) {
        if (key in storage) result[key] = storage[key];
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(storage, items);
    }),
    remove: vi.fn(),
    clear: vi.fn(),
  };

  const onChanged = {
    addListener: vi.fn((listener: typeof listeners[0]) => {
      listeners.push(listener);
    }),
    removeListener: vi.fn((listener: typeof listeners[0]) => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
  };

  return { local, onChanged, storage, listeners };
}

let mockBrowser: ReturnType<typeof createMockBrowser>;

beforeEach(() => {
  mockBrowser = createMockBrowser();
  vi.stubGlobal('browser', {
    storage: {
      local: mockBrowser.local,
      onChanged: mockBrowser.onChanged,
    },
  });
  ConfigStore.resetInstance();
});

// 不清理 browser global（beforeEach 会覆盖），只重置单例
afterEach(() => {
  ConfigStore.resetInstance();
});

// ── 测试组件 ────────────────────────────────────────

function TestComponent() {
  const { t, locale } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="common-send">{t('common.send')}</span>
      <span data-testid="skills-count">{t('settings.skills.skillsCount', { count: 5 })}</span>
      <span data-testid="missing">{t('nonexistent.key')}</span>
    </div>
  );
}

function LocaleDisplay() {
  const { locale } = useI18n();
  return <span data-testid="locale-display">{locale}</span>;
}

// ── 测试用例 ────────────────────────────────────────

describe('I18nProvider + useI18n', () => {
  it('renders with zh-CN locale and messages', async () => {
    await mockBrowser.local.set({ preferences: { language: 'zh-CN' } });

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    );

    expect(await screen.findByTestId('locale')).toHaveTextContent('zh-CN');
    expect(await screen.findByTestId('common-send')).toHaveTextContent('发送');
  });

  it('renders with en locale when preferences.language is en', async () => {
    await mockBrowser.local.set({ preferences: { language: 'en' } });

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('en');
    });
    expect(screen.getByTestId('common-send')).toHaveTextContent('Send');
  });

  it('replaces template variables in locale strings', async () => {
    await mockBrowser.local.set({ preferences: { language: 'zh-CN' } });

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    );

    // settings.skills.skillsCount = "{count} 个技能" with { count: 5 } → "5 个技能"
    expect(await screen.findByTestId('skills-count')).toHaveTextContent('5 个技能');
  });

  it('returns key itself for missing keys', async () => {
    await mockBrowser.local.set({ preferences: { language: 'zh-CN' } });

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    );

    expect(await screen.findByTestId('missing')).toHaveTextContent('nonexistent.key');
  });

  it('setLanguage updates locale and messages', async () => {
    await mockBrowser.local.set({ preferences: { language: 'zh-CN' } });

    let setLang: (lang: 'zh-CN' | 'en') => Promise<void>;

    function SetterComponent() {
      const { t, locale, setLanguage } = useI18n();
      setLang = setLanguage;
      return (
        <div>
          <span data-testid="locale-value">{locale}</span>
          <span data-testid="msg-value">{t('common.send')}</span>
        </div>
      );
    }

    render(
      <I18nProvider>
        <SetterComponent />
      </I18nProvider>,
    );

    expect(await screen.findByTestId('locale-value')).toHaveTextContent('zh-CN');
    expect(await screen.findByTestId('msg-value')).toHaveTextContent('发送');

    await act(async () => {
      await setLang!('en');
    });

    expect(await screen.findByTestId('locale-value')).toHaveTextContent('en');
    expect(await screen.findByTestId('msg-value')).toHaveTextContent('Send');
  });

  it('updates language when ConfigStore changes externally (cross-tab sync)', async () => {
    await mockBrowser.local.set({ preferences: { language: 'zh-CN' } });

    render(
      <I18nProvider>
        <LocaleDisplay />
      </I18nProvider>,
    );

    expect(await screen.findByTestId('locale-display')).toHaveTextContent('zh-CN');

    // Simulate external storage change (trigger onChange listener)
    await act(async () => {
      const change: Record<string, browser.storage.StorageChange> = {
        preferences: { newValue: { language: 'en' } },
      };
      for (const listener of mockBrowser.listeners) {
        listener(change);
      }
    });

    expect(await screen.findByTestId('locale-display')).toHaveTextContent('en');
  });
});

describe('useI18n outside provider', () => {
  it('throws error when used outside I18nProvider', () => {
    function BadComponent() {
      useI18n();
      return null;
    }

    expect(() => render(<BadComponent />)).toThrow(
      'useI18n must be used within an <I18nProvider>',
    );
  });
});
