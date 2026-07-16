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
      maxContextMessages: 50,
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

// ==================== 测试用例 ====================

describe('SettingsPanel - sttModel', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockBrowser.local.set({ preferences: { language: 'zh-CN' } });
  });

  it('点击 Add Provider 按钮应显示搜索面板', async () => {
    const props = makeProps();
    renderWithI18n(<SettingsPanel {...props} />);

    const addBtn = screen.getByTestId('add-provider-button');
    await userEvent.click(addBtn);

    expect(screen.getByPlaceholderText('Search providers...')).toBeTruthy();
    expect(screen.getByTestId('custom-provider-button')).toBeTruthy();
  });

  it('选中 provider 后应显示 API Key 输入框', async () => {
    const props = makeProps();
    renderWithI18n(<SettingsPanel {...props} />);

    await userEvent.click(screen.getByTestId('add-provider-button'));
    await userEvent.click(screen.getByTestId('custom-provider-button'));

    expect(screen.getByTestId('provider-apikey-input')).toBeTruthy();
    expect(screen.getByTestId('save-provider-button')).toBeTruthy();
  });

  it('已有 provider 时应显示 provider 卡片', () => {
    const provider = makeProvider({ sttModel: 'whisper-1' });
    const props = makeProps({ providers: [provider] });
    renderWithI18n(<SettingsPanel {...props} />);

    expect(screen.getByText('Test Provider')).toBeTruthy();
    expect(screen.getByText(/whisper-1/)).toBeTruthy();
  });

  it('已有 provider 无 sttModel 时不显示语音模型信息', () => {
    const provider = makeProvider();
    const props = makeProps({ providers: [provider] });
    renderWithI18n(<SettingsPanel {...props} />);

    expect(screen.getByText('Test Provider')).toBeTruthy();
    expect(screen.queryByText(/STT:/)).toBeFalsy();
  });

  it('可删除已有 provider', async () => {
    const onSave = vi.fn();
    const provider = makeProvider();
    const props = makeProps({ providers: [provider], onSaveProviders: onSave });
    renderWithI18n(<SettingsPanel {...props} />);

    await userEvent.click(screen.getByText('删除'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toHaveLength(0);
  });

  it('API key 为空时保存按钮应禁用', async () => {
    const onSave = vi.fn();
    const props = makeProps({ onSaveProviders: onSave });
    renderWithI18n(<SettingsPanel {...props} />);

    await userEvent.click(screen.getByTestId('add-provider-button'));
    await userEvent.click(screen.getByTestId('custom-provider-button'));

    const saveBtn = screen.getByTestId('save-provider-button');
    expect(saveBtn).toBeDisabled();
  });
});
