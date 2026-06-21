import React, { useState, useCallback, useEffect } from 'react';
import { ChatProvider, useChat } from './ChatContext';
import { ChatView } from './components/ChatView';
import { MessageInput } from './components/MessageInput';
import { ConversationSidebar } from './components/ConversationSidebar';
import { TokenPanel } from './components/TokenPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ErrorBoundary } from './ErrorBoundary';
import { ConfigStore } from '@/shared/storage';
import type { AgentSettings, ExpertModeSettings } from './types';
import type { ProviderConfig } from '@/shared/types';

const store = ConfigStore.getInstance();

function AgentStatusIndicator() {
  const { agent } = useChat();
  const colors: Record<string, string> = {
    idle: 'bg-ash',
    running: 'bg-warning animate-pulse',
    streaming: 'bg-success animate-pulse',
    waitingConfirmation: 'bg-orange-400',
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${colors[agent.status]}`} />
      <span className="text-xs text-mute">
        {agent.status === 'idle' && '就绪'}
        {agent.status === 'running' && '运行中...'}
        {agent.status === 'streaming' && '输出中...'}
        {agent.status === 'waitingConfirmation' && '等待确认'}
      </span>
    </div>
  );
}

function ChatLayout() {
  const { conversations, agent, browserState, messages, messagesLoading, messagesError, tokenUsage, confirmRequest, resolveConfirm } = useChat();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tokenCollapsed, setTokenCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Settings state (persisted via ConfigStore → browser.storage.local)
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>({
    maxToolRounds: 99,
    maxContextMessages: 40,
    systemPrompt: '',
    reasoningEffort: 'medium',
  });
  const [expertMode, setExpertMode] = useState<ExpertModeSettings>({
    enabled: false,
    switches: {},
  });

  // 初始化：从 storage 加载
  useEffect(() => {
    (async () => {
      setProviders(await store.get('providers'));
      const saved = await store.get('agentSettings');
      setAgentSettings({
        maxToolRounds: saved.maxToolRounds,
        maxContextMessages: saved.maxContextMessages,
        systemPrompt: saved.systemPrompt,
        reasoningEffort: saved.reasoningEffort ?? 'medium',
      });
      setExpertMode(await store.get('expertModeSettings'));
    })();
  }, []);

  // 持久化回调
  const handleSaveProviders = useCallback((p: ProviderConfig[]) => {
    setProviders(p);
    store.set('providers', p);
  }, []);
  const handleSaveAgentSettings = useCallback((s: AgentSettings) => {
    setAgentSettings(s);
    store.set('agentSettings', {
      maxToolRounds: s.maxToolRounds,
      systemPrompt: s.systemPrompt,
      maxContextMessages: s.maxContextMessages,
      reasoningEffort: s.reasoningEffort,
      summaryThreshold: {
        messageCount: 30,
        estimatedTokens: 12000,
        toolCallCount: 50,
      },
    });
  }, []);
  const handleSaveExpertMode = useCallback((e: ExpertModeSettings) => {
    setExpertMode(e);
    store.set('expertModeSettings', e);
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      if (!conversations.activeId) {
        conversations.create().then((id) => {
          agent.run(id, text, providers[0]!, agentSettings.reasoningEffort);
        });
        return;
      }
      agent.run(conversations.activeId, text, providers[0]!, agentSettings.reasoningEffort);
    },
    [conversations, agent, providers, agentSettings.reasoningEffort],
  );

  const handleTestConnection = useCallback(
    async (provider: ProviderConfig): Promise<boolean> => {
      const { LlmClient } = await import('@/provider');
      const client = new LlmClient(provider);
      return client.checkHealth(provider);
    },
    [],
  );

  const handleNewConversation = useCallback(async () => {
    await conversations.create();
  }, [conversations]);

  return (
    <div className="h-full flex flex-col bg-canvas">
      {/* Header */}
      <header className="h-10 border-b border-hairline bg-canvas flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-ink tracking-wide">
            BrowserAgent
          </span>
        </div>
        <AgentStatusIndicator />
        <div className="w-10" />
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        <ConversationSidebar
          conversations={conversations.list}
          activeId={conversations.activeId}
          loading={conversations.loading}
          error={conversations.error}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onSelect={conversations.select}
          onNew={handleNewConversation}
          onRename={conversations.rename}
          onDelete={conversations.remove}
          onOpenSettings={() => setShowSettings(true)}
        />

        <div className="flex-1 flex flex-col min-w-0">
          {messagesLoading && (
            <div className="flex items-center justify-center py-2 text-sm text-mute">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-mute" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              加载消息中...
            </div>
          )}
          {messagesError && (
             <div className="mx-4 mt-2 px-3 py-2 text-sm text-danger bg-red-50 border border-danger/20 rounded-md">
              加载失败: {messagesError}
            </div>
          )}
          <ChatView messages={messages} />
          <MessageInput
            onSend={handleSend}
            onAbort={agent.abort}
            disabled={agent.status !== 'idle'}
            isRunning={agent.status !== 'idle'}
          />
        </div>

        <TokenPanel
          usage={tokenUsage}
          collapsed={tokenCollapsed}
          onToggleCollapse={() => setTokenCollapsed(!tokenCollapsed)}
        />
      </div>

      {/* Settings Modal */}
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

      {/* Confirm Dialog */}
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
    <ErrorBoundary>
      <ChatProvider>
        <ChatLayout />
      </ChatProvider>
    </ErrorBoundary>
  );
}
