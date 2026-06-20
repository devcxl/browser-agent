import React from 'react';
import type { ConfirmRequest } from '../types';

interface Props {
  request: ConfirmRequest;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ request, onConfirm, onCancel }: Props) {
  return (
    <div
      data-testid="confirm-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-canvas rounded-sm shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-hairline">
          <h3 className="text-base font-semibold text-ink">确认操作</h3>
          <p className="text-sm text-mute mt-0.5">
            工具: <code className="bg-surface-card px-1 rounded-sm">{request.toolName}</code>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {request.affectedObjects.length > 0 && (
            <div>
              <p className="text-xs font-medium text-mute mb-1.5 uppercase tracking-wide">
                影响对象
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-mute border-b border-hairline">
                    <th className="pb-1 pr-2">类型</th>
                    <th className="pb-1 pr-2">标题</th>
                    <th className="pb-1">原因</th>
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
              <p className="text-xs font-medium text-orange-600 mb-1.5 uppercase tracking-wide">
                警告
              </p>
              <ul className="space-y-1">
                {request.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-orange-700 bg-orange-50 rounded-sm px-2 py-1">
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-hairline flex justify-end gap-2">
          <button
            type="button"
            data-testid="cancel-button"
            onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded-sm border border-hairline-strong text-ink hover:bg-surface-soft"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="confirm-button"
            onClick={onConfirm}
            className="px-4 py-1.5 text-sm rounded-sm bg-ink text-canvas hover:bg-ink-deep"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
