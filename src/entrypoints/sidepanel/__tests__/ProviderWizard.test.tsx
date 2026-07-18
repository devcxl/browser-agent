import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderWizard } from '../components/ProviderWizard';
import { I18nProvider } from '../i18n/I18nProvider';
import { useI18n } from '../i18n/useI18n';
import { ConfigStore } from '@/shared/storage';
import type { ProviderConfig, ProviderModelConfig } from '@/shared/types';

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

afterEach(() => {
  ConfigStore.resetInstance();
});

// Mock ProviderCatalog
vi.mock('@/provider/provider-catalog', () => {
  const mockGetInstance = vi.fn().mockReturnValue({
    getProviderList: vi.fn().mockResolvedValue([]),
    getProvider: vi.fn().mockResolvedValue(null),
  });
  return {
    ProviderCatalog: {
      getInstance: mockGetInstance,
    },
  };
});

// ── helpers ─────────────────────────────────────────

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'p1',
    name: 'Test Provider',
    endpoint: 'https://api.test.com/v1',
    apiKey: 'sk-test',
    isLocalTrusted: false,
    models: {
      'gpt-4o': {
        id: 'gpt-4o',
        name: 'GPT-4o',
        limit: { context: 128000, output: 16384 },
        defaults: { maxOutputTokens: 4096 },
        tool_call: true,
        reasoning: false,
      },
    },
    ...overrides,
  };
}

