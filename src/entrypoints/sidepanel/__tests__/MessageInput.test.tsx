import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageInput } from '../components/MessageInput';
import { I18nProvider } from '../i18n/I18nProvider';
import { mockBrowserStorage } from './test-utils';
import type { UseVoiceInputReturn } from '../hooks/useVoiceInput';
import type { ProviderConfig } from '@/shared/types';

// ── Module-level mocks (vi.mock is hoisted above imports) ──

beforeEach(() => { mockBrowserStorage(); });

const mockUseVoiceInput = vi.fn();
vi.mock('../hooks/useVoiceInput', () => ({
  useVoiceInput: (options: { providers: ProviderConfig[]; onTranscribed: (text: string) => void }) => {
    const result = mockUseVoiceInput();
    (result as UseVoiceInputReturn & { __onTranscribed: (text: string) => void }).__onTranscribed =
      options.onTranscribed;
    return result;
  },
}));

// ── Helpers ──

function defaultMock(): UseVoiceInputReturn {
  return {
    voiceState: 'idle',
    errorMessage: null,
    voiceAvailable: true,
    startRecording: vi.fn().mockResolvedValue(undefined),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
    clearError: vi.fn(),
  };
}

function getLatestMockReturn(): UseVoiceInputReturn & { __onTranscribed: (text: string) => void } {
  return mockUseVoiceInput.mock.results[mockUseVoiceInput.mock.results.length - 1].value;
}

const EMPTY_PROVIDERS: ProviderConfig[] = [];

/** 模型未配置 limit.context → 上限回退 contextWindowTokens / 默认 128000 */
const PROVIDER_NO_CONTEXT_LIMIT: ProviderConfig = {
  id: 'local',
  name: 'Local Gateway',
  apiKey: '',
  isLocalTrusted: true,
  models: {
    chat: { id: 'chat', name: 'Chat' },
  },
  defaultModelId: 'chat',
};

/** 模型配置 limit.context=32768 且支持思考等级 → reasoning-select 渲染 */
const PROVIDER_CONTEXT_32768: ProviderConfig = {
  id: 'local',
  name: 'Local Gateway',
  apiKey: '',
  isLocalTrusted: true,
  models: {
    qwen: {
      id: 'qwen',
      name: 'Qwen',
      limit: { context: 32768, output: 8192 },
      reasoning: true,
      reasoningEfforts: ['low', 'high'],
      defaultReasoningEffort: 'high',
    },
  },
  defaultModelId: 'qwen',
};

function wrappedRender(ui: React.ReactElement) {
  const utils = render(<I18nProvider>{ui}</I18nProvider>);
  return {
    ...utils,
    // rerender 会替换整个渲染树，必须重新包裹 I18nProvider
    rerender: (nextUi: React.ReactElement) => utils.rerender(<I18nProvider>{nextUi}</I18nProvider>),
  };
}

