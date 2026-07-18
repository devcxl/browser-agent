import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ProviderConfig, UserPreferences } from '@/shared/types';
import type { AgentSettings, ExpertModeSettings } from '../types';
import type { Skill, SkillSubscription } from '@/shared/types';
import { ConfigStore, SkillStore, SkillSubscriptionStore } from '@/shared/storage';
import { fetchSkillsFromGitHub } from '@/shared/github-skill-fetcher';
import { cn } from '../utils';
import { useI18n } from '../i18n/useI18n';
import { EXPERT_API_DOMAINS } from '@/shared/types';
import { applyTheme } from '../theme';
import { ProviderWizard } from './ProviderWizard';

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
  const { t, locale, setLanguage } = useI18n();
  const [tab, setTab] = useState<'provider' | 'agent' | 'expert' | 'skills' | 'language'>('provider');
  const [theme, setTheme] = useState<UserPreferences['theme']>('system');

  // Provider
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null | undefined>(undefined);
  const [testingIdx, setTestingIdx] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, 'ok' | 'fail'>>({});

  useEffect(() => {
    ConfigStore.getInstance().get<UserPreferences>('preferences').then((prefs) => {
      setTheme(prefs.theme ?? 'system');
    });
  }, []);

  const handleThemeChange = async (nextTheme: UserPreferences['theme']) => {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    const configStore = ConfigStore.getInstance();
    const preferences = await configStore.get<UserPreferences>('preferences');
    await configStore.set('preferences', { ...preferences, theme: nextTheme });
  };

  const handleSaveProvider = (provider: ProviderConfig) => {
    const exists = providers.some((item) => item.id === provider.id);
    onSaveProviders(exists ? providers.map((item) => item.id === provider.id ? provider : item) : [...providers, provider]);
    setEditingProvider(undefined);
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
          {tab === 'provider' && (editingProvider !== undefined ? (
            <ProviderWizard
              provider={editingProvider ?? undefined}
              onSave={handleSaveProvider}
              onClose={() => setEditingProvider(undefined)}
            />
          ) : (
            <div className="space-y-3">
              {providers.map((provider, idx) => {
                const models = Object.values(provider.models ?? {});
                const defaultModel = provider.models?.[provider.defaultModelId ?? ''];
                return (
                  <div key={provider.id} className="border border-hairline rounded-xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink">{provider.name}</div>
                        <div className="text-xs text-mute truncate">{provider.api ?? provider.endpoint}</div>
                        <div className="text-xs text-mute mt-1">Default: {defaultModel?.name ?? 'Not configured'} · {models.length} model(s)</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button type="button" onClick={() => setEditingProvider(provider)} className="px-2 py-1 text-xs rounded-full border border-hairline text-mute hover:bg-surface-soft">Manage</button>
                        <button type="button" onClick={() => handleTestConnection(idx)} disabled={testingIdx === idx} className="px-2 py-1 text-xs rounded-full border border-hairline text-mute hover:bg-surface-soft disabled:opacity-50">{testingIdx === idx ? 'Testing' : 'Test'}</button>
                        <button type="button" onClick={() => handleDeleteProvider(provider.id)} className="px-2 py-1 text-xs rounded-full border border-danger/30 text-danger hover:bg-red-50">{t('settings.provider.delete')}</button>
                      </div>
                    </div>
                    {testResult[idx] && <div className={testResult[idx] === 'ok' ? 'text-xs text-success' : 'text-xs text-danger'}>{testResult[idx] === 'ok' ? 'Connection verified' : 'Connection failed'}</div>}
                  </div>
                );
              })}
              {providers.length === 0 && <p className="text-sm text-mute text-center py-4">{t('settings.provider.noProviders')}</p>}
              <button type="button" data-testid="add-provider-button" onClick={() => setEditingProvider(null)} className="w-full py-2.5 text-sm rounded-xl border-2 border-dashed border-primary/40 text-primary hover:border-primary hover:bg-primary/5 font-medium">+ {t('settings.provider.add')}</button>
            </div>
          ))}

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
                <span className="text-sm font-medium text-ink">{t('settings.theme.label')}</span>
                <select
                  data-testid="theme-select"
                  value={theme}
                  onChange={(e) => handleThemeChange(e.target.value as UserPreferences['theme'])}
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-primary"
                >
                  <option value="system">{t('settings.theme.system')}</option>
                  <option value="light">{t('settings.theme.light')}</option>
                  <option value="dark">{t('settings.theme.dark')}</option>
                </select>
              </label>
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
