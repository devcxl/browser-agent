import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPanel } from '../components/SettingsPanel';
import type { ProviderConfig } from '@/shared/types';
import type { AgentSettings, ExpertModeSettings } from '../types';

// Mock stores used internally by SettingsPanel (skills tab)
vi.mock('@/shared/github-skill-fetcher', () => ({
  fetchSkillsFromGitHub: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/shared/storage', () => {
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

// ==================== 测试用例 ====================

describe('SettingsPanel - sttModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('编辑表单应包含语音模型输入框', async () => {
    const props = makeProps();
    render(<SettingsPanel {...props} />);

    const addBtn = screen.getByTestId('add-provider-button');
    await userEvent.click(addBtn);

    const input = screen.getByTestId('provider-stt-model-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', expect.stringContaining('语音模型'));
    // defaultForm 中 sttModel 默认值为空字符串
    expect(input.value).toBe('');
  });

  it('新增 Provider 时可填写 sttModel 并保存', async () => {
    const onSave = vi.fn();
    const props = makeProps({ onSaveProviders: onSave });
    render(<SettingsPanel {...props} />);

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
    render(<SettingsPanel {...props} />);

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
    render(<SettingsPanel {...props} />);

    const editBtn = screen.getByText('编辑');
    await userEvent.click(editBtn);

    const input = screen.getByTestId('provider-stt-model-input') as HTMLInputElement;
    expect(input.value).toBe('whisper-1');
  });

  it('编辑已有 Provider 时应可修改 sttModel 并保存', async () => {
    const onSave = vi.fn();
    const provider = makeProvider({ sttModel: 'whisper-1' });
    const props = makeProps({ providers: [provider], onSaveProviders: onSave });
    render(<SettingsPanel {...props} />);

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
    render(<SettingsPanel {...props} />);

    expect(screen.getByText('🎤 语音模型: whisper-1')).toBeInTheDocument();
  });

  it('Provider 列表卡片应在无 sttModel 时不显示语音模型信息', () => {
    const provider = makeProvider(); // 没有 sttModel
    const props = makeProps({ providers: [provider] });
    render(<SettingsPanel {...props} />);

    expect(screen.queryByText(/🎤 语音模型/)).not.toBeInTheDocument();
  });

  it('sttModel 输入框值为空时保存应转为 undefined', async () => {
    const onSave = vi.fn();
    const provider = makeProvider({ sttModel: 'whisper-1' });
    const props = makeProps({ providers: [provider], onSaveProviders: onSave });
    render(<SettingsPanel {...props} />);

    await userEvent.click(screen.getByText('编辑'));

    const input = screen.getByTestId('provider-stt-model-input');
    await userEvent.clear(input);

    await userEvent.click(screen.getByTestId('save-provider-button'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as ProviderConfig[];
    expect(saved[0].sttModel).toBeUndefined();
  });
});
