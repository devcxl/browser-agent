import React, { useState, useEffect, useCallback } from 'react';
import type { Skill } from '@/shared/types';
import { SkillStore } from '@/shared/storage';
import { cn } from '../utils';

interface SkillPanelProps {
  onClose: () => void;
}

function emptySkillForm(): Skill {
  return {
    id: '',
    name: '',
    description: '',
    prompt: '',
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

export function SkillPanel({ onClose }: SkillPanelProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [deletingSkill, setDeletingSkill] = useState<Skill | null>(null);

  const store = SkillStore.getInstance();

  useEffect(() => {
    store.getAll().then(setSkills);
    const unsubscribe = store.onChange(setSkills);
    return unsubscribe;
  }, []);

  const handleNew = useCallback(() => {
    setEditingSkill(emptySkillForm());
  }, []);

  const handleEdit = useCallback((skill: Skill) => {
    setEditingSkill({ ...skill });
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingSkill) return;
    const name = editingSkill.name.trim();
    if (!name) return;

    if (editingSkill.id) {
      await store.update(editingSkill.id, {
        name,
        description: editingSkill.description.trim(),
        prompt: editingSkill.prompt.trim(),
      });
    } else {
      const now = Date.now();
      await store.add({
        ...editingSkill,
        id: crypto.randomUUID(),
        name,
        description: editingSkill.description.trim(),
        prompt: editingSkill.prompt.trim(),
        createdAt: now,
        updatedAt: now,
      });
    }
    setEditingSkill(null);
  }, [editingSkill, store]);

  const handleCancelEdit = useCallback(() => {
    setEditingSkill(null);
  }, []);

  const handleDeleteRequest = useCallback((skill: Skill) => {
    setDeletingSkill(skill);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingSkill) return;
    await store.remove(deletingSkill.id);
    setDeletingSkill(null);
  }, [deletingSkill, store]);

  const handleDeleteCancel = useCallback(() => {
    setDeletingSkill(null);
  }, []);

  const handleToggle = useCallback(
    async (skill: Skill) => {
      await store.update(skill.id, { enabled: !skill.enabled });
    },
    [store],
  );

  const isSaveDisabled = !editingSkill?.name.trim();

  return (
    <div
      data-testid="skill-panel"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-canvas rounded-xl shadow-xl w-[560px] max-w-[90vw] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline">
          <h2 className="text-base font-semibold text-ink">技能管理</h2>
          <button
            type="button"
            data-testid="skill-panel-close"
            onClick={onClose}
            className="text-mute hover:text-ink text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {skills.length === 0 && !editingSkill && (
            <p
              data-testid="skill-empty-hint"
              className="text-sm text-mute text-center py-8"
            >
              暂无技能
            </p>
          )}

          {skills.map((skill) => (
            <div
              key={skill.id}
              data-testid="skill-item"
              className="flex items-center justify-between border border-hairline rounded-xl px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">
                    {skill.name}
                  </span>
                  {skill.enabled && (
                    <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded-full">
                      启用
                    </span>
                  )}
                </div>
                <div className="text-xs text-mute truncate mt-0.5">
                  {skill.description || '暂无描述'}
                </div>
              </div>

              <div className="flex items-center gap-1 ml-2 shrink-0">
                <button
                  type="button"
                  data-testid="skill-toggle"
                  onClick={() => handleToggle(skill)}
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
                  data-testid="skill-edit"
                  onClick={() => handleEdit(skill)}
                  className="px-2 py-1 text-xs rounded-full border border-hairline text-mute hover:bg-surface-soft"
                >
                  编辑
                </button>

                <button
                  type="button"
                  data-testid="skill-delete"
                  onClick={() => handleDeleteRequest(skill)}
                  className="px-2 py-1 text-xs rounded-full border border-danger/30 text-danger hover:bg-red-50"
                >
                  删除
                </button>
              </div>
            </div>
          ))}

          {editingSkill && (
            <div
              data-testid="skill-edit-form"
              className="border border-hairline rounded-xl p-3 space-y-2 bg-surface-soft"
            >
              <input
                data-testid="skill-name-input"
                placeholder="技能名称"
                value={editingSkill.name}
                onChange={(e) =>
                  setEditingSkill({ ...editingSkill, name: e.target.value })
                }
                className="w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
                autoFocus
              />
              <input
                data-testid="skill-desc-input"
                placeholder="描述（简要说明技能用途）"
                value={editingSkill.description}
                onChange={(e) =>
                  setEditingSkill({
                    ...editingSkill,
                    description: e.target.value,
                  })
                }
                className="w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
              />
              <textarea
                data-testid="skill-prompt-input"
                placeholder="提示词（注入 LLM 的指令内容）"
                value={editingSkill.prompt}
                onChange={(e) =>
                  setEditingSkill({ ...editingSkill, prompt: e.target.value })
                }
                rows={4}
                className="w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute resize-none focus:outline-none focus:border-primary"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  data-testid="skill-save-button"
                  onClick={handleSave}
                  disabled={isSaveDisabled}
                  className="px-3 py-1 text-sm rounded-full bg-primary text-on-primary hover:bg-primary-active disabled:bg-hairline-soft disabled:text-ash disabled:cursor-not-allowed"
                >
                  保存
                </button>
                <button
                  type="button"
                  data-testid="skill-cancel-button"
                  onClick={handleCancelEdit}
                  className="px-3 py-1 text-sm rounded-full border border-hairline-strong text-mute hover:bg-surface-soft"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {!editingSkill && (
            <button
              type="button"
              data-testid="skill-add-button"
              onClick={handleNew}
              className="w-full py-2 text-sm rounded-xl border-2 border-dashed border-ash text-mute hover:border-ink hover:text-ink"
            >
              + 新建技能
            </button>
          )}
        </div>
      </div>

      {deletingSkill && (
        <div
          data-testid="skill-delete-confirm"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
        >
          <div className="bg-canvas rounded-xl shadow-xl max-w-sm w-full mx-4">
            <div className="px-5 py-4 border-b border-hairline">
              <h3 className="text-base font-semibold text-ink">确认删除</h3>
            </div>
            <div className="px-5 py-3">
              <p className="text-sm text-body">
                确定要删除技能「{deletingSkill.name}」吗？此操作不可撤销。
              </p>
            </div>
            <div className="px-5 py-3 border-t border-hairline flex justify-end gap-2">
              <button
                type="button"
                data-testid="skill-delete-cancel"
                onClick={handleDeleteCancel}
                className="px-4 py-1.5 text-sm rounded-full border border-hairline-strong text-ink hover:bg-surface-soft"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="skill-delete-confirm-btn"
                onClick={handleDeleteConfirm}
                className="px-4 py-1.5 text-sm rounded-full bg-danger text-white hover:opacity-90"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
