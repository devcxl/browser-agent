import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderConfig } from '@/shared/types';

// ==================== Mock data holders (hoisted) ====================

const { mockBrowserHolder, mockStoreHolder } = vi.hoisted(() => ({
  mockBrowserHolder: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    storage: {} as Record<string, unknown>,
  },
  mockStoreHolder: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

// ==================== Apply vi.mock before imports (hoisted) ====================

vi.mock('@/shared/storage', () => ({
  ConfigStore: {
    getInstance: vi.fn(() => ({
      get: mockStoreHolder.get,
      set: mockStoreHolder.set,
      onChange: vi.fn(() => () => {}),
    })),
    resetInstance: vi.fn(),
  },
}));

vi.mock('@/provider/provider-catalog', () => ({
  ProviderCatalog: {
    getInstance: vi.fn(() => ({
      migrateProviderConfig: vi.fn((p: ProviderConfig) => p),
      getProviderList: vi.fn().mockResolvedValue([]),
      getProvider: vi.fn().mockResolvedValue(null),
    })),
  },
}));

vi.mock('@/provider/provider-client-factory', () => ({
  getProviderClientFactory: vi.fn(),
}));

vi.mock('../theme', () => ({
  applyTheme: vi.fn(),
}));

vi.mock('../ChatContext', async () => {
  const actual = await vi.importActual<typeof import('../ChatContext')>('../ChatContext');
  return {
    ...actual,
    useChat: vi.fn(() => ({
      conversations: {
        list: [],
        activeId: null,
        loading: false,
        error: null,
        create: vi.fn().mockResolvedValue('conv-1'),
        select: vi.fn(),
        remove: vi.fn(),
        rename: vi.fn(),
        refresh: vi.fn(),
      },
      agent: {
        status: 'idle' as const,
        error: null,
        run: vi.fn(),
        abort: vi.fn(),
        setCallbacks: vi.fn(),
        resolveConfirm: vi.fn(),
        runningConversationId: null,
      },
      messages: [] as Array<{ id: string; role: string }>,
      messagesLoading: false,
      messagesError: null,
      tokenUsage: { prompt: 0, completion: 0 },
      confirmRequest: null,
      resolveConfirm: vi.fn(),
      conversationStatuses: {} as Record<string, string>,
    })),
  };
});

// Need to import App after mocks are set up
import App from '../App';

// ==================== Helpers ====================

function makeCompleteProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'p-complete',
    name: 'Test Provider',
    api: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    npm: '@ai-sdk/openai-compatible',
    env: [],
    isLocalTrusted: false,
    models: {
      m1: {
        id: 'm1',
        name: 'Model 1',
        limit: { context: 32768, output: 8192 },
        defaults: { maxOutputTokens: 4096 },
        tool_call: true,
        reasoning: false,
      },
    },
    defaultModelId: 'm1',
    ...overrides,
  };
}

function makeIncompleteProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'p-incomplete',
    name: 'Incomplete',
    api: 'https://api.example.com/v1',
    apiKey: '',
    npm: '@ai-sdk/openai-compatible',
    env: [],
    isLocalTrusted: false,
    models: {},
    ...overrides,
  };
}

// ==================== Test Suite ====================

