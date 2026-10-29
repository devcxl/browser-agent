import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsPanel } from '../components/SettingsPanel';
import type { ProviderConfig } from '@/shared/types';
import type { ConnectionTestResult } from '@/provider/connection-test';
import { ConfigStore } from '@/shared/storage';
import { createI18nMock } from '@/test/i18n-mock';

// Mock browser.storage（ConfigStore 依赖）
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
    i18n: createI18nMock(),
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
    },
    expertMode: { enabled: false, switches: {} },
    onSaveProviders: vi.fn(),
    onSaveAgentSettings: vi.fn(),
    onSaveExpertMode: vi.fn(),
    onTestConnection: vi.fn().mockResolvedValue({ ok: true }),
    onClose: vi.fn(),
    open: true,
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
  return render(ui);
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
    expect(themeSelect).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: '界面语言' })).toBeNull();
    expect(screen.queryByTestId('add-provider-button')).toBeNull();

    await userEvent.click(themeSelect);
    expect(screen.getByRole('listbox', { name: '主题' })).toBeTruthy();
  });

  it('数据 tab 可进入并展示导出与导入入口', async () => {
    renderWithI18n(<SettingsPanel {...makeProps()} />);

    await userEvent.click(screen.getByRole('button', { name: '数据' }));

    expect(screen.getByTestId('export-all-button')).toBeTruthy();
    expect(screen.getByTestId('import-label')).toBeTruthy();
  });

  it('Agent 设置展示智能执行保护且不再暴露固定步数输入', async () => {
    const props = makeProps();
    renderWithI18n(<SettingsPanel {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Agent' }));

    // 展示熔断保护说明
    expect(screen.getByText('智能执行保护')).toBeTruthy();
    expect(
      screen.getByText('已启用任务死循环与连续失败自动熔断保护，长任务不再受固定步数上限限制。'),
    ).toBeTruthy();
    expect(screen.getByTestId('agent-circuit-breaker-info')).toBeTruthy();

    // 不再渲染 maxToolRounds 数字输入，也不再有旧的消息数上限
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByText('单次任务最大执行步数')).toBeNull();
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

  // ==================== 主色 ====================

  it('外观 tab 默认展示暖橙主色与预设色板', async () => {
    renderWithI18n(<SettingsPanel {...makeProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId('accent-color-value').textContent).toBe('#c2410c');
    });
    expect(screen.getByTestId('accent-color-input')).toHaveValue('#c2410c');
    expect(screen.getAllByTestId(/^accent-preset-/)).toHaveLength(6);
  });

  it('点击预设色立即应用并持久化', async () => {
    renderWithI18n(<SettingsPanel {...makeProps()} />);
    await waitFor(() => expect(screen.getByTestId('accent-color-value')).toBeTruthy());

    await userEvent.click(screen.getByTestId('accent-preset-2563eb'));

    await waitFor(() => {
      expect(screen.getByTestId('accent-color-value').textContent).toBe('#2563eb');
    });
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2563eb');
    expect(document.documentElement.style.getPropertyValue('--on-accent')).toMatch(/^#[0-9a-f]{6}$/);
    await waitFor(() => {
      expect(mockBrowser.local.set).toHaveBeenCalledWith({
        preferences: expect.objectContaining({ accentColor: '#2563eb' }),
      });
    });
  });

  it('自定义颜色输入立即应用并写入偏好', async () => {
    renderWithI18n(<SettingsPanel {...makeProps()} />);
    await waitFor(() => expect(screen.getByTestId('accent-color-value')).toBeTruthy());

    fireEvent.change(screen.getByTestId('accent-color-input'), { target: { value: '#7c3aed' } });

    await waitFor(() => {
      expect(screen.getByTestId('accent-color-value').textContent).toBe('#7c3aed');
    });
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#7c3aed');
    await waitFor(() => {
      expect(mockBrowser.local.set).toHaveBeenCalledWith({
        preferences: expect.objectContaining({ accentColor: '#7c3aed' }),
      });
    });
  });

  it('切换主题时保留已选主色并按深色重新派生', async () => {
    renderWithI18n(<SettingsPanel {...makeProps()} />);
    await waitFor(() => expect(screen.getByTestId('accent-color-value')).toBeTruthy());

    await userEvent.click(screen.getByTestId('accent-preset-2563eb'));
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2563eb');
    });

    await userEvent.click(screen.getByRole('combobox', { name: '主题' }));
    await userEvent.click(screen.getByRole('option', { name: '深色' }));

    await waitFor(() => {
      // 深色下主色被提亮，不再是浅色原值，但仍是同一色相来源
      expect(document.documentElement.style.getPropertyValue('--accent')).not.toBe('#2563eb');
    });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await waitFor(() => {
      expect(mockBrowser.local.set).toHaveBeenCalledWith({
        preferences: expect.objectContaining({ theme: 'dark', accentColor: '#2563eb' }),
      });
    });
  });

  // ==================== 连通性测试 ====================

  describe('连通性测试 (Connection Test)', () => {
    it('正确区分 ConnectionTestResult 失败，绝不将 failure 对象误判为通过', async () => {
      const provider = makeProvider({ id: 'p1', name: 'OpenAI Provider' });
      const onTestConnection = vi.fn<[ProviderConfig], Promise<ConnectionTestResult>>().mockResolvedValue({
        ok: false,
        reason: 'request-failed',
      });
      const props = makeProps({
        providers: [provider],
        onTestConnection,
      });

      renderWithI18n(<SettingsPanel {...props} />);
      await openProviderSettings();

      const testBtn = screen.getByRole('button', { name: /测试|test/i });
      await userEvent.click(testBtn);

      await waitFor(() => {
        expect(onTestConnection).toHaveBeenCalledWith(provider);
      });

      // 绝不能显示通过
      expect(screen.queryByText(/连接验证成功|Connection verified/)).toBeNull();

      // 必须显示失败并包含针对 request-failed 的排查提示（如 Base URL / /v1）
      const errorEl = await screen.findByRole('alert');
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toMatch(/连接失败|Connection failed/);
      expect(errorEl.textContent).toMatch(/Base URL|\/v1/);
    });

    it('连通性测试通过时显示成功状态与无障碍 live 属性', async () => {
      const provider = makeProvider({ id: 'p1', name: 'OpenAI Provider' });
      const onTestConnection = vi.fn<[ProviderConfig], Promise<ConnectionTestResult>>().mockResolvedValue({ ok: true });
      const props = makeProps({
        providers: [provider],
        onTestConnection,
      });

      renderWithI18n(<SettingsPanel {...props} />);
      await openProviderSettings();

      const testBtn = screen.getByRole('button', { name: /测试|test/i });
      await userEvent.click(testBtn);

      const statusEl = await screen.findByRole('status');
      expect(statusEl).toBeTruthy();
      expect(statusEl.textContent).toMatch(/连接验证成功|Connection verified/);
    });

    it('测试状态按 provider.id 索引，删除前面的 provider 不导致状态错位', async () => {
      const p1 = makeProvider({ id: 'p1', name: 'Provider 1' });
      const p2 = makeProvider({ id: 'p2', name: 'Provider 2' });
      const onSaveProviders = vi.fn();
      const onTestConnection = vi.fn(async (p: ProviderConfig): Promise<ConnectionTestResult> => {
        if (p.id === 'p2') return { ok: true };
        return { ok: false, reason: 'auth' };
      });

      const { rerender } = renderWithI18n(
        <SettingsPanel
          {...makeProps({
            providers: [p1, p2],
            onSaveProviders,
            onTestConnection,
          })}
        />,
      );
      await openProviderSettings();

      const testButtons = screen.getAllByRole('button', { name: /测试|test/i });
      // 测试第二个 provider (p2)
      await userEvent.click(testButtons[1]!);

      await screen.findByText(/连接验证成功|Connection verified/);

      // 删除第一个 provider (p1)
      const deleteButtons = screen.getAllByRole('button', { name: '删除' });
      await userEvent.click(deleteButtons[0]!);

      expect(onSaveProviders).toHaveBeenCalledWith([p2]);

      // 重新渲染为仅剩 p2
      rerender(
        <SettingsPanel
          {...makeProps({
            providers: [p2],
            onSaveProviders,
            onTestConnection,
          })}
        />,
      );

      // p2 仍应保留其通过状态，不会因为下标由 1 变成 0 导致丢失或错位
      expect(screen.getByText(/连接验证成功|Connection verified/)).toBeTruthy();
    });

    it('provider endpoint 变更后丢弃在途的过期测试结果', async () => {
      let resolveTest!: (result: ConnectionTestResult) => void;
      const testPromise = new Promise<ConnectionTestResult>((resolve) => {
        resolveTest = resolve;
      });
      const onTestConnection = vi.fn<[ProviderConfig], Promise<ConnectionTestResult>>().mockReturnValue(testPromise);
      const onSaveProviders = vi.fn();
      const p1 = makeProvider({ id: 'p1', name: 'Provider 1', endpoint: 'https://old.endpoint/v1' });

      const { rerender } = renderWithI18n(
        <SettingsPanel
          {...makeProps({
            providers: [p1],
            onSaveProviders,
            onTestConnection,
          })}
        />,
      );
      await openProviderSettings();

      const testBtn = screen.getByRole('button', { name: /测试|test/i });
      await userEvent.click(testBtn);

      // 在测试还在 in-flight 时，provider endpoint 发生更新
      const updatedP1 = { ...p1, endpoint: 'https://new.endpoint/v1' };
      rerender(
        <SettingsPanel
          {...makeProps({
            providers: [updatedP1],
            onSaveProviders,
            onTestConnection,
          })}
        />,
      );

      // 慢请求返回（针对旧 endpoint 的测试成功）
      await act(async () => {
        resolveTest({ ok: true });
      });

      // 绝不能将旧配置的通过结果展示到更新后的 provider 上
      await waitFor(() => {
        expect(screen.queryByText(/连接验证成功|Connection verified/)).toBeNull();
      });
    });

    it('provider defaultModelId 或 models 变更后丢弃在途的过期测试结果', async () => {
      let resolveTest!: (result: ConnectionTestResult) => void;
      const testPromise = new Promise<ConnectionTestResult>((resolve) => {
        resolveTest = resolve;
      });
      const onTestConnection = vi.fn<[ProviderConfig], Promise<ConnectionTestResult>>().mockReturnValue(testPromise);
      const onSaveProviders = vi.fn();
      const p1 = makeProvider({
        id: 'p1',
        name: 'Provider 1',
        defaultModelId: 'gpt-old',
        models: {
          'gpt-old': { id: 'gpt-old', name: 'GPT Old' },
        },
      });

      const { rerender } = renderWithI18n(
        <SettingsPanel
          {...makeProps({
            providers: [p1],
            onSaveProviders,
            onTestConnection,
          })}
        />,
      );
      await openProviderSettings();

      const testBtn = screen.getByRole('button', { name: /测试|test/i });
      await userEvent.click(testBtn);

      // 在测试还在 in-flight 时，修改默认模型与模型列表
      const updatedP1 = {
        ...p1,
        defaultModelId: 'gpt-new',
        models: {
          'gpt-new': { id: 'gpt-new', name: 'GPT New' },
        },
      };
      rerender(
        <SettingsPanel
          {...makeProps({
            providers: [updatedP1],
            onSaveProviders,
            onTestConnection,
          })}
        />,
      );

      // 慢请求返回（针对旧模型的测试成功）
      await act(async () => {
        resolveTest({ ok: true });
      });

      // 绝不能将旧模型配置的通过结果展示到更新后的 provider 上
      await waitFor(() => {
        expect(screen.queryByText(/连接验证成功|Connection verified/)).toBeNull();
      });
    });

    it('测试过程中按钮具有 loading 态与 aria-busy 属性', async () => {
      let resolveTest!: (result: ConnectionTestResult) => void;
      const testPromise = new Promise<ConnectionTestResult>((resolve) => {
        resolveTest = resolve;
      });
      const p1 = makeProvider({ id: 'p1', name: 'Provider 1' });
      const onTestConnection = vi.fn<[ProviderConfig], Promise<ConnectionTestResult>>().mockReturnValue(testPromise);

      renderWithI18n(
        <SettingsPanel
          {...makeProps({
            providers: [p1],
            onTestConnection,
          })}
        />,
      );
      await openProviderSettings();

      const testBtn = screen.getByRole('button', { name: /测试|test/i });
      await userEvent.click(testBtn);

      // 测试中：禁用且 aria-busy 为 true，文案为测试中
      expect(testBtn).toBeDisabled();
      expect(testBtn).toHaveAttribute('aria-busy', 'true');
      expect(testBtn.textContent).toMatch(/测试中|Testing/);

      // 完成后恢复
      await act(async () => {
        resolveTest({ ok: true });
      });
      await waitFor(() => {
        expect(testBtn).not.toBeDisabled();
        expect(testBtn).toHaveAttribute('aria-busy', 'false');
      });
    });
  });
});
