import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { JevSettings, ProviderConfig, UserPreferences } from '@/shared/types';
import type { AgentSettings, ExpertModeSettings } from '../types';
import type { Skill, SkillSubscription } from '@/shared/types';
import type { ConnectionTestFailureReason, ConnectionTestResult } from '@/provider/connection-test';
import { ConfigStore, SkillStore, SkillSubscriptionStore } from '@/shared/storage';
import { fetchSkillsFromGitHub } from '@/shared/github-skill-fetcher';
import { cn } from '../utils';
import { useI18n } from '../i18n/useI18n';
import { EXPERT_API_DOMAINS } from '@/shared/types';
import { DEFAULT_ACCENT_COLOR, normalizeAccentColor } from '@/shared/accent-palette';
import { applyTheme } from '../theme';
import { ProviderWizard } from './ProviderWizard';
import {
  SettingsCheckbox,
  SettingsInput,
  SettingsSelect,
  SettingsSwitch,
} from './SettingsControls';
import { FloatingButtonSection } from './FloatingButtonSection';

/** 外观 tab 的预设色板（首项与默认主色保持一致） */
const ACCENT_PRESETS = [
  DEFAULT_ACCENT_COLOR,
  '#be123c',
  '#7c3aed',
  '#2563eb',
  '#059669',
  '#b45309',
] as const;

/** 把失败原因转换为简明排查提示（不泄露上游报文、headers 或密钥） */
function getConnectionTestReasonMessage(
  reason: ConnectionTestFailureReason,
  t: (key: string) => string,
): string {
  switch (reason) {
    case 'missing-model':
      return t('settings.provider.testReasonMissingModel');
    case 'auth':
      return t('settings.provider.testReasonAuth');
    case 'timeout':
      return t('settings.provider.testReasonTimeout');
    case 'empty-response':
      return t('settings.provider.testReasonEmptyResponse');
    case 'request-failed':
      return t('settings.provider.testReasonRequestFailed');
    default:
      return t('settings.provider.testReasonRequestFailed');
  }
}

/** 判定 Provider 连接与模型关键配置（endpoint/api/apiKey/defaultModelId/models）是否发生变更 */
function hasProviderConnectionConfigChanged(a: ProviderConfig, b: ProviderConfig): boolean {
  if (a.endpoint !== b.endpoint || a.api !== b.api || a.apiKey !== b.apiKey) {
    return true;
  }
  if (a.defaultModelId !== b.defaultModelId) {
    return true;
  }
  const aKeys = Object.keys(a.models ?? {});
  const bKeys = Object.keys(b.models ?? {});
  if (aKeys.length !== bKeys.length) {
    return true;
  }
  return aKeys.some((k) => !(k in (b.models ?? {})));
}

interface Props {
  providers: ProviderConfig[];
  agentSettings: AgentSettings;
  expertMode: ExpertModeSettings;
  onSaveProviders: (providers: ProviderConfig[]) => void;
  onSaveAgentSettings: (s: AgentSettings) => void;
  onSaveExpertMode: (e: ExpertModeSettings) => void;
  onTestConnection: (provider: ProviderConfig) => Promise<ConnectionTestResult>;
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
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<'appearance' | 'provider' | 'agent' | 'expert' | 'jev' | 'skills' | 'floatingButton'>('appearance');
  const [theme, setTheme] = useState<UserPreferences['theme']>('system');
  const [jevSettings, setJevSettings] = useState<JevSettings>({ enabled: false, apiKey: '' });
  const [jevApiKeyInput, setJevApiKeyInput] = useState('');
  const [jevSaveStatus, setJevSaveStatus] = useState<'saved' | 'error' | null>(null);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [openSelectId, setOpenSelectId] = useState<string | null>(null);

  // Provider
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null | undefined>(undefined);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({});
  const activeTestVersionsRef = useRef<Record<string, number>>({});
  const prevProvidersRef = useRef<ProviderConfig[]>(providers);