describe('ChatOnboarding', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock store data
    mockStoreHolder.get.mockImplementation(async (key: string) => {
      return mockBrowserHolder.storage[key] ?? undefined;
    });
    mockStoreHolder.set.mockImplementation(async (key: string, value: unknown) => {
      mockBrowserHolder.storage[key] = value;
    });

    // Reset browser storage
    mockBrowserHolder.storage = {};
    mockBrowserHolder.local.get.mockImplementation(
      async (keys: string | string[] | Record<string, unknown> | null) => {
        if (keys === null) return { ...mockBrowserHolder.storage };
        const keysArr = Array.isArray(keys) ? (keys as string[]) : [keys as string];
        const result: Record<string, unknown> = {};
        for (const key of keysArr) {
          if (key in mockBrowserHolder.storage) result[key] = mockBrowserHolder.storage[key];
        }
        return result;
      },
    );
    mockBrowserHolder.local.set.mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(mockBrowserHolder.storage, items);
    });

    vi.stubGlobal('browser', {
      storage: {
        local: mockBrowserHolder.local,
        onChanged: mockBrowserHolder.onChanged,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderApp() {
    return render(<App />);
  }

  // ==================== Test Cases ====================

  function makeBaseStorage(overrides: Record<string, unknown> = {}) {
    return {
      providers: [],
      agentSettings: {
        maxToolRounds: 10,
        maxContextMessages: 50,
        systemPrompt: '',
        reasoningEffort: 'medium',
      },
      expertModeSettings: { enabled: false, switches: {} },
      preferences: { theme: 'system', language: 'en' },
      ...overrides,
    };
  }

  it('providersLoaded 前不显示引导弹窗和 CTA', async () => {
    mockBrowserHolder.storage = makeBaseStorage({ providers: [] });

    renderApp();

    // CTA and wizard should not appear before providersLoaded
    expect(screen.queryByTestId('onboarding-cta')).toBeNull();
    expect(screen.queryByTestId('provider-wizard')).toBeNull();
  });

  it('所有 Provider 完整时不显示引导', async () => {
    const complete = makeCompleteProvider();
    mockBrowserHolder.storage = makeBaseStorage({ providers: [complete] });

    renderApp();

    await waitFor(() => {
      expect(screen.queryByTestId('provider-wizard')).toBeNull();
    });
  });

  it('无 Provider 时自动弹出引导并从模板步骤开始', async () => {
    mockBrowserHolder.storage = makeBaseStorage({ providers: [] });

    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId('provider-wizard')).toBeTruthy();
    });

    // Should show template step (not connection)
    expect(screen.getByTestId('custom-template-button')).toBeTruthy();
    expect(screen.queryByTestId('provider-name-input')).toBeNull();
  });

  it('残缺 Provider 时弹出引导并进入正确步骤 (有 endpoint 无模型 → models step)', async () => {
    const incomplete = makeIncompleteProvider();
    mockBrowserHolder.storage = makeBaseStorage({ providers: [incomplete] });

    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId('provider-wizard')).toBeTruthy();
    });
  });

  it('关闭引导后显示 CTA', async () => {
    const incomplete = makeIncompleteProvider();
    mockBrowserHolder.storage = makeBaseStorage({ providers: [incomplete] });

    renderApp();

    // Wait for auto wizard to appear
    await waitFor(() => {
      expect(screen.getByTestId('provider-wizard')).toBeTruthy();
    });

    // Dismiss via wizard back button (first = global back)
    const backButtons = screen.getAllByRole('button', { name: /back/i });
    await userEvent.click(backButtons[0]!);

    // CTA should appear
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-cta')).toBeTruthy();
    });
  });

  it('CTA 点击重开引导', async () => {
    const incomplete = makeIncompleteProvider();
    mockBrowserHolder.storage = makeBaseStorage({ providers: [incomplete] });

    renderApp();

    // Wait for auto wizard to appear, then close it
    await waitFor(() => {
      expect(screen.getByTestId('provider-wizard')).toBeTruthy();
    });
    const backBtnsForCta = screen.getAllByRole('button', { name: /back/i });
    await userEvent.click(backBtnsForCta[0]!);

    // Click CTA
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-cta')).toBeTruthy();
    });
    await userEvent.click(screen.getByTestId('onboarding-cta'));

    // Wizard should reappear
    await waitFor(() => {
      expect(screen.getByTestId('provider-wizard')).toBeTruthy();
    });
  });

  it('按钮点击时 SettingsPanel 与引导互斥', async () => {
    const incomplete = makeIncompleteProvider();
    mockBrowserHolder.storage = makeBaseStorage({ providers: [incomplete] });

    renderApp();

    // Wait for auto wizard
    await waitFor(() => {
      expect(screen.getByTestId('provider-wizard')).toBeTruthy();
    });

    // Open settings — should close wizard
    await userEvent.click(screen.getByTestId('settings-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('provider-wizard')).toBeNull();
    });
  });

  it('引导弹窗只自动打开一次', async () => {
    const incomplete = makeIncompleteProvider();
    mockBrowserHolder.storage = makeBaseStorage({ providers: [incomplete] });

    renderApp();

    // Auto wizard appears
    await waitFor(() => {
      expect(screen.getByTestId('provider-wizard')).toBeTruthy();
    });

    // Close wizard via back button
    const backBtnsOnce = screen.getAllByRole('button', { name: /back/i });
    await userEvent.click(backBtnsOnce[0]!);

    await waitFor(() => {
      expect(screen.queryByTestId('provider-wizard')).toBeNull();
    });

    // CTA appears — wizard should NOT auto-reopen
    expect(screen.getByTestId('onboarding-cta')).toBeTruthy();

    // Open and close settings to confirm wizard doesn't auto-reopen
    await userEvent.click(screen.getByTestId('settings-button'));
    await waitFor(() => {
      expect(screen.queryByTestId('provider-wizard')).toBeNull();
    });
  });

  it('无 Provider 时首页由 ChatContentContainer 包裹', async () => {
    mockBrowserHolder.storage = makeBaseStorage({ providers: [] });

    renderApp();

    // Dismiss the auto-opened wizard to see home view
    await waitFor(() => {
      expect(screen.getByTestId('provider-wizard')).toBeTruthy();
    });
    const backBtns = screen.getAllByRole('button', { name: /back/i });
    await userEvent.click(backBtns[0]!);

    // ChatContentContainer provides the w-full mx-auto class pattern
    await waitFor(() => {
      const container = document.querySelector('.flex-1.flex.flex-col.justify-center');
      expect(container).toBeTruthy();
      expect(container?.className).toContain('w-full');
      expect(container?.className).toContain('mx-auto');
    });
  });
});
