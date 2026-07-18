import React from 'react';
import type { ConfirmRequest } from '../types';
import { useI18n } from '../i18n/useI18n';

interface Props {
  request: ConfirmRequest;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ request, onConfirm, onCancel }: Props) {
  const { t } = useI18n();

  return (
    <div
      data-testid="confirm-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="bg-surface-card rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col overflow-hidden">
        {/* 风险等级横条 */}
        <div className="h-[3px] bg-warning shrink-0" />

        <div className="px-5 py-4 border-b border-hairline">
          <h3 className="text-sm font-semibold text-ink">{t('dialog.confirmTitle')}</h3>
          <p className="text-xs text-mute mt-1">
            {t('dialog.tool')}: <code className="font-mono bg-accent-soft text-primary px-1 py-0.5 rounded">{request.toolName}</code>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {request.affectedObjects.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-mute mb-1.5 uppercase tracking-wider">
                {t('dialog.affectedObjects')}
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-mute border-b border-hairline">
                    <th className="pb-1 pr-2">{t('dialog.type')}</th>
                    <th className="pb-1 pr-2">{t('dialog.title')}</th>
                    <th className="pb-1">{t('dialog.reason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {request.affectedObjects.map((obj, i) => (
                    <tr key={i} data-testid="affected-item" className="border-b border-hairline">
                      <td className="py-1.5 pr-2 text-mute font-medium">{obj.type}</td>
                      <td className="py-1.5 pr-2 text-ink max-w-[180px] truncate" title={obj.title}>
                        {obj.title ?? '-'}
                      </td>
                      <td className="py-1.5 text-mute">{obj.reason ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {request.warnings.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-warning mb-1.5 uppercase tracking-wider">
                {t('dialog.warnings')}
              </p>
              <ul className="space-y-1">
                {request.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-warning bg-warning/10 rounded-lg px-2.5 py-1.5">
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-hairline flex justify-end gap-2">
          <button
            type="button"
            data-testid="cancel-button"
            onClick={onCancel}
            className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-hairline bg-surface-card text-body hover:bg-surface-soft transition-colors"
          >
            {t('dialog.cancel')}
          </button>
          <button
            type="button"
            data-testid="confirm-button"
            onClick={onConfirm}
            className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-primary text-on-primary hover:bg-primary-active transition-colors"
          >
            {t('dialog.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
