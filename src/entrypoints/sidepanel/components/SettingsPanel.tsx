import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ProviderConfig, ReasoningEffort } from '@/shared/types';
import type { AgentSettings, ExpertModeSettings, ProviderFormData } from '../types';
import type { Skill, SkillSubscription } from '@/shared/types';
import { SkillStore, SkillSubscriptionStore } from '@/shared/storage';
import { fetchSkillsFromGitHub } from '@/shared/github-skill-fetcher';
import { cn } from '../utils';
import { useI18n } from '../i18n/useI18n';

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
  const [tab, setTab] = useState<'provider' | 'agent' | 'expert' | 'skills'>('provider');
  const [editing, setEditing] = useState<ProviderFormData | null>(null);
  const [testingIdx, setTestingIdx] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, 'ok' | 'fail'>>({});
  const { t, locale, setLanguage } = useI18n();

const AUDIO_FORMATS = [
  { value: '', label: t('settings.provider.audioFormats.auto') },
  { value: 'audio/webm;codecs=opus', label: t('settings.provider.audioFormats.webm_opus') },
  { value: 'audio/webm', label: t('settings.provider.audioFormats.webm') },
  { value: 'audio/mp4;codecs=mp4a.40.5', label: t('settings.provider.audioFormats.mp4aac') },
  { value: 'audio/mp4', label: t('settings.provider.audioFormats.mp4') },
  { value: 'audio/aac', label: t('settings.provider.audioFormats.aac') },
  { value: 'audio/ogg;codecs=opus', label: t('settings.provider.audioFormats.ogg_opus') },
  { value: 'audio/wav', label: t('settings.provider.audioFormats.wav') },
];
];

