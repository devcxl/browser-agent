import React, { useState, useEffect, useCallback } from 'react';
import type { Skill, SkillSubscription } from '@/shared/types';
import { SkillStore, SkillSubscriptionStore } from '@/shared/storage';
import { fetchSkillsFromGitHub } from '@/shared/github-skill-fetcher';
import { cn } from '../utils';
import { useI18n } from '../i18n/useI18n';

interface SkillPanelProps {
  onClose: () => void;
}

export function SkillPanel({ onClose }: SkillPanelProps) {
  const { t } = useI18n();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [subscriptions, setSubscriptions] = useState<SkillSubscription[]>([]);
  const [subInput, setSubInput] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null);

  const skillStore = SkillStore.getInstance();
  const subStore = SkillSubscriptionStore.getInstance();

  const load = useCallback(async () => {
    setSkills(await skillStore.getAll());
    setSubscriptions(await subStore.getAll());
  }, [skillStore, subStore]);

  useEffect(() => {
    load();
    const unsub1 = skillStore.onChange(setSkills);
    const unsub2 = subStore.onChange(() => subStore.getAll().then(setSubscriptions));
    return () => { unsub1(); unsub2(); };
  }, [load, skillStore, subStore]);

  const handleSync = useCallback(async (sub: SkillSubscription) => {
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

    // auto sync after adding
    await handleSync(sub);
  }, [subInput, subscriptions, handleSync, subStore, t]);

  const handleRemoveSubscription = useCallback(async (sub: SkillSubscription) => {
    // also remove associated skills
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
      data-testid="skill-panel"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-canvas rounded-xl shadow-xl w-[90vw] max-w-[750px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline shrink-0">
          <h2 className="text-base font-semibold text-ink">{t('settings.skills.panelTitle')}</h2>
          <button
            type="button"
            data-testid="skill-panel-close"
            onClick={onClose}
            className="text-mute hover:text-ink text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 订阅管理 */}
          <section>
            <h3 className="text-sm font-semibold text-ink mb-2">{t('settings.skills.subscriptions')}</h3>
            <div className="flex gap-2 mb-3">
              <input
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubscription(); }}
                placeholder={t('settings.skills.placeholder')}
                className="flex-1 px-3 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                data-testid="subscription-add-btn"
                onClick={handleAddSubscription}
                disabled={!subInput.trim()}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-on-primary hover:bg-primary-active disabled:bg-hairline-soft disabled:text-ash disabled:cursor-not-allowed shrink-0"
              >
                {t('settings.skills.add')}
              </button>
            </div>

            {/* GitHub Token 输入 */}
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="text-xs text-mute hover:text-ink underline"
              >
                {showToken ? t('settings.skills.hideToken') : t('settings.skills.configToken')}
              </button>
            </div>
            {showToken && (
              <div className="mb-3">
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t('settings.skills.tokenPlaceholder')}
                  type="password"
                  className="w-full px-3 py-1.5 text-xs border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
                />
              </div>
            )}

            {syncStatus && (
              <div
                className={cn(
                  'mb-3 px-3 py-1.5 text-xs rounded-md',
                  syncStatus.type === 'ok' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                )}
              >
                {syncStatus.msg}
              </div>
            )}

            {subscriptions.length === 0 && (
              <p className="text-xs text-mute text-center py-3">{t('settings.skills.noSubscriptions')}</p>
            )}

            <div className="space-y-2">
              {subscriptions.map((sub) => {
                const subSkills = skillsBySource.get(`github:${sub.source}`) ?? [];
                return (
                  <div
                    key={sub.id}
                    className="border border-hairline rounded-xl px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-ink">{sub.source}</span>
                        {sub.lastSyncedAt && (
                          <span className="text-[10px] text-mute ml-2">
                            {new Date(sub.lastSyncedAt).toLocaleString('zh-CN')}
                          </span>
                        )}
                        <span className="text-xs text-mute ml-2">
                          {t('settings.skills.skillsCount', { count: subSkills.length })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          data-testid="subscription-sync-btn"
                          onClick={() => handleSync(sub)}
                          disabled={syncingId === sub.id}
                          className="px-2 py-1 text-xs rounded-md border border-hairline text-mute hover:bg-surface-soft disabled:opacity-50"
                        >
                          {syncingId === sub.id ? t('settings.skills.syncing') : t('settings.skills.sync')}
                        </button>
                        <button
                          type="button"
                          data-testid="subscription-remove-btn"
                          onClick={() => handleRemoveSubscription(sub)}
                          className="px-2 py-1 text-xs rounded-md border border-danger/30 text-danger hover:bg-red-50"
                        >
                          {t('settings.skills.delete')}
                        </button>
                      </div>
                    </div>

                    {/* 该订阅下的技能列表 */}
                    {subSkills.length > 0 && (
                      <div className="mt-2 space-y-1 pl-2 border-l-2 border-hairline">
                        {subSkills.map((skill) => (
                          <div
                            key={skill.id}
                            className="flex items-center justify-between py-1"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-ink">{skill.name}</span>
                              {skill.description && (
                                <span className="text-[10px] text-mute ml-1 truncate">
                                  {skill.description}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                data-testid="skill-toggle"
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
                                data-testid="skill-delete"
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
            </div>
          </section>

          {/* 本地技能 */}
          {localSkills.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-ink mb-2">{t('settings.skills.localSkills')}</h3>
              <div className="space-y-2">
                {localSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between border border-hairline rounded-xl px-3 py-2"
                  >
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
                        data-testid="skill-toggle"
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
                        data-testid="skill-delete"
                        onClick={() => handleDeleteSkill(skill)}
                        className="px-2 py-1 text-xs rounded-full border border-danger/30 text-danger hover:bg-red-50"
                      >
                        {t('settings.skills.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
