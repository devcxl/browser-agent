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
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">确认操作</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            工具: <code className="bg-gray-100 px-1 rounded">{request.toolName}</code>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {request.affectedObjects.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                影响对象
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="pb-1 pr-2">类型</th>
                    <th className="pb-1 pr-2">标题</th>
                    <th className="pb-1">原因</th>
                  </tr>
                </thead>
                <tbody>
                  {request.affectedObjects.map((obj, i) => (
                    <tr key={i} data-testid="affected-item" className="border-b border-gray-50">
                      <td className="py-1.5 pr-2 text-gray-500 font-medium">{obj.type}</td>
                      <td className="py-1.5 pr-2 text-gray-700 max-w-[180px] truncate" title={obj.title}>
                        {obj.title ?? '-'}
                      </td>
                      <td className="py-1.5 text-gray-500">{obj.reason ?? '-'}</td>
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
                  <li key={i} className="text-xs text-orange-700 bg-orange-50 rounded px-2 py-1">
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            data-testid="cancel-button"
            onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="confirm-button"
            onClick={onConfirm}
            className="px-4 py-1.5 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
