import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { FloatingButtonSettings } from '@/shared/types';
import { ConfigStore } from '@/shared/storage';
import { SettingsSwitch } from './SettingsControls';
import { useI18n } from '../i18n/useI18n';

const DEFAULTS: FloatingButtonSettings = {
  enabled: true,
  position: null,
  blacklist: [],
};

/**
 * 浮动按钮配置区块。
 * 直接通过 ConfigStore 读写 floatingButtonSettings，不依赖外部 props。
 */
export function FloatingButtonSection() {
  const { t } = useI18n();
  const configStore = useMemo(() => ConfigStore.getInstance(), []);
  const [settings, setSettings] = useState<FloatingButtonSettings>(DEFAULTS);

  // 初始加载 + 订阅变更
  useEffect(() => {
    configStore.get<FloatingButtonSettings>('floatingButtonSettings').then((stored: FloatingButtonSettings) => {
      if (stored) setSettings(stored);
    });
    return configStore.onChange((changes: Partial<import('@/shared/types').StorageSchema>) => {
      const raw = changes.floatingButtonSettings;
      if (raw !== undefined) {
        setSettings(raw as FloatingButtonSettings);
      }
    });
  }, [configStore]);

  // 持久化部分更新
  const persist = useCallback(
    async (patch: Partial<FloatingButtonSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await configStore.set('floatingButtonSettings', next);
    },
    [settings, configStore],
  );

  const handleToggleEnabled = useCallback(() => {
    persist({ enabled: !settings.enabled });
  }, [persist, settings.enabled]);

  const handleRemoveFromBlacklist = useCallback(
    (hostname: string) => {
      persist({ blacklist: settings.blacklist.filter((h: string) => h !== hostname) });
    },
    [persist, settings.blacklist],
  );

  const handleResetPosition = useCallback(() => {
    persist({ position: null });
  }, [persist]);

  return (
    <div className="space-y-4" data-testid="floating-button-section">
      {/* ── 总开关 ───────────────────────────────────── */}
      <div className="border border-hairline rounded-xl px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-sm font-medium text-ink">
              {t('settings.floatingButton.enabled')}
            </span>
            <p className="text-xs text-mute mt-0.5">
              {t('settings.floatingButton.enabledDesc')}
            </p>
          </div>
          <SettingsSwitch
            checked={settings.enabled}
            onClick={handleToggleEnabled}
            aria-label={t('settings.floatingButton.enabled')}
          />
        </div>
      </div>

      {/* ── 黑名单管理 ───────────────────────────────── */}
      <div className="border border-hairline rounded-xl px-3 py-3">
        <h4 className="text-sm font-medium text-ink mb-2">
          {t('settings.floatingButton.blacklist')}
        </h4>
        {settings.blacklist.length === 0 ? (
          <p className="text-xs text-mute py-2 text-center">
            {t('settings.floatingButton.blacklistEmpty')}
          </p>
        ) : (
          <ul className="divide-y divide-hairline -mx-3">
            {settings.blacklist.map((hostname) => (
              <li
                key={hostname}
                className="flex items-center justify-between px-3 py-2"
              >
                <span className="text-sm text-ink truncate">{hostname}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveFromBlacklist(hostname)}
                  className="ml-3 shrink-0 px-2 py-1 text-xs rounded-md border border-danger/30 text-danger hover:bg-red-50 transition-colors"
                >
                  {t('settings.floatingButton.blacklistRemove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── 位置重置 ─────────────────────────────────── */}
      <div className="border border-hairline rounded-xl px-3 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">
            {t('settings.floatingButton.resetPosition')}
          </span>
          <button
            type="button"
            onClick={handleResetPosition}
            disabled={settings.position === null}
            className="px-3 py-1.5 text-xs rounded-md border border-hairline text-mute hover:bg-surface-soft disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('settings.floatingButton.resetPosition')}
          </button>
        </div>
      </div>
    </div>
  );
}
