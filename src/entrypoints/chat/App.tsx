import React, { useState, useCallback, useEffect } from 'react';
import { ChatProvider, useChat } from './ChatContext';
import { ChatView } from './components/ChatView';
import { MessageInput } from './components/MessageInput';
import { ConversationSidebar } from './components/ConversationSidebar';
import { BrowserStatePanel } from './components/BrowserStatePanel';
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
    idle: 'bg-gray-400',
    running: 'bg-yellow-400 animate-pulse',
    streaming: 'bg-green-400 animate-pulse',
    waitingConfirmation: 'bg-orange-400',
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${colors[agent.status]}`} />
      <span className="text-xs text-gray-500">
        {agent.status === 'idle' && '就绪'}
        {agent.status === 'running' && '运行中...'}
        {agent.status === 'streaming' && '输出中...'}
        {agent.status === 'waitingConfirmation' && '等待确认'}
      </span>
    </div>
  );
}

function ChatLayout() {
  const { conversations, agent, browserState, messages, confirmRequest, resolveConfirm } = useChat();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [browserCollapsed, setBrowserCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Settings state (persisted via ConfigStore → browser.storage.local)
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>({
    maxToolRounds: 15,
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
    agent.setCallbacks({ onMessage: messages.push ? undefined : undefined });
  }, [conversations, agent]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="h-10 border-b border-gray-200 bg-white flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="settings-button"
            onClick={() => setShowSettings(true)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            ⚙ 设置
          </button>
        </div>
        <AgentStatusIndicator />
        <div className="w-10" /> {/* spacer */}
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
        />

        <div className="flex-1 flex flex-col min-w-0">
          <ChatView messages={messages} />
          <MessageInput
            onSend={handleSend}
            onAbort={agent.abort}
            disabled={agent.status !== 'idle'}
            isRunning={agent.status !== 'idle'}
          />
        </div>

        <BrowserStatePanel
          state={browserState.state}
          loading={browserState.loading}
          error={browserState.error}
          collapsed={browserCollapsed}
          onToggleCollapse={() => setBrowserCollapsed(!browserCollapsed)}
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
