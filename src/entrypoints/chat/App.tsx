import React, { useState, useCallback } from 'react';
import { ChatProvider, useChat } from './ChatContext';
import { ChatView } from './components/ChatView';
import { MessageInput } from './components/MessageInput';
import { ConversationSidebar } from './components/ConversationSidebar';
import { TokenPanel } from './components/TokenPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import type { AgentSettings, ExpertModeSettings } from './types';
import type { ProviderConfig } from '@/shared/types';

function ChatLayout() {
  const { conversations, agent, messages, tokenUsage, confirmRequest, resolveConfirm } = useChat();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tokenCollapsed, setTokenCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Settings state (in-memory; persisted through ConfigStore)
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>({
    maxToolRounds: 99,
    maxContextMessages: 40,
    systemPrompt: '',
  });
  const [expertMode, setExpertMode] = useState<ExpertModeSettings>({
    enabled: false,
    switches: {},
  });

  const currentConversation = conversations.list.find(c => c.id === conversations.activeId);

  const isDefaultTitle = (title: string): boolean => /^新对话/.test(title);

  const generateTitle = (convId: string, message: string): void => {
    const title = message.replace(/\s+/g, ' ').trim().slice(0, 30);
    conversations.rename(convId, title).catch(() => {});
  };

  const handleSend = useCallback(
    (text: string) => {
      if (!conversations.activeId) {
        conversations.create().then((id) => {
          agent.run(id, text, providers[0]!, agentSettings.maxToolRounds);
          generateTitle(id, text);
        });
        return;
      }
      agent.run(conversations.activeId, text, providers[0]!, agentSettings.maxToolRounds);
      const currentConv = conversations.list.find(c => c.id === conversations.activeId);
      if (currentConv && isDefaultTitle(currentConv.title)) {
        generateTitle(conversations.activeId, text);
      }
    },
    [conversations, agent, providers, agentSettings.maxToolRounds],
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
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="h-10 border-b border-gray-200 bg-white flex items-center px-4 shrink-0">
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
        <div className="flex-1 text-center text-sm text-gray-700 truncate px-4">
          {currentConversation?.title ?? ''}
        </div>
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
          agentStatus={agent.status}
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
          onSaveProviders={setProviders}
          onSaveAgentSettings={setAgentSettings}
          onSaveExpertMode={setExpertMode}
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
    <ChatProvider>
      <ChatLayout />
    </ChatProvider>
  );
}