describe('MessageInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseVoiceInput.mockReturnValue(defaultMock());
  });

  // ── 现有测试（适配 providers prop） ──

  it('sends text on button click', async () => {
    const onSend = vi.fn();
    wrappedRender(
      <MessageInput onSend={onSend} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const input = screen.getByTestId('message-input');
    const sendBtn = screen.getByTestId('send-button');

    await userEvent.type(input, 'hello');
    await userEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('sends text on Enter key', async () => {
    const onSend = vi.fn();
    wrappedRender(
      <MessageInput onSend={onSend} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const input = screen.getByTestId('message-input');
    await userEvent.type(input, 'test message{Enter}');

    expect(onSend).toHaveBeenCalledWith('test message');
  });

  it('does not send empty input', async () => {
    const onSend = vi.fn();
    wrappedRender(
      <MessageInput onSend={onSend} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const sendBtn = screen.getByTestId('send-button');
    await userEvent.click(sendBtn);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send whitespace-only input', async () => {
    const onSend = vi.fn();
    wrappedRender(
      <MessageInput onSend={onSend} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const input = screen.getByTestId('message-input');
    await userEvent.type(input, '   ');
    await userEvent.click(screen.getByTestId('send-button'));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows abort button when running', () => {
    wrappedRender(
      <MessageInput onSend={vi.fn()} onAbort={vi.fn()} disabled={true} isRunning={true} providers={EMPTY_PROVIDERS} />,
    );

    expect(screen.getByTestId('abort-button')).toBeDefined();
    expect(screen.queryByTestId('send-button')).toBeNull();
  });

  it('calls onAbort when abort button clicked', async () => {
    const onAbort = vi.fn();
    wrappedRender(
      <MessageInput onSend={vi.fn()} onAbort={onAbort} disabled={true} isRunning={true} providers={EMPTY_PROVIDERS} />,
    );

    await userEvent.click(screen.getByTestId('abort-button'));
    expect(onAbort).toHaveBeenCalledOnce();
  });

  it('clears input after sending', async () => {
    const onSend = vi.fn();
    wrappedRender(
      <MessageInput onSend={onSend} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const input = screen.getByTestId('message-input') as HTMLTextAreaElement;
    await userEvent.type(input, 'hello{Enter}');

    expect(input.value).toBe('');
  });

  // ── 新增测试：voiceAvailable 相关 ──

  it('voiceAvailable === false 时不渲染麦克风按钮', () => {
    mockUseVoiceInput.mockReturnValue({ ...defaultMock(), voiceAvailable: false });
    wrappedRender(
      <MessageInput onSend={vi.fn()} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    expect(screen.queryByTestId('mic-button')).toBeNull();
  });

  it('idle 状态显示麦克风按钮，点击调用 startRecording', async () => {
    const startRecording = vi.fn().mockResolvedValue(undefined);
    mockUseVoiceInput.mockReturnValue({ ...defaultMock(), startRecording });

    wrappedRender(
      <MessageInput onSend={vi.fn()} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const btn = screen.getByTestId('mic-button');
    expect(btn).toBeDefined();
    await userEvent.click(btn);
    expect(startRecording).toHaveBeenCalledOnce();
  });

  it('recording 状态显示红色指示，点击调用 stopRecording', async () => {
    const stopRecording = vi.fn();
    mockUseVoiceInput.mockReturnValue({ ...defaultMock(), voiceState: 'recording', stopRecording });

    wrappedRender(
      <MessageInput onSend={vi.fn()} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const btn = screen.getByTestId('mic-button');
    await userEvent.click(btn);
    expect(stopRecording).toHaveBeenCalledOnce();
  });

  it('transcribing 状态按钮不可交互（渲染为 span）', () => {
    mockUseVoiceInput.mockReturnValue({ ...defaultMock(), voiceState: 'transcribing' });

    wrappedRender(
      <MessageInput onSend={vi.fn()} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const btn = screen.getByTestId('mic-button');
    expect(btn.tagName).toBe('SPAN');
  });

  it('error 状态显示警告图标，点击调用 clearError', async () => {
    const clearError = vi.fn();
    mockUseVoiceInput.mockReturnValue({
      ...defaultMock(),
      voiceState: 'error',
      errorMessage: '测试错误',
      clearError,
    });

    wrappedRender(
      <MessageInput onSend={vi.fn()} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const btn = screen.getByTestId('mic-button');
    expect(btn.getAttribute('title')).toContain('测试错误');
    await userEvent.click(btn);
    expect(clearError).toHaveBeenCalledOnce();
  });

  it('转写成功后文本追加到 textarea', async () => {
    wrappedRender(
      <MessageInput onSend={vi.fn()} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const input = screen.getByTestId('message-input') as HTMLTextAreaElement;
    await userEvent.type(input, 'hello');

    const mockReturn = getLatestMockReturn();
    act(() => {
      mockReturn.__onTranscribed('world');
    });

    expect(input.value).toBe('hello world');
  });

  it('disabled 为 true 时麦克风按钮也 disabled', () => {
    mockUseVoiceInput.mockReturnValue(defaultMock());

    wrappedRender(
      <MessageInput onSend={vi.fn()} onAbort={vi.fn()} disabled={true} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const btn = screen.getByTestId('mic-button');
    expect(btn).toBeDisabled();
  });

  it('requesting 状态显示加载 spinner', () => {
    mockUseVoiceInput.mockReturnValue({ ...defaultMock(), voiceState: 'requesting' });

    wrappedRender(
      <MessageInput onSend={vi.fn()} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const btn = screen.getByTestId('mic-button');
    expect(btn.tagName).toBe('SPAN');
  });

  it('录音中点击发送按钮仍可正常发送', async () => {
    const onSend = vi.fn();
    mockUseVoiceInput.mockReturnValue({ ...defaultMock(), voiceState: 'recording' });

    wrappedRender(
      <MessageInput onSend={onSend} onAbort={vi.fn()} disabled={false} isRunning={false} providers={EMPTY_PROVIDERS} />,
    );

    const input = screen.getByTestId('message-input');
    await userEvent.type(input, 'hello during recording');
    await userEvent.click(screen.getByTestId('send-button'));

    expect(onSend).toHaveBeenCalledWith('hello during recording');
  });

  it('按当前 Provider 的模型能力显示思考等级', async () => {
    const provider: ProviderConfig = {
      id: 'local',
      name: 'Local Gateway',
      apiKey: '',
      isLocalTrusted: true,
      models: {
        qwen: {
          id: 'qwen',
          name: 'Qwen',
          limit: { context: 32768, output: 8192 },
          reasoning: true,
          reasoningEfforts: ['low', 'high'],
          defaultReasoningEffort: 'high',
        },
      },
      defaultModelId: 'qwen',
    };

    wrappedRender(
      <MessageInput
        onSend={vi.fn()}
        onAbort={vi.fn()}
        disabled={false}
        isRunning={false}
        providers={[provider]}
        selectedProviderId="local"
        onSelectProvider={vi.fn()}
        selectedModelId="qwen"
        onSelectModel={vi.fn()}
        reasoningEffort="high"
        onReasoningEffortChange={vi.fn()}
      />,
    );

    // Provider combobox 显示正确的 provider 名称
    const providerBtn = screen.getByRole('combobox', { name: 'Provider' });
    expect(providerBtn).toHaveTextContent('Local Gateway');

    // Model combobox 显示正确的 model 名称
    const modelBtn = screen.getByRole('combobox', { name: '模型' });
    expect(modelBtn).toHaveTextContent('Qwen');

    // Reasoning combobox 显示正确的 reasoning 值
    const reasoningBtn = screen.getByRole('combobox', { name: '思考' });
    expect(reasoningBtn).toHaveTextContent('high');

    // 打开 reasoning 菜单，检查选项
    await userEvent.click(reasoningBtn);
    expect(screen.getByRole('option', { name: 'low' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'high' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'medium' })).toBeNull();
  });

  it('模型未配置思考等级时展示不支持状态', () => {
    const provider: ProviderConfig = {
      id: 'local',
      name: 'Local Gateway',
      apiKey: '',
      isLocalTrusted: true,
      models: {
        chat: { id: 'chat', name: 'Chat', limit: { context: 32768, output: 8192 } },
      },
      defaultModelId: 'chat',
    };

    wrappedRender(
      <MessageInput
        onSend={vi.fn()}
        onAbort={vi.fn()}
        disabled={false}
        isRunning={false}
        providers={[provider]}
        selectedProviderId="local"
        onSelectProvider={vi.fn()}
        selectedModelId="chat"
        onSelectModel={vi.fn()}
        onReasoningEffortChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('reasoning-unsupported')).toHaveTextContent('Think: Unsupported');
  });

  // ── 上下文占用进度环集成 ──

  it('传入 tokenUsage 时显示上下文占用进度环（模型无 limit.context 时回退默认上限 128000）', () => {
    wrappedRender(
      <MessageInput
        onSend={vi.fn()}
        onAbort={vi.fn()}
        disabled={false}
        isRunning={false}
        providers={[PROVIDER_NO_CONTEXT_LIMIT]}
        selectedProviderId="local"
        onSelectProvider={vi.fn()}
        selectedModelId="chat"
        onSelectModel={vi.fn()}
        tokenUsage={{ prompt: 45200, completion: 0 }}
      />,
    );

    const ring = screen.getByTestId('context-usage-ring');
    expect(ring.getAttribute('aria-label')).toContain('45,200 / 128,000');
  });

  it('tokenUsage 未传或 prompt=0 时不渲染进度环', () => {
    const { rerender } = wrappedRender(
      <MessageInput
        onSend={vi.fn()}
        onAbort={vi.fn()}
        disabled={false}
        isRunning={false}
        providers={[PROVIDER_NO_CONTEXT_LIMIT]}
        selectedProviderId="local"
        onSelectProvider={vi.fn()}
        selectedModelId="chat"
        onSelectModel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('context-usage-ring')).toBeNull();

    rerender(
      <MessageInput
        onSend={vi.fn()}
        onAbort={vi.fn()}
        disabled={false}
        isRunning={false}
        providers={[PROVIDER_NO_CONTEXT_LIMIT]}
        selectedProviderId="local"
        onSelectProvider={vi.fn()}
        selectedModelId="chat"
        onSelectModel={vi.fn()}
        tokenUsage={{ prompt: 0, completion: 0 }}
      />,
    );
    expect(screen.queryByTestId('context-usage-ring')).toBeNull();
  });

  it('activeModel.limit.context 优先于 contextWindowTokens 作为上限', () => {
    wrappedRender(
      <MessageInput
        onSend={vi.fn()}
        onAbort={vi.fn()}
        disabled={false}
        isRunning={false}
        providers={[PROVIDER_CONTEXT_32768]}
        selectedProviderId="local"
        onSelectProvider={vi.fn()}
        selectedModelId="qwen"
        onSelectModel={vi.fn()}
        contextWindowTokens={50000}
        tokenUsage={{ prompt: 45200, completion: 0 }}
      />,
    );

    const ring = screen.getByTestId('context-usage-ring');
    expect(ring.getAttribute('aria-label')).toContain('45,200');
    expect(ring.getAttribute('aria-label')).toContain('32,768');
    expect(ring.getAttribute('aria-label')).not.toContain('50,000');
  });

  it('DOM 顺序为 reasoning 下拉 → 进度环 → 麦克风按钮', () => {
    wrappedRender(
      <MessageInput
        onSend={vi.fn()}
        onAbort={vi.fn()}
        disabled={false}
        isRunning={false}
        providers={[PROVIDER_CONTEXT_32768]}
        selectedProviderId="local"
        onSelectProvider={vi.fn()}
        selectedModelId="qwen"
        onSelectModel={vi.fn()}
        tokenUsage={{ prompt: 45200, completion: 0 }}
      />,
    );

    const reasoning = screen.getByRole('combobox', { name: '思考' });
    const ring = screen.getByTestId('context-usage-ring');
    const mic = screen.getByTestId('mic-button');

    const follows = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

    expect(follows(reasoning, ring)).toBe(true);
    expect(follows(ring, mic)).toBe(true);
  });
});