  useEffect(() => {
    const prevMap = new Map(prevProvidersRef.current.map((p) => [p.id, p]));
    prevProvidersRef.current = providers;

    setTestResults((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const current = providers.find((p) => p.id === id);
        const previous = prevMap.get(id);
        if (!current) {
          delete next[id];
          changed = true;
        } else if (previous && hasProviderConnectionConfigChanged(previous, current)) {
          activeTestVersionsRef.current[id] = (activeTestVersionsRef.current[id] ?? 0) + 1;
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [providers]);

  useEffect(() => {
    ConfigStore.getInstance().get<UserPreferences>('preferences').then((prefs) => {
      setTheme(prefs.theme ?? 'system');
      setAccentColor(normalizeAccentColor(prefs.accentColor));
    });
    ConfigStore.getInstance().get<JevSettings>('jevSettings').then((settings) => {
      setJevSettings(settings);
      setJevApiKeyInput(settings.apiKey);
    });
  }, []);

  /** 统一偏好写入：读-改-写集中一处，避免两个 handler 各自复制 */
  const updatePreferences = useCallback(async (patch: Partial<UserPreferences>) => {
    const configStore = ConfigStore.getInstance();
    const preferences = await configStore.get<UserPreferences>('preferences');
    await configStore.set('preferences', { ...preferences, ...patch });
  }, []);

  const handleThemeChange = async (nextTheme: UserPreferences['theme']) => {
    setTheme(nextTheme);
    applyTheme(nextTheme, accentColor);
    await updatePreferences({ theme: nextTheme });
  };

  const handleAccentChange = async (nextColor: string) => {
    const normalized = normalizeAccentColor(nextColor);
    setAccentColor(normalized);
    applyTheme(theme, normalized);
    await updatePreferences({ accentColor: normalized });
  };

  const handleSaveProvider = (provider: ProviderConfig) => {
    activeTestVersionsRef.current[provider.id] = (activeTestVersionsRef.current[provider.id] ?? 0) + 1;
    setTestResults((prev) => {
      if (!(provider.id in prev)) return prev;
      const next = { ...prev };
      delete next[provider.id];
      return next;
    });
    if (testingProviderId === provider.id) {
      setTestingProviderId(null);
    }
    const exists = providers.some((item) => item.id === provider.id);
    onSaveProviders(exists ? providers.map((item) => item.id === provider.id ? provider : item) : [...providers, provider]);
    setEditingProvider(undefined);
  };

  const handleSaveJevApiKey = async () => {
    const apiKey = jevApiKeyInput.trim();
    if (!apiKey) return;

    const nextSettings = { ...jevSettings, apiKey };
    try {
      await ConfigStore.getInstance().set('jevSettings', nextSettings);
      setJevSettings(nextSettings);
      setJevApiKeyInput(apiKey);
      setJevSaveStatus('saved');
    } catch {
      setJevSaveStatus('error');
    }
  };

  const handleClearJevApiKey = async () => {
    const nextSettings = { enabled: false, apiKey: '' };
    try {
      await ConfigStore.getInstance().set('jevSettings', nextSettings);
      setJevSettings(nextSettings);
      setJevApiKeyInput('');
      setJevSaveStatus(null);
    } catch {
      setJevSaveStatus('error');
    }
  };

  const handleToggleJev = async () => {
    if (!jevSettings.apiKey) return;
    const nextSettings = { ...jevSettings, enabled: !jevSettings.enabled };
    try {
      await ConfigStore.getInstance().set('jevSettings', nextSettings);
      setJevSettings(nextSettings);
      setJevSaveStatus(null);
    } catch {
      setJevSaveStatus('error');
    }
  };

  const handleDeleteProvider = (id: string) => {
    activeTestVersionsRef.current[id] = (activeTestVersionsRef.current[id] ?? 0) + 1;
    setTestResults((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (testingProviderId === id) {
      setTestingProviderId(null);
    }
    onSaveProviders(providers.filter((p) => p.id !== id));
  };

  const handleTestConnection = async (provider: ProviderConfig) => {
    const providerId = provider.id;
    const version = (activeTestVersionsRef.current[providerId] ?? 0) + 1;
    activeTestVersionsRef.current[providerId] = version;
    setTestingProviderId(providerId);

    try {
      const result = await onTestConnection(provider);
      if (activeTestVersionsRef.current[providerId] !== version) {
        return;
      }
      const current = prevProvidersRef.current.find((p) => p.id === providerId);
      if (!current || hasProviderConnectionConfigChanged(current, provider)) {
        return;
      }

      setTestResults((prev) => ({ ...prev, [providerId]: result }));
    } catch {
      if (activeTestVersionsRef.current[providerId] !== version) {
        return;
      }
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { ok: false, reason: 'request-failed' },
      }));
    } finally {
      if (activeTestVersionsRef.current[providerId] === version) {
        setTestingProviderId(null);
      }
    }
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
      <div className="bg-canvas rounded-xl shadow-xl w-[90vw] max-w-[750px] h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline shrink-0">
          <h2 className="text-base font-semibold text-ink">{t('settings.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-mute hover:text-ink text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b border-hairline px-5 shrink-0">
          {(['appearance', 'provider', 'agent', 'expert', 'jev', 'skills', 'floatingButton'] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              data-testid={
                tabKey === 'appearance'
                  ? 'settings-appearance-tab'
                  : tabKey === 'provider'
                    ? 'settings-provider-tab'
                    : undefined
              }
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
              {providers.map((provider) => {
                const models = Object.values(provider.models ?? {});
                const defaultModel = provider.models?.[provider.defaultModelId ?? ''];
                const isTesting = testingProviderId === provider.id;
                const result = testResults[provider.id];
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
                        <button
                          type="button"
                          onClick={() => handleTestConnection(provider)}
                          disabled={isTesting}
                          aria-busy={isTesting ? 'true' : 'false'}
                          data-testid={`test-provider-button-${provider.id}`}
                          className="px-2 py-1 text-xs rounded-full border border-hairline text-mute hover:bg-surface-soft disabled:opacity-50"
                        >
                          {isTesting ? t('settings.provider.testing') : t('settings.provider.test')}
                        </button>
                        <button type="button" onClick={() => handleDeleteProvider(provider.id)} className="px-2 py-1 text-xs rounded-full border border-danger/30 text-danger hover:bg-red-50">{t('settings.provider.delete')}</button>
                      </div>
                    </div>
                    {result && (
                      <div
                        data-testid={`connection-test-result-${provider.id}`}
                        role={result.ok ? 'status' : 'alert'}
                        aria-live={result.ok ? 'polite' : 'assertive'}
                        className={result.ok ? 'text-xs text-success' : 'text-xs text-danger'}
                      >
                        {result.ok
                          ? t('settings.provider.testSuccess')
                          : `${t('settings.provider.testFailed')}: ${getConnectionTestReasonMessage(result.reason, t)}`}
                      </div>
                    )}
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
                <SettingsInput
                  type="number"
                  value={agentSettings.maxToolRounds}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, maxToolRounds: Number(e.target.value) })
                  }
                  containerClassName="mt-1"
                  min={1}
                  max={100}
                />
              </label>
            </div>
          )}

          {tab === 'expert' && (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2">
                <SettingsCheckbox
                  checked={expertMode.enabled}
                  onChange={(e) =>
                    onSaveExpertMode({ ...expertMode, enabled: e.target.checked })
                  }
                />
                <span className="text-sm font-medium text-ink">{t('settings.expert.title')}</span>
              </label>
              {expertMode.enabled && (
                <div className="ml-5 space-y-2 border-l-2 border-hairline-strong pl-3">
                  <p className="text-xs text-mute">{t('settings.expert.subSwitchHint')}</p>
                  {EXPERT_API_DOMAINS.map((domain) => (
                    <label key={domain} className="flex cursor-pointer items-start gap-2 py-1">
                      <SettingsCheckbox
                        checked={expertMode.switches[domain] ?? false}
                        onChange={(e) =>
                          onSaveExpertMode({
                            ...expertMode,
                            switches: { ...expertMode.switches, [domain]: e.target.checked },
                          })
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">{domain}</span>
                        <span className="block text-xs text-mute leading-tight">{t(`settings.expert.domains.${domain}` as any)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'jev' && (
            <div className="max-w-xl space-y-4">
              <div>
                <h3 className="text-sm font-medium text-ink">{t('settings.jev.title')}</h3>
                <p className="mt-1 text-xs leading-relaxed text-mute">{t('settings.jev.description')}</p>
              </div>

              <label className="block">
                <span className="text-sm text-mute">{t('settings.jev.apiKey')}</span>
                <SettingsInput
                  type="password"
                  autoComplete="off"
                  aria-label={t('settings.jev.apiKey')}
                  data-testid="jev-api-key-input"
                  value={jevApiKeyInput}
                  onChange={(event) => {
                    setJevApiKeyInput(event.target.value);
                    setJevSaveStatus(null);
                  }}
                  placeholder={t('settings.jev.apiKeyPlaceholder')}
                  className="mt-1"
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveJevApiKey}
                  disabled={!jevApiKeyInput.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm text-on-primary hover:bg-primary-active disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('settings.jev.saveApiKey')}
                </button>
                <button
                  type="button"
                  onClick={handleClearJevApiKey}
                  disabled={!jevSettings.apiKey}
                  className="rounded-md border border-hairline px-3 py-1.5 text-sm text-mute hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('settings.jev.clearApiKey')}
                </button>
              </div>

              <label className="flex items-center gap-2">
                <SettingsSwitch
                  checked={jevSettings.enabled}
                  disabled={!jevSettings.apiKey}
                  aria-label={t('settings.jev.enabled')}
                  onClick={handleToggleJev}
                />
                <span className="text-sm font-medium text-ink">{t('settings.jev.enabled')}</span>
              </label>

              <p className="text-xs leading-relaxed text-mute">{t('settings.jev.dataDisclosure')}</p>
              <p className="rounded-lg bg-surface-soft px-3 py-2 text-xs leading-relaxed text-mute">
                {t('settings.jev.storageDisclosure')}
              </p>
              {jevSaveStatus && (
                <p role="status" className={jevSaveStatus === 'saved' ? 'text-xs text-success' : 'text-xs text-danger'}>
                  {t(jevSaveStatus === 'saved' ? 'settings.jev.saved' : 'settings.jev.saveFailed')}
                </p>
              )}
            </div>
          )}

          {tab === 'skills' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <SettingsInput
                  value={subInput}
                  onChange={(e) => setSubInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubscription(); }}
                  placeholder={t('settings.skills.placeholder')}
                  className="min-w-0 flex-1"
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
                <SettingsInput
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t('settings.skills.tokenPlaceholder')}
                  type="password"
                  compact
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
                            {new Date(sub.lastSyncedAt).toLocaleString(locale)}
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
                              <SettingsSwitch
                                aria-label={skill.name}
                                checked={skill.enabled}
                                onClick={() => handleToggleSkill(skill)}
                              />
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
                          <SettingsSwitch
                            aria-label={skill.name}
                            checked={skill.enabled}
                            onClick={() => handleToggleSkill(skill)}
                          />
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

          {tab === 'floatingButton' && (
            <FloatingButtonSection />
          )}

          {tab === 'appearance' && (
            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium text-ink">{t('settings.theme.label')}</span>
                <SettingsSelect
                  id="settings-theme-select"
                  label={t('settings.theme.label')}
                  value={theme}
                  options={[
                    { value: 'system', label: t('settings.theme.system') },
                    { value: 'light', label: t('settings.theme.light') },
                    { value: 'dark', label: t('settings.theme.dark') },
                  ]}
                  onChange={(value) => handleThemeChange(value as UserPreferences['theme'])}
                  openSelectId={openSelectId}
                  onOpenChange={setOpenSelectId}
                  className="mt-1"
                />
              </div>

              <div className="border-t border-hairline pt-3">
                <span className="text-sm font-medium text-ink">{t('settings.accent.label')}</span>
                <p className="mt-0.5 text-xs text-mute">{t('settings.accent.description')}</p>

                <div
                  role="group"
                  aria-label={t('settings.accent.label')}
                  className="mt-2 flex flex-wrap items-center gap-2"
                >
                  {ACCENT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      data-testid={`accent-preset-${preset.slice(1)}`}
                      aria-label={t('settings.accent.preset', { color: preset })}
                      aria-pressed={accentColor === preset}
                      onClick={() => handleAccentChange(preset)}
                      className={cn(
                        'size-7 rounded-full border border-hairline transition-transform hover:scale-110',
                        accentColor === preset && 'ring-2 ring-primary ring-offset-2 ring-offset-canvas',
                      )}
                      style={{ backgroundColor: preset }}
                    />
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="color"
                    data-testid="accent-color-input"
                    aria-label={t('settings.accent.custom')}
                    value={accentColor}
                    onChange={(e) => handleAccentChange(e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border border-hairline bg-surface-card p-0.5"
                  />
                  <span className="text-xs text-mute">{t('settings.accent.current')}</span>
                  <code
                    data-testid="accent-color-value"
                    className="rounded bg-surface-soft px-1.5 py-0.5 text-xs text-ink"
                  >
                    {accentColor}
                  </code>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
