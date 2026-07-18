import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsPanel } from '../components/SettingsPanel';
import { I18nProvider } from '../i18n/I18nProvider';
import type { ProviderConfig } from '@/shared/types';
import { ConfigStore } from '@/shared/storage';

// Mock browser.storage for I18nProvider
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

afterEach(() => {
  ConfigStore.resetInstance();
});

// Mock stores used internally by SettingsPanel (skills tab)
vi.mock('@/shared/github-skill-fetcher', () => ({
  fetchSkillsFromGitHub: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/shared/storage', async () => {
  const actual = await vi.importActual('@/shared/storage');
  const mockSkillStore = {
    getAll: vi.fn().mockResolvedValue([]),
    getEnabled: vi.fn().mockResolvedValue([]),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    loadReady: vi.fn().mockResolvedValue([]),
    onChange: vi.fn().mockReturnValue(() => {}),
  };
  const mockSubStore = {
    getAll: vi.fn().mockResolvedValue([]),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    onChange: vi.fn().mockReturnValue(() => {}),
  };
  return {
    ...actual,
    SkillStore: { getInstance: vi.fn().mockReturnValue(mockSkillStore) },
    SkillSubscriptionStore: { getInstance: vi.fn().mockReturnValue(mockSubStore) },
  };
});

// ==================== 测试辅助 ====================

function makeProps(overrides: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  return {
    providers: [],
    agentSettings: {
      maxToolRounds: 10,
      contextWindowTokens: 128000,
      tokenBudgetMargin: 4096,
      microcompactKeepRecent: 10,
      microcompactMinChars: 500,
      microcompactExcludeTools: [],
      systemPrompt: '',
      reasoningEffort: 'medium' as const,
    },
    expertMode: { enabled: false, switches: {} },
    onSaveProviders: vi.fn(),
    onSaveAgentSettings: vi.fn(),
    onSaveExpertMode: vi.fn(),
    onTestConnection: vi.fn().mockResolvedValue(true),
    onClose: vi.fn(),
    ...overrides,
  };
}

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'p1',
    name: 'Test Provider',
    providerId: 'openai',
    endpoint: 'https://api.test.com/v1',
    apiKey: 'sk-test',
    isLocalTrusted: false,
    ...overrides,
  };
}

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

async function openProviderSettings() {
  await userEvent.click(screen.getByTestId('settings-provider-tab'));
}

// ==================== 测试用例 ====================

describe('SettingsPanel', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockBrowser.local.set({ preferences: { language: 'zh-CN' } });
  });

  it('默认将外观放在首个 Tab 并使用互斥的自定义下拉', async () => {
    const props = makeProps();
    renderWithI18n(<SettingsPanel {...props} />);

    const appearanceTab = screen.getByTestId('settings-appearance-tab');
    expect(appearanceTab.parentElement?.firstElementChild).toBe(appearanceTab);
    const themeSelect = screen.getByRole('combobox', { name: '主题' });
    const languageSelect = screen.getByRole('combobox', { name: '界面语言' });
    expect(themeSelect).toBeTruthy();
    expect(languageSelect).toBeTruthy();
    expect(screen.queryByTestId('add-provider-button')).toBeNull();

    await userEvent.click(themeSelect);
    expect(screen.getByRole('listbox', { name: '主题' })).toBeTruthy();
    await userEvent.click(languageSelect);
    expect(screen.queryByRole('listbox', { name: '主题' })).toBeNull();
    expect(screen.getByRole('listbox', { name: '界面语言' })).toBeTruthy();
  });

  it('Agent 设置使用执行步数并移除消息数上限', async () => {
    const props = makeProps();
    renderWithI18n(<SettingsPanel {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Agent' }));

    expect(screen.getByText('单次任务最大执行步数')).toBeTruthy();
    expect(screen.queryByText('上下文最大消息数')).toBeNull();
  });

  it('点击 Add Provider 按钮应打开三步配置器', async () => {
    const props = makeProps();
    renderWithI18n(<SettingsPanel {...props} />);
    await openProviderSettings();

    await userEvent.click(screen.getByTestId('add-provider-button'));

    expect(screen.getByTestId('provider-wizard')).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索 models.dev provider...')).toBeTruthy();
    expect(screen.getByTestId('custom-template-button')).toBeTruthy();
  });

  it('选择兼容模板后应显示连接配置', async () => {
    const props = makeProps();
    renderWithI18n(<SettingsPanel {...props} />);
    await openProviderSettings();

    await userEvent.click(screen.getByTestId('add-provider-button'));
    await userEvent.click(screen.getByTestId('custom-template-button'));

    expect(screen.getByTestId('provider-apikey-input')).toBeTruthy();
    expect(screen.getByTestId('provider-name-input')).toBeTruthy();
    expect(screen.getByTestId('provider-api-input')).toBeTruthy();
  });

  it('已有 provider 时应显示默认模型与模型数量', async () => {
    const provider = makeProvider({
      models: {
        'gpt-test': { id: 'gpt-test', name: 'GPT Test', limit: { context: 32768, output: 8192 } },
      },
      defaultModelId: 'gpt-test',
    });
    const props = makeProps({ providers: [provider] });
    renderWithI18n(<SettingsPanel {...props} />);
    await openProviderSettings();

    expect(screen.getByText('Test Provider')).toBeTruthy();
    expect(screen.getByText(/Default: GPT Test/)).toBeTruthy();
  });

  it('可删除已有 provider', async () => {
    const onSave = vi.fn();
    const provider = makeProvider();
    const props = makeProps({ providers: [provider], onSaveProviders: onSave });
    renderWithI18n(<SettingsPanel {...props} />);
    await openProviderSettings();

    await userEvent.click(screen.getByText('删除'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toHaveLength(0);
  });

  it('可保存无 API Key 的自定义 OpenAI-compatible Provider 与模型快照', async () => {
    const onSave = vi.fn();
    const props = makeProps({ onSaveProviders: onSave });
    renderWithI18n(<SettingsPanel {...props} />);
    await openProviderSettings();

    await userEvent.click(screen.getByTestId('add-provider-button'));
    await userEvent.click(screen.getByTestId('custom-template-button'));
    await userEvent.type(screen.getByTestId('provider-name-input'), 'My Gateway');
    await userEvent.type(screen.getByTestId('provider-api-input'), 'https://gateway.example.com/v1');
    await userEvent.click(screen.getByTestId('provider-connection-next'));
    await userEvent.click(screen.getByTestId('add-model-button'));
    await userEvent.type(screen.getByPlaceholderText('Model ID'), 'qwen3-32b');
    await userEvent.type(screen.getByPlaceholderText('显示名称'), 'Qwen3 32B');
    await userEvent.click(screen.getByTestId('save-provider-button'));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        name: 'My Gateway',
        api: 'https://gateway.example.com/v1',
        npm: '@ai-sdk/openai-compatible',
        isCustom: true,
        models: expect.objectContaining({
          'qwen3-32b': expect.objectContaining({ id: 'qwen3-32b', name: 'Qwen3 32B' }),
        }),
      }),
    ]);
  });
});