const defaultForm: ProviderFormData = {
  name: '',
  endpoint: '',
  apiKey: '',
  model: '',
  isLocalTrusted: false,
  sttModel: '',
  audioFormat: '',
};

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
  const [tab, setTab] = useState<'provider' | 'agent' | 'expert' | 'skills'>('provider');
  const [editing, setEditing] = useState<ProviderFormData | null>(null);
  const [testingIdx, setTestingIdx] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, 'ok' | 'fail'>>({});

  const audioFormats = AUDIO_FORMATS;

  const handleSaveProvider = () => {
    if (!editing) return;
    const newProvider: ProviderConfig = {
      id: editing.id ?? crypto.randomUUID(),
      name: editing.name,
      endpoint: editing.endpoint,
      apiKey: editing.apiKey,
      model: editing.model,
      isLocalTrusted: editing.isLocalTrusted,
      sttModel: editing.sttModel || undefined,
      audioFormat: editing.audioFormat || undefined,
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
  }, []);

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
  }, [token, t]);

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
  }, [subInput, subscriptions, handleSyncRef, t]);

  const handleRemoveSubscription = useCallback(async (sub: SkillSubscription) => {
    const associated = skills.filter((s) => s.source === `github:${sub.source}`);
    for (const skill of associated) {
      await skillStore.remove(skill.id);
    }
    await subStore.remove(sub.id);
  }, [skills]);

  const handleToggleSkill = useCallback(async (skill: Skill) => {
    await skillStore.update(skill.id, { enabled: !skill.enabled });
  }, []);

  const handleDeleteSkill = useCallback(async (skill: Skill) => {
    await skillStore.remove(skill.id);
  }, []);

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

        {/* Language selector */}
        <div className="px-5 py-3 border-b border-hairline">
          <label className="text-xs font-medium text-mute mr-2">{t('settings.language')}</label>
          <select
            value={locale}
            onChange={(e) => setLanguage(e.target.value as 'zh-CN' | 'en')}
            className="px-2 py-1 text-sm border border-hairline rounded-md bg-canvas text-ink"
          >
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="flex border-b border-hairline px-5">
          {(['provider', 'agent', 'expert', 'skills'] as const).map((tabKey) => (
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

        <div className="flex items-center gap-2 px-5 py-2 border-b border-hairline">
          <label className="text-xs font-medium text-mute">{t('settings.language')}</label>
          <select
            value={locale}
            onChange={(e) => setLanguage(e.target.value as 'zh-CN' | 'en')}
            className="px-2 py-1 text-xs border border-hairline rounded-md bg-canvas text-ink"
          >
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'provider' && (
            <div className="space-y-3">
              {providers.length === 0 && !editing && (
                <p className="text-sm text-mute">{t('settings.provider.noProviders')}</p>
              )}

              {providers.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between border border-hairline rounded-xl px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink">{p.name}</span>
                      {p.isLocalTrusted && (
                        <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded-full">
                          {t('settings.provider.trusted')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-mute truncate">{p.endpoint} / {p.model}</div>
                    {p.sttModel && (
                      <div className="text-xs text-mute truncate mt-0.5">
                        🎤 {t('settings.provider.voiceModel')}: {p.sttModel} | {t('settings.provider.audioFormat')}: {p.audioFormat || 'WAV'}
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
                      onClick={() =>
                        setEditing({
                          id: p.id,
                          name: p.name,
                          endpoint: p.endpoint,
                          apiKey: p.apiKey,
                          model: p.model,
                          isLocalTrusted: p.isLocalTrusted,
                          sttModel: p.sttModel ?? '',
                          audioFormat: p.audioFormat ?? '',
                        })
                      }
                      className="px-2 py-1 text-xs rounded-full border border-hairline text-mute hover:bg-surface-soft"
                    >
                      {t('settings.provider.edit')}
                    </button>
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

              {editing && (
                <div className="border border-hairline rounded-xl p-3 space-y-2 bg-surface-soft">
                  <input
                    data-testid="provider-name-input"
                    placeholder={t('settings.provider.placeholder.name')}
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
                  />
                  <input
                    data-testid="provider-endpoint-input"
                    placeholder={t('settings.provider.placeholder.endpoint')}
                    value={editing.endpoint}
                    onChange={(e) => setEditing({ ...editing, endpoint: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
                  />
                  <input
                    data-testid="provider-apikey-input"
                    type="password"
                    placeholder={t('settings.provider.placeholder.apiKey')}
                    value={editing.apiKey}
                    onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
                  />
                  <input
                    data-testid="provider-model-input"
                    placeholder={t('settings.provider.placeholder.model')}
                    value={editing.model}
                    onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
                  />
                  <input
                    data-testid="provider-stt-model-input"
                    placeholder={t('settings.provider.placeholder.sttModel')}
                    value={editing.sttModel ?? ''}
                    onChange={(e) => setEditing({ ...editing, sttModel: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
                  />
                  <select
                    data-testid="provider-audio-format-select"
                    value={editing.audioFormat ?? ''}
                    onChange={(e) => setEditing({ ...editing, audioFormat: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink focus:outline-none focus:border-primary"
                  >
                    {audioFormats.map((fmt) => (
                      <option key={fmt.value} value={fmt.value}>{fmt.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-mute -mt-1">{t('settings.provider.audioFormatHint')}</p>
                  <label className="flex items-center gap-2 text-sm text-mute">
                    <input
                      type="checkbox"
                      checked={editing.isLocalTrusted}
                      onChange={(e) => setEditing({ ...editing, isLocalTrusted: e.target.checked })}
                    />
                    {t('settings.provider.trustedLabel')}
                  </label>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      data-testid="save-provider-button"
                      onClick={handleSaveProvider}
                      disabled={!editing.name || !editing.endpoint || !editing.apiKey || !editing.model}
                      className="px-3 py-1 text-sm rounded-full bg-primary text-on-primary hover:bg-primary-active disabled:bg-hairline-soft disabled:text-ash disabled:cursor-not-allowed"
                    >
                      {t('settings.provider.save')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="px-3 py-1 text-sm rounded-full border border-hairline-strong text-mute hover:bg-surface-soft"
                    >
                      {t('settings.provider.cancel')}
                    </button>
                  </div>
                </div>
              )}

              {!editing && (
                <button
                  type="button"
                  data-testid="add-provider-button"
                  onClick={() => setEditing(defaultForm)}
                  className="w-full py-2 text-sm rounded-xl border-2 border-dashed border-ash text-mute hover:border-ink hover:text-ink"
                >
                  {t('settings.provider.add')}
                </button>
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
                <span className="text-sm text-mute">{t('settings.agent.reasoningEffort')}</span>
                <select
                  value={agentSettings.reasoningEffort}
                  onChange={(e) =>
                    onSaveAgentSettings({ ...agentSettings, reasoningEffort: e.target.value as ReasoningEffort })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-surface-soft text-ink focus:outline-none focus:bg-canvas focus:border-primary"
                >
                  <option value="low">{t('settings.agent.reasoningOptions.low')}</option>
                  <option value="medium">{t('settings.agent.reasoningOptions.medium')}</option>
                  <option value="high">{t('settings.agent.reasoningOptions.high')}</option>
                  <option value="max">{t('settings.agent.reasoningOptions.max')}</option>
                </select>
                <p className="text-xs text-mute mt-1">
                  {t('settings.agent.reasoningEffortHint')}
                </p>
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
                    className="text-xs text-primary hover:text-primary-active"
                  >
                    {t('settings.expert.addSwitch')}
                  </button>
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

              {/* Subscriptions */}
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

              {/* Local skills */}
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
        </div>
      </div>
    </div>
  );
}
