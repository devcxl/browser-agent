import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ProviderConfig, ReasoningEffort } from '@/shared/types';
import type { AgentSettings, ExpertModeSettings, ProviderFormData } from '../types';
import type { Skill, SkillSubscription } from '@/shared/types';
import { SkillStore, SkillSubscriptionStore } from '@/shared/storage';
import { fetchSkillsFromGitHub } from '@/shared/github-skill-fetcher';
import { ProviderCatalog } from '@/provider/provider-catalog';
import { cn } from '../utils';
import { useI18n } from '../i18n/useI18n';
import { EXPERT_API_DOMAINS } from '@/shared/types';

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

interface CatalogEntry {
  id: string;
  name: string;
  npm: string;
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
  const { t, locale, setLanguage } = useI18n();
  const [tab, setTab] = useState<'provider' | 'agent' | 'expert' | 'skills' | 'language'>('provider');

  // Provider
  const [catalogList, setCatalogList] = useState<CatalogEntry[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editApiKey, setEditApiKey] = useState('');
  const [testingIdx, setTestingIdx] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, 'ok' | 'fail'>>({});

  const audioFormats = [
    { value: '', label: t('settings.provider.audioFormats.auto') },
    { value: 'audio/webm;codecs=opus', label: t('settings.provider.audioFormats.webm_opus') },
    { value: 'audio/webm', label: t('settings.provider.audioFormats.webm') },
    { value: 'audio/mp4;codecs=mp4a.40.5', label: t('settings.provider.audioFormats.mp4aac') },
    { value: 'audio/mp4', label: t('settings.provider.audioFormats.mp4') },
    { value: 'audio/aac', label: t('settings.provider.audioFormats.aac') },
    { value: 'audio/ogg;codecs=opus', label: t('settings.provider.audioFormats.ogg_opus') },
    { value: 'audio/wav', label: t('settings.provider.audioFormats.wav') },
  ];

  useEffect(() => {
    if (tab === 'provider' && catalogList.length === 0) {
      setLoadingCatalog(true);
      ProviderCatalog.getInstance()
        .getProviderList()
        .then((list) => setCatalogList(list))
        .catch(() => {})
        .finally(() => setLoadingCatalog(false));
    }
  }, [tab, catalogList.length]);

