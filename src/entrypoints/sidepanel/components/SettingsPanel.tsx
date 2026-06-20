import React, { useState } from 'react';
import type { ProviderConfig, ReasoningEffort } from '@/shared/types';
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
      <div className="bg-canvas rounded-sm shadow-xl w-[560px] max-w-[90vw] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline">
          <h2 className="text-base font-semibold text-ink">设置</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-mute hover:text-ink text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-hairline px-5">
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
                  ? 'border-ink text-ink'
                  : 'border-transparent text-mute hover:text-ink',
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
                <p className="text-sm text-mute">暂无 Provider 配置</p>
              )}

              {/* Provider list */}
              {providers.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between border border-hairline rounded-sm px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink">{p.name}</span>
                      {p.isLocalTrusted && (
                        <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded-sm">
                          Trusted
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-mute truncate">{p.endpoint} / {p.model}</div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      type="button"
                      onClick={() => handleTestConnection(idx)}
                      disabled={testingIdx === idx}
                      className="px-2 py-1 text-xs rounded-sm border border-hairline text-mute hover:bg-surface-soft disabled:opacity-50"
                    >
                      {testingIdx === idx ? '测试中...' : '测试'}
                    </button>
                    {testResult[idx] && (
                      <span className={testResult[idx] === 'ok' ? 'text-success text-xs' : 'text-danger text-xs'}>
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
                      className="px-2 py-1 text-xs rounded-sm border border-hairline text-mute hover:bg-surface-soft"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProvider(p.id)}
                      className="px-2 py-1 text-xs rounded-sm border border-danger/30 text-danger hover:bg-red-50"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}

              {/* Add / Edit form */}
              {editing && (
                <div className="border border-hairline rounded-sm p-3 space-y-2 bg-surface-soft">
                  <input
                    data-testid="provider-name-input"
                    placeholder="名称"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-hairline rounded-sm bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-ink"
                  />
                  <input
                    data-testid="provider-endpoint-input"
                    placeholder="Endpoint (e.g. https://api.openai.com/v1)"
                    value={editing.endpoint}
                    onChange={(e) => setEditing({ ...editing, endpoint: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-hairline rounded-sm bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-ink"
                  />
                  <input
                    data-testid="provider-apikey-input"
                    type="password"
                    placeholder="API Key"
                    value={editing.apiKey}
                    onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-hairline rounded-sm bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-ink"
                  />
                  <input
                    data-testid="provider-model-input"
                    placeholder="模型 (e.g. gpt-4o)"
                    value={editing.model}
                    onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-hairline rounded-sm bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-ink"
                  />
                  <label className="flex items-center gap-2 text-sm text-mute">
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
                      className="px-3 py-1 text-sm rounded-sm bg-ink text-canvas hover:bg-ink-deep disabled:bg-surface-card disabled:text-ash disabled:cursor-not-allowed"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="px-3 py-1 text-sm rounded-sm border border-hairline-strong text-mute hover:bg-surface-soft"
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
                  className="w-full py-2 text-sm rounded-sm border-2 border-dashed border-ash text-mute hover:border-ink hover:text-ink"
                >
                  + 添加 Provider
                </button>
              )}
            </div>
          )}

          {tab === 'agent' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-mute">最大工具调用轮次</span>
                <input
                  type="number"
                  value={agentSettings.maxToolRounds}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, maxToolRounds: Number(e.target.value) })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-sm bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-ink"
                  min={1}
                  max={100}
                />
              </label>
              <label className="block">
                <span className="text-sm text-mute">上下文最大消息数</span>
                <input
                  type="number"
                  value={agentSettings.maxContextMessages}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, maxContextMessages: Number(e.target.value) })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-sm bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-ink"
                  min={1}
                  max={200}
                />
              </label>
              <label className="block">
                <span className="text-sm text-mute">思考强度</span>
                <select
                  value={agentSettings.reasoningEffort}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, reasoningEffort: e.target.value as ReasoningEffort })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-sm bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-ink"
                >
                  <option value="low">Low（低）</option>
                  <option value="medium">Medium（中）</option>
                  <option value="high">High（高）</option>
                  <option value="max">Max（最大）</option>
                </select>
                <p className="text-xs text-mute mt-1">
                  控制 LLM 推理深度，越高越慢但越深入。仅支持 DeepSeek、OpenAI o1/o3 等推理模型。
                </p>
              </label>
              <label className="block">
                <span className="text-sm text-mute">系统提示词</span>
                <textarea
                  value={agentSettings.systemPrompt}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, systemPrompt: e.target.value })
                  }
                  rows={4}
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-sm bg-surface-soft text-ink resize-none focus:outline-none focus:bg-canvas focus:border-ink"
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
                  className="rounded-sm"
                />
                <span className="text-sm font-medium text-ink">Expert Mode</span>
              </label>
              {expertMode.enabled && (
                <div className="ml-5 space-y-2 border-l-2 border-hairline-strong pl-3">
                  <p className="text-xs text-mute">子开关配置（功能灰度控制）</p>
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
                        className="rounded-sm"
                      />
                      <span className="text-sm text-mute">{key}</span>
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
                    className="text-xs text-accent hover:text-accent-hover"
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
