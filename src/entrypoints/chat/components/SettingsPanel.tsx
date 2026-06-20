import React, { useState } from 'react';
import type { ProviderConfig } from '@/shared/types';
import type { AgentSettings, ExpertModeSettings, ProviderFormData } from '../types';
import { cn } from '../utils';

interface Props {
  providers: ProviderConfig[];
  agentSettings: AgentSettings;
  expertMode: ExpertModeSettings;
  onSaveProviders: (providers: ProviderConfig[]) => void;
  onSaveAgentSettings: (s: AgentSettings) => void;
  onSaveExpertMode: (e: ExpertModeSettings) => void;
  onTestConnection: (provider: ProviderConfig) => Promise<boolean>;
  onClose: () => void;
}

export function SettingsPanel({
  providers,
  agentSettings,
  expertMode,
  onSaveProviders,
  onSaveAgentSettings,
  onSaveExpertMode,
  onTestConnection,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'provider' | 'agent' | 'expert'>('provider');
  const [editing, setEditing] = useState<ProviderFormData | null>(null);
  const [testingIdx, setTestingIdx] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, 'ok' | 'fail'>>({});

  const defaultForm: ProviderFormData = {
    name: '',
    endpoint: '',
    apiKey: '',
    model: '',
    isLocalTrusted: false,
  };

  const handleSaveProvider = () => {
    if (!editing) return;
    const newProvider: ProviderConfig = {
      id: editing.id ?? crypto.randomUUID(),
      name: editing.name,
      endpoint: editing.endpoint,
      apiKey: editing.apiKey,
      model: editing.model,
      isLocalTrusted: editing.isLocalTrusted,
    };
    if (editing.id) {
      onSaveProviders(providers.map((p) => (p.id === editing.id ? newProvider : p)));
    } else {
      onSaveProviders([...providers, newProvider]);
    }
    setEditing(null);
  };

  const handleDeleteProvider = (id: string) => {
    onSaveProviders(providers.filter((p) => p.id !== id));
  };

  const handleTestConnection = async (idx: number) => {
    setTestingIdx(idx);
    const ok = await onTestConnection(providers[idx]!);
    setTestResult((prev) => ({ ...prev, [idx]: ok ? 'ok' : 'fail' }));
    setTestingIdx(null);
  };

  return (
    <div
      data-testid="settings-panel"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white rounded-xl shadow-xl w-[560px] max-w-[90vw] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">设置</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-5">
          {(['provider', 'agent', 'expert'] as const).map((t) => (
            <button
              key={t}
              type="button"
              data-testid={
                t === 'provider' ? 'settings-provider-tab' : undefined
              }
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                tab === t
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {t === 'provider' ? 'Provider' : t === 'agent' ? 'Agent' : 'Expert Mode'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'provider' && (
            <div className="space-y-3">
              {providers.length === 0 && !editing && (
                <p className="text-sm text-gray-400">暂无 Provider 配置</p>
              )}

              {/* Provider list */}
              {providers.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{p.name}</span>
                      {p.isLocalTrusted && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          Trusted
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 truncate">{p.endpoint} / {p.model}</div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      type="button"
                      onClick={() => handleTestConnection(idx)}
                      disabled={testingIdx === idx}
                      className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {testingIdx === idx ? '测试中...' : '测试'}
                    </button>
                    {testResult[idx] && (
                      <span className={testResult[idx] === 'ok' ? 'text-green-500 text-xs' : 'text-red-500 text-xs'}>
                        {testResult[idx] === 'ok' ? '✓' : '✕'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          id: p.id,
                          name: p.name,
                          endpoint: p.endpoint,
                          apiKey: p.apiKey,
                          model: p.model,
                          isLocalTrusted: p.isLocalTrusted,
                        })
                      }
                      className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProvider(p.id)}
                      className="px-2 py-1 text-xs rounded border border-red-200 text-red-500 hover:bg-red-50"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}

              {/* Add / Edit form */}
              {editing && (
                <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                  <input
                    data-testid="provider-name-input"
                    placeholder="名称"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                  <input
                    data-testid="provider-endpoint-input"
                    placeholder="Endpoint (e.g. https://api.openai.com/v1)"
                    value={editing.endpoint}
                    onChange={(e) => setEditing({ ...editing, endpoint: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                  <input
                    data-testid="provider-apikey-input"
                    type="password"
                    placeholder="API Key"
                    value={editing.apiKey}
                    onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                  <input
                    data-testid="provider-model-input"
                    placeholder="模型 (e.g. gpt-4o)"
                    value={editing.model}
                    onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={editing.isLocalTrusted}
                      onChange={(e) => setEditing({ ...editing, isLocalTrusted: e.target.checked })}
                    />
                    Local Trusted Provider（标记为本地可信，可发送敏感数据）
                  </label>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      data-testid="save-provider-button"
                      onClick={handleSaveProvider}
                      disabled={!editing.name || !editing.endpoint || !editing.apiKey || !editing.model}
                      className="px-3 py-1 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="px-3 py-1 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {!editing && (
                <button
                  type="button"
                  data-testid="add-provider-button"
                  onClick={() => setEditing(defaultForm)}
                  className="w-full py-2 text-sm rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-500"
                >
                  + 添加 Provider
                </button>
              )}
            </div>
          )}

          {tab === 'agent' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-gray-600">最大工具调用轮次</span>
                <input
                  type="number"
                  value={agentSettings.maxToolRounds}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, maxToolRounds: Number(e.target.value) })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  min={1}
                  max={100}
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">上下文最大消息数</span>
                <input
                  type="number"
                  value={agentSettings.maxContextMessages}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, maxContextMessages: Number(e.target.value) })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  min={1}
                  max={200}
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">系统提示词</span>
                <textarea
                  value={agentSettings.systemPrompt}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, systemPrompt: e.target.value })
                  }
                  rows={4}
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 rounded resize-none"
                />
              </label>
            </div>
          )}

          {tab === 'expert' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={expertMode.enabled}
                  onChange={(e) =>
                    onSaveExpertMode({ ...expertMode, enabled: e.target.checked })
                  }
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-900">Expert Mode</span>
              </label>
              {expertMode.enabled && (
                <div className="ml-5 space-y-2 border-l-2 border-blue-200 pl-3">
                  <p className="text-xs text-gray-400">子开关配置（功能灰度控制）</p>
                  {Object.entries(expertMode.switches).map(([key, val]) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={val}
                        onChange={(e) =>
                          onSaveExpertMode({
                            ...expertMode,
                            switches: { ...expertMode.switches, [key]: e.target.checked },
                          })
                        }
                        className="rounded"
                      />
                      <span className="text-sm text-gray-600">{key}</span>
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      onSaveExpertMode({
                        ...expertMode,
                        switches: { ...expertMode.switches, 'new-switch': false },
                      })
                    }
                    className="text-xs text-blue-500 hover:text-blue-600"
                  >
                    + 添加子开关
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