  const filteredCatalog = useMemo(() => {
    if (!searchQuery.trim()) return catalogList;
    const q = searchQuery.toLowerCase();
    return catalogList.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [catalogList, searchQuery]);

  const startAddProvider = (entry: CatalogEntry) => {
    const catalog = ProviderCatalog.getInstance();
    catalog.getProvider(entry.id).then((info) => {
      if (!info) return;
      setEditingProviderId(entry.id);
      setEditApiKey('');
      setShowAddPanel(false);
      setSearchQuery('');
    });
  };

  const startCustomProvider = () => {
    setEditingProviderId('__custom__');
    setEditApiKey('');
    setShowAddPanel(false);
    setSearchQuery('');
  };

  const handleSaveProvider = () => {
    if (!editingProviderId || !editApiKey.trim()) return;

    if (editingProviderId === '__custom__') {
      return;
    }

    const catalog = ProviderCatalog.getInstance();
    catalog.getProvider(editingProviderId).then((info) => {
      if (!info) return;

      const newProvider: ProviderConfig = {
        id: crypto.randomUUID(),
        name: info.name,
        providerId: editingProviderId,
        endpoint: info.api,
        apiKey: editApiKey.trim(),
        isLocalTrusted: false,
      };

      const existing = providers.find((p) => p.providerId === editingProviderId && !p.isCustom);
      if (existing) {
        onSaveProviders(providers.map((p) => (p.id === existing.id ? { ...newProvider, id: existing.id } : p)));
      } else {
        onSaveProviders([...providers, newProvider]);
      }
      setEditingProviderId(null);
      setEditApiKey('');
    });
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

  // ===== Skills tab state =====
  const [skills, setSkills] = useState<Skill[]>([]);
  const [subscriptions, setSubscriptions] = useState<SkillSubscription[]>([]);
  const [subInput, setSubInput] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null);

  const skillStore = SkillStore.getInstance();
  const subStore = SkillSubscriptionStore.getInstance();

  useEffect(() => {
    (async () => {
      setSkills(await skillStore.getAll());
      setSubscriptions(await subStore.getAll());
    })();

    const unsub1 = skillStore.onChange(setSkills);
    const unsub2 = subStore.onChange(() => subStore.getAll().then(setSubscriptions));
    return () => { unsub1(); unsub2(); };
  }, [skillStore, subStore]);

  const handleSyncRef = useCallback(async (sub: SkillSubscription) => {
    setSyncingId(sub.id);
    setSyncStatus(null);
    try {
      const parsed = await fetchSkillsFromGitHub(sub.source, token || undefined);
      const existingSkills = await skillStore.getAll();

      for (const ps of parsed) {
        const exists = existingSkills.find(
          (s) => s.name === ps.name && s.source === `github:${sub.source}`,
        );
        if (exists) {
          await skillStore.update(exists.id, {
            name: ps.name,
            description: ps.description,
            prompt: ps.prompt,
            resources: ps.resources,
            source: `github:${sub.source}`,
          });
        } else {
          const now = Date.now();
          await skillStore.add({
            id: crypto.randomUUID(),
            name: ps.name,
            description: ps.description,
            prompt: ps.prompt,
            resources: ps.resources,
            source: `github:${sub.source}`,
            enabled: true,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      await subStore.update(sub.id, { lastSyncedAt: Date.now() });
      setSyncStatus({ type: 'ok', msg: t('settings.skills.syncComplete', { count: parsed.length }) });
    } catch (err) {
      setSyncStatus({ type: 'error', msg: t('settings.skills.syncFailed', { error: (err as Error).message }) });
    } finally {
      setSyncingId(null);
    }
  }, [skillStore, subStore, token, t]);

  const handleAddSubscription = useCallback(async () => {
    const source = subInput.trim();
    if (!source) return;

    const exists = subscriptions.find((s) => s.source === source);
    if (exists) {
      setSyncStatus({ type: 'error', msg: t('settings.skills.subscriptionExists') });
      return;
    }

    const now = Date.now();
    const sub: SkillSubscription = {
      id: crypto.randomUUID(),
      source,
      type: 'github',
      enabled: true,
      lastSyncedAt: null,
      createdAt: now,
    };

    await subStore.add(sub);
    setSubInput('');
    await handleSyncRef(sub);
  }, [subInput, subscriptions, handleSyncRef, subStore, t]);

  const handleRemoveSubscription = useCallback(async (sub: SkillSubscription) => {
    const associated = skills.filter((s) => s.source === `github:${sub.source}`);
    for (const skill of associated) {
      await skillStore.remove(skill.id);
    }
    await subStore.remove(sub.id);
  }, [skills, skillStore, subStore]);

  const handleToggleSkill = useCallback(async (skill: Skill) => {
    await skillStore.update(skill.id, { enabled: !skill.enabled });
  }, [skillStore]);

  const handleDeleteSkill = useCallback(async (skill: Skill) => {
    await skillStore.remove(skill.id);
  }, [skillStore]);

  const skillsBySource = new Map<string, Skill[]>();
  const localSkills: Skill[] = [];
  for (const skill of skills) {
    if (skill.source) {
      const list = skillsBySource.get(skill.source) ?? [];
      list.push(skill);
      skillsBySource.set(skill.source, list);
    } else {
      localSkills.push(skill);
    }
  }

  return (
    <div
      data-testid="settings-panel"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-canvas rounded-xl shadow-xl w-[90vw] max-w-[750px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline">
          <h2 className="text-base font-semibold text-ink">{t('settings.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-mute hover:text-ink text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b border-hairline px-5">
          {(['provider', 'agent', 'expert', 'skills', 'language'] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              data-testid={tabKey === 'provider' ? 'settings-provider-tab' : undefined}
              onClick={() => setTab(tabKey)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                tab === tabKey
                  ? 'border-primary text-ink'
                  : 'border-transparent text-mute hover:text-ink',
              )}
            >
              {t(`settings.tabs.${tabKey}`)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'provider' && (
            <div className="space-y-3">
              {/* 已保存的 Provider 列表 */}
              {providers.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between border border-hairline rounded-xl px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink">{p.name}</span>
                      {p.isCustom && (
                        <span className="text-[10px] bg-ash/20 text-ash px-1.5 py-0.5 rounded-full">
                          Custom
                        </span>
                      )}
                      {p.isLocalTrusted && (
                        <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded-full">
                          {t('settings.provider.trusted')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-mute truncate">{p.endpoint}</div>
                    {p.sttModel && (
                      <div className="text-xs text-mute truncate mt-0.5">
                        STT: {p.sttModel}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      type="button"
                      onClick={() => handleTestConnection(idx)}
                      disabled={testingIdx === idx}
                      className="px-2 py-1 text-xs rounded-full border border-hairline text-mute hover:bg-surface-soft disabled:opacity-50"
                    >
                      {testingIdx === idx ? t('settings.provider.testing') : t('settings.provider.test')}
                    </button>
                    {testResult[idx] && (
                      <span className={testResult[idx] === 'ok' ? 'text-success text-xs' : 'text-danger text-xs'}>
                        {testResult[idx] === 'ok' ? '✓' : '✕'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteProvider(p.id)}
                      className="px-2 py-1 text-xs rounded-full border border-danger/30 text-danger hover:bg-red-50"
                    >
                      {t('settings.provider.delete')}
                    </button>
                  </div>
                </div>
              ))}

              {providers.length === 0 && !editingProviderId && (
                <p className="text-sm text-mute text-center py-4">{t('settings.provider.noProviders')}</p>
              )}

              {/* 添加 Provider 入口 */}
              {!editingProviderId ? (
                <button
                  type="button"
                  data-testid="add-provider-button"
                  onClick={() => setShowAddPanel(true)}
                  className="w-full py-2.5 text-sm rounded-xl border-2 border-dashed border-primary/40 text-primary hover:border-primary hover:bg-primary/5 font-medium"
                >
                  + {t('settings.provider.add')}
                </button>
              ) : null}

              {/* Provider 选择面板 */}
              {showAddPanel && (
                <div className="border border-hairline rounded-xl overflow-hidden bg-canvas">
                  {/* 搜索框 */}
                  <div className="px-3 py-2 border-b border-hairline">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search providers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-hairline rounded-lg bg-surface-soft text-ink placeholder:text-mute focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Provider 列表 */}
                  <div className="max-h-64 overflow-y-auto">
                    {loadingCatalog && (
                      <div className="text-xs text-mute text-center py-4">Loading...</div>
                    )}
                    {!loadingCatalog && filteredCatalog.length === 0 && (
                      <div className="text-xs text-mute text-center py-4">No providers found</div>
                    )}
                    {filteredCatalog.map((entry) => {
                      const exists = providers.some((p) => p.providerId === entry.id && !p.isCustom);
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => startAddProvider(entry)}
                          disabled={!!exists}
                          className={cn(
                            'w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-hairline-soft last:border-0',
                            exists
                              ? 'text-mute bg-hairline-soft cursor-not-allowed'
                              : 'text-ink hover:bg-surface-soft',
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{entry.name}</span>
                            {exists && <span className="text-[10px] text-mute">Added</span>}
                          </div>
                          <div className="text-xs text-mute mt-0.5">{entry.id}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Provider */}
                  <div className="border-t border-hairline px-3 py-2">
                    <button
                      type="button"
                      data-testid="custom-provider-button"
                      onClick={startCustomProvider}
                      className="w-full py-2 text-sm rounded-lg border border-dashed border-ash text-mute hover:border-ink hover:text-ink"
                    >
                      + Custom Provider
                    </button>
                  </div>

                  {/* 取消 */}
                  <div className="border-t border-hairline px-3 py-2">
                    <button
                      type="button"
                      onClick={() => { setShowAddPanel(false); setSearchQuery(''); }}
                      className="w-full py-1.5 text-sm text-mute hover:text-ink rounded-lg hover:bg-surface-soft"
                    >
                      {t('settings.provider.cancel')}
                    </button>
                  </div>
                </div>
              )}

              {/* API Key 填写表单 (选中 provider 后) */}
              {editingProviderId && (
                <div className="border border-hairline rounded-xl p-4 space-y-3 bg-surface-soft">
                  {editingProviderId === '__custom__' ? (
                    <div className="text-sm font-medium text-ink">Custom Provider</div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink">
                          {catalogList.find((c) => c.id === editingProviderId)?.name ?? editingProviderId}
                        </span>
                      </div>
                      <div className="text-xs text-mute">
                        {ProviderCatalog.prototype.getProvider
                          ? 'Loading endpoint...'
                          : ''}
                      </div>
                    </div>
                  )}

                  <input
                    data-testid="provider-apikey-input"
                    type="password"
                    autoFocus
                    placeholder="API Key"
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveProvider(); }}
                    className="w-full px-3 py-2 text-sm border border-hairline rounded-lg bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid="save-provider-button"
                      onClick={handleSaveProvider}
                      disabled={!editApiKey.trim()}
                      className="flex-1 py-2 text-sm rounded-lg bg-primary text-on-primary hover:bg-primary-active disabled:bg-hairline-soft disabled:text-ash disabled:cursor-not-allowed font-medium"
                    >
                      {t('settings.provider.save')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingProviderId(null); setEditApiKey(''); }}
                      className="px-4 py-2 text-sm rounded-lg border border-hairline-strong text-mute hover:bg-surface-soft"
                    >
                      {t('settings.provider.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'agent' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-mute">{t('settings.agent.maxToolRounds')}</span>
                <input
                  type="number"
                  value={agentSettings.maxToolRounds}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, maxToolRounds: Number(e.target.value) })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-primary"
                  min={1}
                  max={100}
                />
              </label>
              <label className="block">
                <span className="text-sm text-mute">{t('settings.agent.maxContextMessages')}</span>
                <input
                  type="number"
                  value={agentSettings.maxContextMessages}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, maxContextMessages: Number(e.target.value) })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-primary"
                  min={1}
                  max={200}
                />
              </label>
              <label className="block">
                <span className="text-sm text-mute">{t('settings.agent.contextWindowTokens')}</span>
                <input
                  type="number"
                  value={agentSettings.contextWindowTokens}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, contextWindowTokens: Number(e.target.value) })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-primary"
                  min={4096}
                  max={1048576}
                  step={1024}
                />
              </label>
              <label className="block">
                <span className="text-sm text-mute">{t('settings.agent.tokenBudgetMargin')}</span>
                <input
                  type="number"
                  value={agentSettings.tokenBudgetMargin}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, tokenBudgetMargin: Number(e.target.value) })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-primary"
                  min={256}
                  max={32768}
                  step={256}
                />
              </label>
              <label className="block">
                <span className="text-sm text-mute">{t('settings.agent.microcompactKeepRecent')}</span>
                <input
                  type="number"
                  value={agentSettings.microcompactKeepRecent}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, microcompactKeepRecent: Number(e.target.value) })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-primary"
                  min={0}
                  max={100}
                />
              </label>
              <label className="block">
                <span className="text-sm text-mute">{t('settings.agent.microcompactMinChars')}</span>
                <input
                  type="number"
                  value={agentSettings.microcompactMinChars}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, microcompactMinChars: Number(e.target.value) })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-primary"
                  min={100}
                  max={100000}
                  step={100}
                />
              </label>
              <label className="block">
                <span className="text-sm text-mute">{t('settings.agent.microcompactExcludeTools')}</span>
                <input
                  type="text"
                  value={agentSettings.microcompactExcludeTools.join(', ')}
                  onChange={(e) =>
                    onSaveAgentSettings({
                      ...agentSettings,
                      microcompactExcludeTools: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={t('settings.agent.microcompactExcludeToolsPlaceholder')}
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="text-sm text-mute">{t('settings.agent.systemPrompt')}</span>
                <textarea
                  value={agentSettings.systemPrompt}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, systemPrompt: e.target.value })
                  }
                  rows={4}
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-surface-soft text-ink resize-none focus:outline-none focus:bg-canvas focus:border-primary"
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
                <span className="text-sm font-medium text-ink">{t('settings.expert.title')}</span>
              </label>
              {expertMode.enabled && (
                <div className="ml-5 space-y-2 border-l-2 border-hairline-strong pl-3">
                  <p className="text-xs text-mute">{t('settings.expert.subSwitchHint')}</p>
                  {EXPERT_API_DOMAINS.map((domain) => (
                    <div key={domain} className="flex items-start gap-2 py-1">
                      <input
                        type="checkbox"
                        checked={expertMode.switches[domain] ?? false}
                        onChange={(e) =>
                          onSaveExpertMode({
                            ...expertMode,
                            switches: { ...expertMode.switches, [domain]: e.target.checked },
                          })
                        }
                        className="mt-0.5 rounded-sm shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-ink">{domain}</span>
                        <p className="text-xs text-mute leading-tight">{t(`settings.expert.domains.${domain}` as any)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'skills' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  value={subInput}
                  onChange={(e) => setSubInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubscription(); }}
                  placeholder={t('settings.skills.placeholder')}
                  className="flex-1 px-3 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleAddSubscription}
                  disabled={!subInput.trim()}
                  className="px-3 py-1.5 text-sm rounded-md bg-primary text-on-primary hover:bg-primary-active disabled:bg-hairline-soft disabled:text-ash disabled:cursor-not-allowed shrink-0"
                >
                  {t('settings.skills.add')}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="text-xs text-mute hover:text-ink underline"
                >
                  {showToken ? t('settings.skills.hideToken') : t('settings.skills.configToken')}
                </button>
              </div>

              {showToken && (
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t('settings.skills.tokenPlaceholder')}
                  type="password"
                  className="w-full px-3 py-1.5 text-xs border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
                />
              )}

              {syncStatus && (
                <div
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-md',
                    syncStatus.type === 'ok' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                  )}
                >
                  {syncStatus.msg}
                </div>
              )}

              {subscriptions.length === 0 && localSkills.length === 0 && (
                <p className="text-xs text-mute text-center py-3">{t('settings.skills.noSubscriptionsAndSkills')}</p>
              )}

              {subscriptions.map((sub) => {
                const subSkills = skillsBySource.get(`github:${sub.source}`) ?? [];
                return (
                  <div key={sub.id} className="border border-hairline rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-ink">{sub.source}</span>
                        {sub.lastSyncedAt && (
                          <span className="text-[10px] text-mute ml-2">
                            {new Date(sub.lastSyncedAt).toLocaleString('zh-CN')}
                          </span>
                        )}
                        <span className="text-xs text-mute ml-2">{t('settings.skills.skillsCount', { count: subSkills.length })}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSyncRef(sub)}
                          disabled={syncingId === sub.id}
                          className="px-2 py-1 text-xs rounded-md border border-hairline text-mute hover:bg-surface-soft disabled:opacity-50"
                        >
                          {syncingId === sub.id ? t('settings.skills.syncing') : t('settings.skills.sync')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubscription(sub)}
                          className="px-2 py-1 text-xs rounded-md border border-danger/30 text-danger hover:bg-red-50"
                        >
                          {t('settings.skills.delete')}
                        </button>
                      </div>
                    </div>
                    {subSkills.length > 0 && (
                      <div className="mt-2 space-y-1 pl-2 border-l-2 border-hairline">
                        {subSkills.map((skill) => (
                          <div key={skill.id} className="flex items-center justify-between py-1">
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-ink">{skill.name}</span>
                              {skill.description && (
                                <span className="text-[10px] text-mute ml-1 truncate">{skill.description}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleSkill(skill)}
                                className={cn(
                                  'relative inline-flex h-4 w-8 items-center rounded-full transition-colors',
                                  skill.enabled ? 'bg-primary' : 'bg-hairline-strong',
                                )}
                                role="switch"
                                aria-checked={skill.enabled}
                              >
                                <span
                                  className={cn(
                                    'inline-block h-3 w-3 rounded-full bg-white shadow transition-transform',
                                    skill.enabled ? 'translate-x-[18px]' : 'translate-x-[2px]',
                                  )}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSkill(skill)}
                                className="text-[10px] text-mute hover:text-danger px-1"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {localSkills.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-ink mb-2">{t('settings.skills.localSkills')}</h4>
                  <div className="space-y-2">
                    {localSkills.map((skill) => (
                      <div key={skill.id} className="flex items-center justify-between border border-hairline rounded-xl px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink">{skill.name}</span>
                            {skill.enabled && (
                              <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded-full">{t('settings.skills.enabled')}</span>
                            )}
                          </div>
                          {skill.description && (
                            <div className="text-xs text-mute truncate mt-0.5">{skill.description}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleSkill(skill)}
                            className={cn(
                              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                              skill.enabled ? 'bg-primary' : 'bg-hairline-strong',
                            )}
                            role="switch"
                            aria-checked={skill.enabled}
                          >
                            <span
                              className={cn(
                                'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                                skill.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]',
                              )}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSkill(skill)}
                            className="px-2 py-1 text-xs rounded-full border border-danger/30 text-danger hover:bg-red-50"
                          >
                            {t('settings.skills.delete')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'language' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-ink">{t('settings.language')}</span>
                <select
                  value={locale}
                  onChange={(e) => setLanguage(e.target.value as 'zh-CN' | 'en')}
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-primary"
                >
                  <option value="zh-CN">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