function makeProps(overrides: Partial<React.ComponentProps<typeof ProviderWizard>> = {}) {
  return {
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

async function setLanguage(locale: 'zh-CN' | 'en') {
  await mockBrowser.local.set({ preferences: { language: locale } });
}

// ── tests ───────────────────────────────────────────

describe('ProviderWizard', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('initialStep', () => {
    it('initialStep=connection 时第一步显示连接配置而非模板选择', async () => {
      await setLanguage('en');
      const props = makeProps({ initialStep: 'connection' });
      renderWithI18n(<ProviderWizard {...props} />);

      expect(screen.getByTestId('provider-name-input')).toBeTruthy();
      expect(screen.getByTestId('provider-api-input')).toBeTruthy();
      expect(screen.queryByText('Choose a template')).toBeNull();
      expect(screen.queryByTestId('custom-template-button')).toBeNull();
    });

    it('initialStep=models 时不经过模板和连接步骤', async () => {
      await setLanguage('en');
      const provider = makeProvider();
      const props = makeProps({ provider, initialStep: 'models' });
      renderWithI18n(<ProviderWizard {...props} />);

      expect(screen.getByTestId('add-model-button')).toBeTruthy();
      expect(screen.queryByTestId('provider-name-input')).toBeNull();
      expect(screen.queryByTestId('custom-template-button')).toBeNull();
    });

    it('不传 initialStep 且无 provider（新建模式）默认进入模板步骤', async () => {
      await setLanguage('en');
      const props = makeProps();
      renderWithI18n(<ProviderWizard {...props} />);

      expect(screen.getByTestId('custom-template-button')).toBeTruthy();
      expect(screen.queryByTestId('provider-name-input')).toBeNull();
    });

    it('不传 initialStep 且传入 provider（编辑模式）进入连接配置步骤', async () => {
      await setLanguage('en');
      const provider = makeProvider();
      const props = makeProps({ provider });
      renderWithI18n(<ProviderWizard {...props} />);

      expect(screen.getByTestId('provider-name-input')).toBeTruthy();
      expect(screen.queryByTestId('custom-template-button')).toBeNull();
    });
  });

  describe('i18n', () => {
    it('中文环境下显示中文文案', async () => {
      await setLanguage('zh-CN');
      const props = makeProps();
      renderWithI18n(<ProviderWizard {...props} />);

      // Template step
      expect(screen.getByText('选择模板')).toBeTruthy();
      expect(screen.getByText('OpenAI 兼容端点')).toBeTruthy();
      expect(screen.getByPlaceholderText('搜索 models.dev provider...')).toBeTruthy();

      // Navigate to connection step
      await userEvent.click(screen.getByTestId('custom-template-button'));

      expect(screen.getByText('连接配置')).toBeTruthy();
      expect(screen.getByText('Provider 名称')).toBeTruthy();
      expect(screen.getByText('Base URL')).toBeTruthy();
      expect(screen.getByText('API Key（可选）')).toBeTruthy();
      expect(screen.getByText('标记为本地可信连接')).toBeTruthy();
      expect(screen.getByText('下一步')).toBeTruthy();

      // Navigate to models step
      await userEvent.type(screen.getByTestId('provider-name-input'), 'Test');
      const apiInput = screen.getByTestId('provider-api-input');
      // Clear the input fully before typing (default is empty for new provider)
      await userEvent.type(apiInput, 'https://api.example.com/v1');
      await userEvent.click(screen.getByTestId('provider-connection-next'));

      expect(screen.getByText('模型配置')).toBeTruthy();
      expect(screen.getByText('+ 添加模型')).toBeTruthy();
      expect(screen.getByText('请至少添加一个模型。')).toBeTruthy();
    });

    it('英文环境下显示英文文案', async () => {
      await setLanguage('en');
      const props = makeProps();
      renderWithI18n(<ProviderWizard {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Choose a template')).toBeTruthy();
      });
      expect(screen.getByText('OpenAI-compatible endpoint')).toBeTruthy();
      expect(screen.getByPlaceholderText('Search models.dev providers...')).toBeTruthy();

      // Navigate to connection step
      await userEvent.click(screen.getByTestId('custom-template-button'));

      expect(screen.getByText('Connection')).toBeTruthy();
      expect(screen.getByText('Provider name')).toBeTruthy();
      expect(screen.getByText('Base URL')).toBeTruthy();
      expect(screen.getByText('API Key (optional)')).toBeTruthy();
      expect(screen.getByText('Local trusted connection')).toBeTruthy();
      expect(screen.getByText('Continue')).toBeTruthy();

      // Navigate to models step
      await userEvent.type(screen.getByTestId('provider-name-input'), 'Test');
      const apiInput = screen.getByTestId('provider-api-input');
      await userEvent.type(apiInput, 'https://api.example.com/v1');
      await userEvent.click(screen.getByTestId('provider-connection-next'));

      expect(screen.getByText('Models')).toBeTruthy();
      expect(screen.getByText('+ Add model')).toBeTruthy();
      expect(screen.getByText('Add at least one model.')).toBeTruthy();
    });

    it('编辑已有 provider 时连接配置用中文显示', async () => {
      await setLanguage('zh-CN');
      const provider = makeProvider({ name: '我的 Provider' });
      const props = makeProps({ provider });
      renderWithI18n(<ProviderWizard {...props} />);

      expect(screen.getByText('连接配置')).toBeTruthy();
      expect(screen.getByDisplayValue('我的 Provider')).toBeTruthy();
    });

    it('保存时校验失败显示中文提示', async () => {
      await setLanguage('zh-CN');
      function TestComp() {
        const { t } = useI18n();
        return (
          <>
            <span data-testid="msg-model-invalid">{t('settings.provider.wizard.validation.modelInvalid')}</span>
            <span data-testid="msg-duplicate-id">{t('settings.provider.wizard.models.duplicateId')}</span>
          </>
        );
      }
      renderWithI18n(<TestComp />);

      await waitFor(() => {
        expect(screen.getByTestId('msg-model-invalid').textContent).toBe('请完善所有模型配置后再保存。');
        expect(screen.getByTestId('msg-duplicate-id').textContent).toBe('Model ID 不能重复。');
      });
    });

    it('校验失败时保存按钮被禁用', async () => {
      await setLanguage('zh-CN');
      const provider = makeProvider({
        models: {
          'bad': { id: '', name: '', limit: { context: 0, output: 0 }, defaults: {}, tool_call: false, reasoning: false },
        },
        defaultModelId: 'bad',
      });
      const props = makeProps({ provider, initialStep: 'models' });
      renderWithI18n(<ProviderWizard {...props} />);

      expect(screen.getByTestId('save-provider-button')).toBeDisabled();
    });

    it('重复 Model ID 时保存按钮被禁用', async () => {
      await setLanguage('zh-CN');
      const dupModel = {
        id: 'same-id',
        name: 'Dup',
        limit: { context: 128000, output: 16384 },
        defaults: { maxOutputTokens: 4096 },
        tool_call: true,
        reasoning: false,
      };
      const provider = makeProvider({
        models: {
          'key1': dupModel,
          'key2': { ...dupModel },
        },
        defaultModelId: 'same-id',
      });
      const props = makeProps({ provider, initialStep: 'models' });
      renderWithI18n(<ProviderWizard {...props} />);

      expect(screen.getByTestId('save-provider-button')).toBeDisabled();
    });
  });

  describe('model validation consistency', () => {
    it('valid model enables save button', async () => {
      await setLanguage('en');
      const validModel: ProviderModelConfig = {
        id: 'gpt-4o',
        name: 'GPT-4o',
        limit: { context: 128000, output: 16384 },
        defaults: { maxOutputTokens: 4096 },
        tool_call: true,
        reasoning: false,
      };

      const provider = makeProvider({
        models: { 'm1': validModel },
        defaultModelId: 'gpt-4o',
      });
      const props = makeProps({ provider, initialStep: 'models' });
      renderWithI18n(<ProviderWizard {...props} />);

      expect(screen.getByTestId('save-provider-button')).not.toBeDisabled();
    });

    it('invalid model disables save button', async () => {
      await setLanguage('en');
      const invalidModel: ProviderModelConfig = {
        id: '',
        name: '',
        limit: { context: 0, output: 0 },
        defaults: {},
        tool_call: false,
        reasoning: false,
      };

      const provider = makeProvider({
        models: { 'm1': invalidModel },
        defaultModelId: '',
      });
      const props = makeProps({ provider, initialStep: 'models' });
      renderWithI18n(<ProviderWizard {...props} />);

      expect(screen.getByTestId('save-provider-button')).toBeDisabled();
    });
  });
});
