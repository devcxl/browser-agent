import React, { useState, useCallback, useEffect } from 'react';
import { ChatProvider, useChat } from './ChatContext';
import { ChatView } from './components/ChatView';
import { MessageInput } from './components/MessageInput';
import { ConversationSidebar } from './components/ConversationSidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ErrorBoundary } from './ErrorBoundary';
import { I18nProvider } from './i18n/I18nProvider';
import { useI18n } from './i18n/useI18n';
import { ConfigStore } from '@/shared/storage';
import { getProviderClientFactory } from '@/provider/provider-client-factory';
import { ProviderCatalog } from '@/provider/provider-catalog';
import { applyTheme } from './theme';
import type { AgentSettings, ExpertModeSettings } from './types';
import type { ProviderConfig, ReasoningEffort } from '@/shared/types';

import { ChatContentContainer } from './components/ChatContentContainer';
import { ProviderWizard } from './components/ProviderWizard';
import { getProviderReadiness } from './provider-readiness';
import type { ProviderWizardStep } from './provider-readiness';

const store = ConfigStore.getInstance();

const SUGGESTIONS: Array<{ titleKey: string; descKey: string; promptKey: string }> = [
  { titleKey: 'home.sug1.title', descKey: 'home.sug1.desc', promptKey: 'home.sug1.prompt' },
  { titleKey: 'home.sug2.title', descKey: 'home.sug2.desc', promptKey: 'home.sug2.prompt' },
  { titleKey: 'home.sug3.title', descKey: 'home.sug3.desc', promptKey: 'home.sug3.prompt' },
  { titleKey: 'home.sug4.title', descKey: 'home.sug4.desc', promptKey: 'home.sug4.prompt' },
];

