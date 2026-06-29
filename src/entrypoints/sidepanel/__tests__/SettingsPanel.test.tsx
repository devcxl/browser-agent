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
    endpoint: 'https://api.test.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-4o',
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

  it('编辑表单应包含语音模型输入框', async () => {
    const props = makeProps();
    renderWithI18n(<SettingsPanel {...props} />);

    const addBtn = screen.getByTestId('add-provider-button');
    await userEvent.click(addBtn);

    const input = screen.getByTestId('provider-stt-model-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', expect.stringContaining('语音模型'));
    expect(input.value).toBe('');
  });

  it('新增 Provider 时可填写 sttModel 并保存', async () => {
    const onSave = vi.fn();
    const props = makeProps({ onSaveProviders: onSave });
    renderWithI18n(<SettingsPanel {...props} />);

    const addBtn = screen.getByTestId('add-provider-button');
    await userEvent.click(addBtn);

    await userEvent.type(screen.getByTestId('provider-name-input'), 'My Provider');
    await userEvent.type(screen.getByTestId('provider-endpoint-input'), 'https://api.example.com/v1');
    await userEvent.type(screen.getByTestId('provider-apikey-input'), 'sk-xxx');
    await userEvent.type(screen.getByTestId('provider-model-input'), 'gpt-4o');
    await userEvent.type(screen.getByTestId('provider-stt-model-input'), 'whisper-1');

    await userEvent.click(screen.getByTestId('save-provider-button'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as ProviderConfig[];
    expect(saved[0].sttModel).toBe('whisper-1');
  });

  it('不填 sttModel 时保存的 ProviderConfig 应不含 sttModel 字段', async () => {
    const onSave = vi.fn();
    const props = makeProps({ onSaveProviders: onSave });
    renderWithI18n(<SettingsPanel {...props} />);

    const addBtn = screen.getByTestId('add-provider-button');
    await userEvent.click(addBtn);

    await userEvent.type(screen.getByTestId('provider-name-input'), 'My Provider');
    await userEvent.type(screen.getByTestId('provider-endpoint-input'), 'https://api.example.com/v1');
    await userEvent.type(screen.getByTestId('provider-apikey-input'), 'sk-xxx');
    await userEvent.type(screen.getByTestId('provider-model-input'), 'gpt-4o');

    await userEvent.click(screen.getByTestId('save-provider-button'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as ProviderConfig[];
    expect(saved[0].sttModel).toBeUndefined();
  });

  it('编辑已有 Provider 时应回显 sttModel', async () => {
    const provider = makeProvider({ sttModel: 'whisper-1' });
    const props = makeProps({ providers: [provider] });
    renderWithI18n(<SettingsPanel {...props} />);

    const editBtn = screen.getByText('编辑');
    await userEvent.click(editBtn);

    const input = screen.getByTestId('provider-stt-model-input') as HTMLInputElement;
    expect(input.value).toBe('whisper-1');
  });

  it('编辑已有 Provider 时应可修改 sttModel 并保存', async () => {
    const onSave = vi.fn();
    const provider = makeProvider({ sttModel: 'whisper-1' });
    const props = makeProps({ providers: [provider], onSaveProviders: onSave });
    renderWithI18n(<SettingsPanel {...props} />);

    await userEvent.click(screen.getByText('编辑'));

    const input = screen.getByTestId('provider-stt-model-input');
    await userEvent.clear(input);
    await userEvent.type(input, 'whisper-large-v3');

    await userEvent.click(screen.getByTestId('save-provider-button'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as ProviderConfig[];
    expect(saved[0].sttModel).toBe('whisper-large-v3');
  });

  it('Provider 列表卡片应在有 sttModel 时显示语音模型信息', () => {
    const provider = makeProvider({ sttModel: 'whisper-1' });
    const props = makeProps({ providers: [provider] });
    renderWithI18n(<SettingsPanel {...props} />);

    expect(screen.getByText(/🎤.*语音模型.*whisper-1/)).toBeInTheDocument();
  });

  it('Provider 列表卡片应在无 sttModel 时不显示语音模型信息', () => {
    const provider = makeProvider();
    const props = makeProps({ providers: [provider] });
    renderWithI18n(<SettingsPanel {...props} />);

    expect(screen.queryByText(/🎤.*语音模型/)).not.toBeInTheDocument();
  });

  it('sttModel 输入框值为空时保存应转为 undefined', async () => {
    const onSave = vi.fn();
    const provider = makeProvider({ sttModel: 'whisper-1' });
    const props = makeProps({ providers: [provider], onSaveProviders: onSave });
    renderWithI18n(<SettingsPanel {...props} />);

    await userEvent.click(screen.getByText('编辑'));

    const input = screen.getByTestId('provider-stt-model-input');
    await userEvent.clear(input);

    await userEvent.click(screen.getByTestId('save-provider-button'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as ProviderConfig[];
    expect(saved[0].sttModel).toBeUndefined();
  });
});