function ChatLayout() {
  const { t } = useI18n();
  const { conversations, agent, messages, messagesLoading, messagesError, tokenUsage, confirmRequest, resolveConfirm, conversationStatuses } = useChat();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [autoWizardAttempted, setAutoWizardAttempted] = useState(false);
  const [onboardingRequest, setOnboardingRequest] = useState<{
    provider?: ProviderConfig;
    initialStep?: ProviderWizardStep;
  } | null>(null);

  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort | undefined>(undefined);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>({
    maxToolRounds: 99,
    maxContextMessages: 40,
    contextWindowTokens: 128000,
    tokenBudgetMargin: 4096,
    microcompactKeepRecent: 10,
    microcompactMinChars: 500,
    microcompactExcludeTools: [],
    systemPrompt: '',
    reasoningEffort: 'medium',
  });
  const [expertMode, setExpertMode] = useState<ExpertModeSettings>({
    enabled: false,
    switches: {},
  });

  useEffect(() => {
    (async () => {
      const savedProviders = await store.get<ProviderConfig[]>('providers');
      const migratedProviders = await Promise.all(
        savedProviders.map((provider) => ProviderCatalog.getInstance().migrateProviderConfig(provider)),
      );
      if (JSON.stringify(savedProviders) !== JSON.stringify(migratedProviders)) {
        await store.set('providers', migratedProviders);
      }
      setProviders(migratedProviders);
      setProvidersLoaded(true);
      const firstComplete = migratedProviders.filter((p) => getProviderReadiness(p).isComplete)[0];
      setSelectedProviderId(firstComplete?.id ?? '');
      setSelectedModelId(firstComplete?.defaultModelId ?? Object.values(firstComplete?.models ?? {})[0]?.id ?? '');
      const saved = await store.get('agentSettings');
      setAgentSettings({
        maxToolRounds: saved.maxToolRounds,
        maxContextMessages: saved.maxContextMessages,
        contextWindowTokens: saved.contextWindowTokens ?? 128000,
        tokenBudgetMargin: saved.tokenBudgetMargin ?? 4096,
        microcompactKeepRecent: saved.microcompactKeepRecent ?? 10,
        microcompactMinChars: saved.microcompactMinChars ?? 500,
        microcompactExcludeTools: saved.microcompactExcludeTools ?? [],
        systemPrompt: saved.systemPrompt,
        reasoningEffort: saved.reasoningEffort ?? 'medium',
      });
      setExpertMode(await store.get('expertModeSettings'));
      const prefs = await store.get('preferences');
      applyTheme(prefs.theme ?? 'system');
    })();
  }, []);

  const completeProviders = providers.filter((p) => getProviderReadiness(p).isComplete);

  const activeProvider = completeProviders.find((provider) => provider.id === selectedProviderId) ?? completeProviders[0] ?? null;

  const handleSaveProviders = useCallback(async (p: ProviderConfig[]) => {
    setProviders(p);
    setSelectedProviderId((currentId) => {
      const nextProvider = p.find((provider) => provider.id === currentId) ?? p[0];
      const nextModelId = nextProvider?.defaultModelId ?? Object.values(nextProvider?.models ?? {})[0]?.id ?? '';
      setSelectedModelId(nextModelId);
      setReasoningEffort(nextProvider?.models?.[nextModelId]?.defaultReasoningEffort);
      return nextProvider?.id ?? '';
    });
    await store.set('providers', p);
  }, []);

  const handleSelectProvider = useCallback((providerId: string) => {
    const provider = completeProviders.find((item) => item.id === providerId);
    const modelId = provider?.defaultModelId ?? Object.values(provider?.models ?? {})[0]?.id ?? '';
    setSelectedProviderId(providerId);
    setSelectedModelId(modelId);
    setReasoningEffort(provider?.models?.[modelId]?.defaultReasoningEffort);
  }, [completeProviders]);
  const handleSaveAgentSettings = useCallback(async (s: AgentSettings) => {
    setAgentSettings(s);
    await store.set('agentSettings', {
      maxToolRounds: s.maxToolRounds,
      systemPrompt: s.systemPrompt,
      maxContextMessages: s.maxContextMessages,
      contextWindowTokens: s.contextWindowTokens,
      tokenBudgetMargin: s.tokenBudgetMargin,
      microcompactKeepRecent: s.microcompactKeepRecent,
      microcompactMinChars: s.microcompactMinChars,
      microcompactExcludeTools: s.microcompactExcludeTools,
      reasoningEffort: s.reasoningEffort,
      summaryThreshold: {
        messageCount: 30,
        estimatedTokens: 12000,
      },
    });
  }, []);
  const handleSaveExpertMode = useCallback(async (e: ExpertModeSettings) => {
    setExpertMode(e);
    await store.set('expertModeSettings', e);
  }, []);

  const activeModel = activeProvider?.models?.[selectedModelId] ?? null;

  // 自动引导：每次挂载无完整 Provider 时弹一次
  useEffect(() => {
    if (!providersLoaded) return;
    if (completeProviders.length > 0) return;
    if (autoWizardAttempted) return;

    setAutoWizardAttempted(true);

    const firstIncomplete = providers[0];
    const readiness = firstIncomplete ? getProviderReadiness(firstIncomplete) : null;
    const initialStep = readiness?.initialStep ?? ('connection' as ProviderWizardStep);

    setOnboardingRequest({
      provider: firstIncomplete,
      initialStep,
    });
  }, [providersLoaded, completeProviders.length, autoWizardAttempted, providers]);

  const handleSelectModel = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    setReasoningEffort(activeProvider?.models?.[modelId]?.defaultReasoningEffort);
  }, [activeProvider]);

  const handleSend = useCallback(
    (text: string) => {
      if (!activeProvider || !activeModel) return;
      const model = activeModel.id;

      if (!conversations.activeId) {
        conversations.create().then((id) => {
          agent.run(id, text, activeProvider, model, reasoningEffort, activeModel);
        });
        return;
      }
      agent.run(conversations.activeId, text, activeProvider, model, reasoningEffort, activeModel);
    },
    [conversations, agent, activeProvider, activeModel, reasoningEffort],
  );

  const handleTestConnection = useCallback(
    async (provider: ProviderConfig): Promise<boolean> => {
      try {
        const models = await getProviderClientFactory().getModels(provider);
        if (models.length > 0) {
          const client = await getProviderClientFactory().createClient(provider, models[0]!.id);
          return client.checkHealth(provider);
        }
        return false;
      } catch {
        return false;
      }
    },
    [],
  );

  const handleCloseOnboarding = useCallback(() => {
    setOnboardingRequest(null);
  }, []);

  const handleReopenWizard = useCallback(() => {
    const firstIncomplete = providers[0];
    const readiness = firstIncomplete ? getProviderReadiness(firstIncomplete) : null;
    const initialStep = readiness?.initialStep ?? ('connection' as ProviderWizardStep);

    setOnboardingRequest({
      provider: firstIncomplete,
      initialStep,
    });
  }, [providers]);

  const handleOnboardingSave = useCallback(
    async (p: ProviderConfig) => {
      const idx = providers.findIndex((item) => item.id === p.id);
      const next = idx >= 0
        ? providers.map((item, i) => (i === idx ? p : item))
        : [...providers, p];
      await handleSaveProviders(next);
      setOnboardingRequest(null);
    },
    [providers, handleSaveProviders],
  );

  const handleNewConversation = useCallback(async () => {
    await conversations.create();
    setDrawerOpen(false);
  }, [conversations]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      conversations.select(id);
      setDrawerOpen(false);
    },
    [conversations],
  );

  const isHome = messages.length === 0 && !messagesLoading && agent.status === 'idle';
  const activeTitle = conversations.list.find((c) => c.id === conversations.activeId)?.title;

  const inputProps = {
    onSend: handleSend,
    onAbort: agent.abort,
    disabled: agent.status !== 'idle' || !activeProvider,
    isRunning: agent.status !== 'idle',
    providers: completeProviders,
    selectedProviderId: activeProvider?.id ?? '',
    onSelectProvider: handleSelectProvider,
    selectedModelId,
    onSelectModel: handleSelectModel,
    reasoningEffort,
    onReasoningEffortChange: setReasoningEffort,
  };

  return (
    <div className="h-full flex flex-col bg-canvas relative overflow-hidden">
      {/* 顶栏 */}
      <header className="h-10 border-b border-hairline bg-canvas flex items-center justify-between px-2 shrink-0">
        <button
          type="button"
          data-testid="drawer-toggle"
          onClick={() => setDrawerOpen(true)}
          className="w-7 h-7 flex items-center justify-center rounded-md text-mute hover:text-ink hover:bg-surface-soft transition-colors"
          title={t('sidebar.expand')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-[13px] font-semibold text-ink tracking-wide truncate px-2">
          {isHome ? t('app.title') : (activeTitle ?? t('app.title'))}
        </span>
        <button
          type="button"
          data-testid="settings-button"
          onClick={() => { setOnboardingRequest(null); setShowSettings(true); }}
          className="w-7 h-7 flex items-center justify-center rounded-md text-mute hover:text-ink hover:bg-surface-soft transition-colors"
          title={t('sidebar.settings')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573-1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.573 1.066z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      {/* 加载进度条（顶栏下方） */}
      {agent.status !== 'idle' && (
        <div className="h-0.5 bg-hairline overflow-hidden shrink-0">
          <div className="h-full bg-primary w-1/3 animate-progress" />
        </div>
      )}

      {/* 主区域：引导页 / 首页 / 聊天流 */}
      {onboardingRequest ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
            <div className="w-full max-w-[560px]">
              <div className="text-center mb-5">
                <h2 className="text-lg font-semibold text-ink">{t('chat.onboarding.dialogTitle')}</h2>
                <p className="text-xs text-mute mt-1">{t('chat.onboarding.noProviderDescription')}</p>
              </div>
              <ProviderWizard
                provider={onboardingRequest.provider}
                initialStep={onboardingRequest.initialStep}
                onSave={handleOnboardingSave}
                onClose={handleCloseOnboarding}
              />
            </div>
          </div>
        </div>
      ) : isHome ? (
        <ChatContentContainer className="flex-1 flex flex-col justify-center pb-16 gap-5 overflow-y-auto">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary mb-3">
              <svg className="w-6 h-6 text-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <path d="M3 8h18M7 6h.01M10 6h.01" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-ink tracking-tight">{t('home.title')}</h1>
            <p className="text-xs text-mute mt-1">{t('home.subtitle')}</p>
          </div>

          <MessageInput {...inputProps} variant="home" />

          <div className="grid grid-cols-2 gap-2.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.titleKey}
                type="button"
                data-testid="suggestion-card"
                onClick={() => handleSend(t(s.promptKey))}
                disabled={!activeProvider}
                className="text-left bg-surface-card border border-hairline rounded-xl p-3 shadow-sm hover:-translate-y-0.5 hover:shadow-lg transition-all duration-150 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                <div className="text-[12.5px] font-medium text-ink">{t(s.titleKey)}</div>
                <div className="text-[11px] text-mute mt-0.5 leading-relaxed">{t(s.descKey)}</div>
              </button>
            ))}
          </div>

          {providersLoaded && completeProviders.length === 0 && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <p className="text-xs text-mute text-center">{t('chat.onboarding.noProviderDescription')}</p>
              <button
                type="button"
                data-testid="onboarding-cta"
                onClick={handleReopenWizard}
                className="px-4 py-1.5 text-xs font-medium rounded-full bg-primary text-on-primary hover:bg-primary/90 transition-colors"
              >
                {t('chat.onboarding.configureCta')}
              </button>
            </div>
          )}
        </ChatContentContainer>
      ) : (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {messagesLoading && (
            <div className="flex items-center justify-center py-2 text-sm text-mute">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-mute" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {t('app.loadingMessages')}
            </div>
          )}
          {messagesError && (
            <div className="mx-4 mt-2 px-3 py-2 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg">
              {t('app.loadFailed')}: {messagesError}
            </div>
          )}
          <ChatContentContainer className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <ChatView messages={messages} />
            <MessageInput {...inputProps} variant="chat" />
          </ChatContentContainer>
        </div>
      )}

      {/* 会话浮层抽屉 */}
      <ConversationSidebar
        conversations={conversations.list.map((c) => ({ ...c, status: conversationStatuses[c.id] }))}
        activeId={conversations.activeId}
        loading={conversations.loading}
        error={conversations.error}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onRename={conversations.rename}
        onDelete={conversations.remove}
        tokenUsage={tokenUsage}
      />

      {showSettings && (
        <SettingsPanel
          providers={providers}
          agentSettings={agentSettings}
          expertMode={expertMode}
          onSaveProviders={handleSaveProviders}
          onSaveAgentSettings={handleSaveAgentSettings}
          onSaveExpertMode={handleSaveExpertMode}
          onTestConnection={handleTestConnection}
          onClose={() => setShowSettings(false)}
        />
      )}

      {confirmRequest && (
        <ConfirmDialog
          request={confirmRequest}
          onConfirm={() => resolveConfirm(true)}
          onCancel={() => resolveConfirm(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ErrorBoundary>
        <ChatProvider>
          <ChatLayout />
        </ChatProvider>
      </ErrorBoundary>
    </I18nProvider>
  );
}
