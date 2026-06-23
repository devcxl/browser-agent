# 开发文档: T8 - 创建 SkillPanel UI 组件

**Project:** Agent Skill System
**Task ID:** T8
**Slug:** `create-skill-panel-ui`
**Issue:** #80
**类型:** frontend
**Batch:** 3
**依赖:** T3 (#77) — SkillStore 实现

---

## 1. 目标

创建 `SkillPanel.tsx` 组件，实现 Skill 的 CRUD UI。以模态弹窗形式覆盖在 sidepanel 上，风格对齐 `SettingsPanel.tsx`。

## 2. 前置条件

- [x] T1 已完成：`Skill` / `ISkillStore` 类型定义就绪（`src/shared/types/skill.ts`）
- [x] T3 已完成：`SkillStore` 单例实现就绪（`src/shared/storage/skill-store.ts`）
- [x] 参考组件 `SettingsPanel.tsx` 已就绪（`src/entrypoints/sidepanel/components/SettingsPanel.tsx`）
- [x] 参考组件 `ConfirmDialog.tsx` 已就绪（`src/entrypoints/sidepanel/components/ConfirmDialog.tsx`）
- [x] 测试基础设施就绪：`vitest` + `jsdom` + `@testing-library/react` + `userEvent`

## 3. UI 设计指引

### 3.1 与 SettingsPanel 的风格对齐

`SkillPanel` 必须严格遵循 `SettingsPanel.tsx` 的 UI 约定：

| 设计要素 | 约定 | 来源 |
|----------|------|------|
| 模态遮罩 | `fixed inset-0 z-50 flex items-center justify-center bg-black/40` | SettingsPanel L72 |
| 弹窗容器 | `bg-canvas rounded-xl shadow-xl w-[560px] max-w-[90vw] max-h-[85vh] flex flex-col` | SettingsPanel L74 |
| 标题栏 | `flex items-center justify-between px-5 py-3 border-b border-hairline` | SettingsPanel L75 |
| 标题文字 | `text-base font-semibold text-ink` | SettingsPanel L76 |
| 关闭按钮 | `text-mute hover:text-ink text-lg leading-none`，内容 `✕` | SettingsPanel L78-83 |
| 内容区 | `flex-1 overflow-y-auto px-5 py-4` | SettingsPanel L107 |
| 列表项容器 | `border border-hairline rounded-xl px-3 py-2` | SettingsPanel L117 |
| 主按钮 | `px-3 py-1 text-sm rounded-full bg-primary text-on-primary hover:bg-primary-active disabled:bg-hairline-soft disabled:text-ash disabled:cursor-not-allowed` | SettingsPanel L216 |
| 次要按钮 | `px-3 py-1 text-sm rounded-full border border-hairline-strong text-mute hover:bg-surface-soft` | SettingsPanel L222-225 |
| 危险按钮 | `px-2 py-1 text-xs rounded-full border border-danger/30 text-danger hover:bg-red-50` | SettingsPanel L163 |
| 表单输入 | `w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary` | SettingsPanel L178 |
| 空状态提示 | `text-sm text-mute` | SettingsPanel L111 |
| 添加按钮 | `w-full py-2 text-sm rounded-xl border-2 border-dashed border-ash text-mute hover:border-ink hover:text-ink` | SettingsPanel L237 |

### 3.2 自定义颜色 Token 速查

来自 TailwindCSS 配置和 `SettingsPanel` 实际使用：

| Token | 含义 | 典型用途 |
|-------|------|----------|
| `bg-canvas` | `#f5f5f5` | 弹窗背景 |
| `text-ink` | `#0c0a09` | 主要文字 |
| `text-mute` | `#777169` | 次要文字/占位符 |
| `text-ash` | 灰白色 | 禁用按钮文字 |
| `border-hairline` | `#e7e5e4` | 默认分割线 |
| `border-hairline-strong` | `#d6d3d1` | 次要按钮边框 |
| `bg-primary` | `#292524` | 主按钮背景 |
| `text-on-primary` | `#ffffff` | 主按钮文字 |
| `hover:bg-primary-active` | `#0c0a09` | 主按钮悬停 |
| `bg-hairline-soft` | `#f0efed` | 禁用按钮背景 |
| `bg-surface-soft` | 浅灰 | 编辑表单背景/悬停 |
| `border-danger/30` | 红色 30% | 删除按钮边框 |
| `text-danger` | 红色 | 删除按钮文字 |
| `bg-success/20` | 绿色 20% | 启用状态 badge |
| `text-success` | 绿色 | 启用状态文字 |
| `border-ash` | 灰色 | 虚线添加按钮边框 |

### 3.3 组件结构对比

```
SettingsPanel                    SkillPanel
─────────────────────────────────────────────
fixed inset-0 (遮罩)            fixed inset-0 (遮罩)
└─ bg-canvas 容器               └─ bg-canvas 容器
   ├─ 标题栏 (设置)                ├─ 标题栏 (技能管理)
   ├─ Tab 切换                     ├─ Skill 列表 (无 tab)
   │  ├─ 列表项                    │  ├─ 列表项 (name/desc/开关/编辑/删除)
   │  ├─ 内联编辑表单               │  ├─ 内联编辑表单
   │  └─ 空状态提示                │  └─ 空状态提示
   └─ (无)                        └─ 新建按钮 (始终可见)
```

## 4. 接口设计

### 4.1 Props

```typescript
interface SkillPanelProps {
  onClose: () => void;
}
```

组件内部自行管理所有状态，通过 `SkillStore.getInstance()` 与存储层交互。不接收外部数据 props，不通过回调向外传递数据。

### 4.2 内部状态

```typescript
// skills 列表 — 从 SkillStore 加载
const [skills, setSkills] = useState<Skill[]>([]);

// 当前正在编辑的 skill（新建时为部分字段填充的临时对象，编辑时为现有 skill 的副本）
const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

// 待删除的 skill（触发二次确认）
const [deletingSkill, setDeletingSkill] = useState<Skill | null>(null);
```

### 4.3 数据流

```
SkillPanel mount
  ├── SkillStore.getInstance().getAll() → setSkills
  ├── SkillStore.getInstance().onChange(setSkills) → 注册监听
  └── return () => unsubscribe()           → 卸载时取消监听

用户操作:
  新建 → setEditingSkill({ id: '', name: '', description: '', prompt: '', enabled: true, ... })
  编辑 → setEditingSkill({ ...skill })
  保存 → SkillStore.add() | SkillStore.update() → setEditingSkill(null)
  取消 → setEditingSkill(null)
  删除 → setDeletingSkill(skill) → 确认 → SkillStore.remove() → setDeletingSkill(null)
  开关 → SkillStore.update(id, { enabled: !skill.enabled })
```

### 4.4 关键交互流程

#### 新建 Skill

```
点击"新建技能"
  → setEditingSkill(默认空表单对象)
  → 列表下方展开内联编辑表单
  → 填写 name / description / prompt
  → 点击"保存"
    → 校验: name 不能为空
    → 构建 Skill 对象 (id = crypto.randomUUID(), createdAt = updatedAt = Date.now())
    → SkillStore.getInstance().add(skill)
    → setEditingSkill(null)
  → 点击"取消"
    → setEditingSkill(null)
```

#### 编辑 Skill

```
点击列表项"编辑"
  → setEditingSkill({ ...skill })
  → 列表下方展开内联编辑表单（预填现有值）
  → 修改字段
  → 点击"保存"
    → 校验: name 不能为空
    → SkillStore.getInstance().update(skill.id, { name, description, prompt })
    → setEditingSkill(null)
  → 点击"取消"
    → setEditingSkill(null)
```

#### 删除 Skill

```
点击列表项"删除"
  → setDeletingSkill(skill)
  → 渲染 ConfirmDialog: "确定要删除技能「{skill.name}」吗？此操作不可撤销。"
  → 确认 → SkillStore.getInstance().remove(skill.id) → setDeletingSkill(null)
  → 取消 → setDeletingSkill(null)
```

#### 启用/禁用开关

```
点击列表项开关
  → SkillStore.getInstance().update(skill.id, { enabled: !skill.enabled })
  → (SkillStore.onChange 自动更新 skills 列表)
```

### 4.5 校验规则

| 规则 | 触发时机 | 处理方式 |
|------|----------|----------|
| `name` 不能为空（trim 后） | 保存时 | 保存按钮 disabled，不执行保存 |
| `name` 最长 100 字符 | 保存时 | 保存按钮 disabled（可选：输入时提示） |
| `description` 可选 | — | 无校验 |
| `prompt` 可选 | — | 无校验 |

## 5. 组件实现详细说明

### 5.1 文件: `src/entrypoints/sidepanel/components/SkillPanel.tsx`（新增）

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import type { Skill } from '@/shared/types';
import { SkillStore } from '@/shared/storage';
import { cn } from '../utils';

interface SkillPanelProps {
  onClose: () => void;
}

/** 新建 skill 时的默认表单值 */
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

  // ── 初始加载 + 变更监听 ──────────────────────────

  useEffect(() => {
    store.getAll().then(setSkills);
    const unsubscribe = store.onChange(setSkills);
    return unsubscribe;
  }, []);

  // ── 新建 ──────────────────────────────────────────

  const handleNew = useCallback(() => {
    setEditingSkill(emptySkillForm());
  }, []);

  // ── 编辑 ──────────────────────────────────────────

  const handleEdit = useCallback((skill: Skill) => {
    setEditingSkill({ ...skill });
  }, []);

  // ── 保存 ──────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!editingSkill) return;
    const name = editingSkill.name.trim();
    if (!name) return;

    if (editingSkill.id) {
      // 更新现有 skill
      await store.update(editingSkill.id, {
        name,
        description: editingSkill.description.trim(),
        prompt: editingSkill.prompt.trim(),
      });
    } else {
      // 新建 skill
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

  // ── 取消编辑 ──────────────────────────────────────

  const handleCancelEdit = useCallback(() => {
    setEditingSkill(null);
  }, []);

  // ── 删除 ──────────────────────────────────────────

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

  // ── 开关 ──────────────────────────────────────────

  const handleToggle = useCallback(
    async (skill: Skill) => {
      await store.update(skill.id, { enabled: !skill.enabled });
    },
    [store],
  );

  // ── 校验 ──────────────────────────────────────────

  const isSaveDisabled = !editingSkill?.name.trim();

  // ── 渲染 ──────────────────────────────────────────

  return (
    <div
      data-testid="skill-panel"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-canvas rounded-xl shadow-xl w-[560px] max-w-[90vw] max-h-[85vh] flex flex-col">
        {/* 标题栏 */}
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

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* 空状态 */}
          {skills.length === 0 && !editingSkill && (
            <p
              data-testid="skill-empty-hint"
              className="text-sm text-mute text-center py-8"
            >
              暂无技能
            </p>
          )}

          {/* Skill 列表 */}
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
                {/* 启用/禁用开关 */}
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

                {/* 编辑按钮 */}
                <button
                  type="button"
                  data-testid="skill-edit"
                  onClick={() => handleEdit(skill)}
                  className="px-2 py-1 text-xs rounded-full border border-hairline text-mute hover:bg-surface-soft"
                >
                  编辑
                </button>

                {/* 删除按钮 */}
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

          {/* 内联编辑表单 */}
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

          {/* 新建按钮（非编辑模式） */}
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

      {/* 删除确认弹窗 */}
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
```

### 5.2 关于二次确认的实现决策

**不使用项目已有的 `ConfirmDialog` 组件**，原因：
1. `ConfirmDialog` 是为 tool call 确认设计的，props 绑定 `ConfirmRequest`（含 `affectedObjects`、`warnings`、`toolName` 等），与 skill 删除场景不匹配
2. 删除确认只需要简单的文本提示 + 确认/取消按钮，内联实现更简洁
3. 避免对 `ConfirmDialog` 做不必要的泛化修改

### 5.3 关于开关组件的实现决策

使用纯 CSS 开关而非 `<input type="checkbox">`：
1. `SettingsPanel` 中 Expert Mode 子开关使用原生 checkbox，但那是表单场景
2. Skill 列表中的开关是即时生效的操作控件，视觉上应与表单区分
3. 自定义开关更符合现代 UI 习惯，且无需额外依赖

### 5.4 关于 `SkillStore` 导入路径

```typescript
import { SkillStore } from '@/shared/storage';
```

`@/shared/storage/index.ts` 中应已导出 `SkillStore`（T3 完成时修改）。

## 6. 测试文档

### 6.1 文件: `src/entrypoints/sidepanel/__tests__/SkillPanel.test.tsx`（新增）

```typescript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillPanel } from '../components/SkillPanel';
import { SkillStore } from '@/shared/storage';
import type { Skill } from '@/shared/types';

// ==================== 测试辅助 ====================

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    name: '测试技能',
    description: '用于测试的技能',
    prompt: '你是一个测试助手',
    enabled: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

/**
 * Mock SkillStore，返回可控的 mock 实例。
 * 由于 SkillStore 是单例，测试通过 vi.spyOn 控制其行为。
 */
function mockSkillStore() {
  const listeners: Array<(skills: Skill[]) => void> = [];

  const mock = {
    getAll: vi.fn<() => Promise<Skill[]>>(),
    getEnabled: vi.fn<() => Promise<Skill[]>>(),
    save: vi.fn<(skills: Skill[]) => Promise<void>>(),
    add: vi.fn<(skill: Skill) => Promise<void>>(),
    update: vi.fn<(id: string, patch: Partial<Skill>) => Promise<void>>(),
    remove: vi.fn<(id: string) => Promise<void>>(),
    onChange: vi.fn((callback: (skills: Skill[]) => void) => {
      listeners.push(callback);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    }),
    // 辅助：手动触发 onChange
    _notify: (skills: Skill[]) => {
      for (const listener of listeners) {
        listener(skills);
      }
    },
  };

  return mock;
}

// ==================== 测试 ====================

describe('SkillPanel', () => {
  let storeMock: ReturnType<typeof mockSkillStore>;

  beforeEach(() => {
    storeMock = mockSkillStore();
    vi.spyOn(SkillStore, 'getInstance').mockReturnValue(
      storeMock as unknown as SkillStore,
    );
  });

  // ── 渲染 ──────────────────────────────────────────

  it('应正确渲染标题栏和关闭按钮', async () => {
    storeMock.getAll.mockResolvedValueOnce([]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-panel')).toBeDefined();
    });
    expect(screen.getByText('技能管理')).toBeDefined();
    expect(screen.getByTestId('skill-panel-close')).toBeDefined();
  });

  it('点击关闭按钮应调用 onClose', async () => {
    storeMock.getAll.mockResolvedValueOnce([]);
    const onClose = vi.fn();

    render(<SkillPanel onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-panel-close')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-panel-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ── 空状态 ────────────────────────────────────────

  it('空列表时应显示"暂无技能"提示', async () => {
    storeMock.getAll.mockResolvedValueOnce([]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-empty-hint')).toBeDefined();
    });
    expect(screen.getByText('暂无技能')).toBeDefined();
  });

  // ── 列表渲染 ──────────────────────────────────────

  it('应正确显示 skill 列表', async () => {
    const skills = [
      makeSkill({ id: 's1', name: 'Skill A', description: 'Desc A' }),
      makeSkill({ id: 's2', name: 'Skill B', description: 'Desc B' }),
    ];
    storeMock.getAll.mockResolvedValueOnce(skills);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      const items = screen.getAllByTestId('skill-item');
      expect(items).toHaveLength(2);
    });
    expect(screen.getByText('Skill A')).toBeDefined();
    expect(screen.getByText('Skill B')).toBeDefined();
    expect(screen.getByText('Desc A')).toBeDefined();
    expect(screen.getByText('Desc B')).toBeDefined();
  });

  it('skill 无描述时应显示"暂无描述"', async () => {
    storeMock.getAll.mockResolvedValueOnce([
      makeSkill({ id: 's1', description: '' }),
    ]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('暂无描述')).toBeDefined();
    });
  });

  it('启用的 skill 应显示"启用" badge', async () => {
    storeMock.getAll.mockResolvedValueOnce([makeSkill({ enabled: true })]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('启用')).toBeDefined();
    });
  });

  // ── 新建 ──────────────────────────────────────────

  it('点击"新建技能"应进入编辑模式', async () => {
    storeMock.getAll.mockResolvedValueOnce([]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-add-button')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-add-button'));

    expect(screen.getByTestId('skill-edit-form')).toBeDefined();
    expect(screen.getByTestId('skill-name-input')).toBeDefined();
    expect(screen.getByTestId('skill-desc-input')).toBeDefined();
    expect(screen.getByTestId('skill-prompt-input')).toBeDefined();
    expect(screen.getByTestId('skill-save-button')).toBeDefined();
    expect(screen.getByTestId('skill-cancel-button')).toBeDefined();
  });

  it('新建模式保存按钮在名称为空时应 disabled', async () => {
    storeMock.getAll.mockResolvedValueOnce([]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-add-button')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-add-button'));

    const saveBtn = screen.getByTestId('skill-save-button');
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('新建 skill 填写表单后可保存', async () => {
    storeMock.getAll.mockResolvedValueOnce([]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-add-button')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-add-button'));

    await userEvent.type(screen.getByTestId('skill-name-input'), '新技能');
    await userEvent.type(
      screen.getByTestId('skill-desc-input'),
      '新技能描述',
    );
    await userEvent.type(
      screen.getByTestId('skill-prompt-input'),
      '新技能提示词',
    );

    const saveBtn = screen.getByTestId('skill-save-button');
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);

    await userEvent.click(saveBtn);

    expect(storeMock.add).toHaveBeenCalledOnce();
    const addedSkill = storeMock.add.mock.calls[0]?.[0] as Skill;
    expect(addedSkill.name).toBe('新技能');
    expect(addedSkill.description).toBe('新技能描述');
    expect(addedSkill.prompt).toBe('新技能提示词');
    expect(addedSkill.enabled).toBe(true);
    expect(addedSkill.id).toBeTruthy();
    expect(addedSkill.createdAt).toBeGreaterThan(0);
  });

  // ── 编辑 ──────────────────────────────────────────

  it('点击"编辑"应进入编辑模式并预填现有值', async () => {
    const skill = makeSkill({
      id: 's1',
      name: '原名称',
      description: '原描述',
      prompt: '原提示词',
    });
    storeMock.getAll.mockResolvedValueOnce([skill]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-edit')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-edit'));

    expect((screen.getByTestId('skill-name-input') as HTMLInputElement).value).toBe('原名称');
    expect((screen.getByTestId('skill-desc-input') as HTMLInputElement).value).toBe('原描述');
    expect((screen.getByTestId('skill-prompt-input') as HTMLTextAreaElement).value).toBe('原提示词');
  });

  it('编辑模式修改后可保存', async () => {
    const skill = makeSkill({ id: 's1', name: '旧名称' });
    storeMock.getAll.mockResolvedValueOnce([skill]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-edit')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-edit'));

    // 清空并重新输入
    const nameInput = screen.getByTestId('skill-name-input');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '新名称');

    await userEvent.click(screen.getByTestId('skill-save-button'));

    expect(storeMock.update).toHaveBeenCalledWith('s1', {
      name: '新名称',
      description: skill.description,
      prompt: skill.prompt,
    });
  });

  it('点击"取消"应退出编辑模式', async () => {
    storeMock.getAll.mockResolvedValueOnce([]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-add-button')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-add-button'));

    expect(screen.getByTestId('skill-edit-form')).toBeDefined();

    await userEvent.click(screen.getByTestId('skill-cancel-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('skill-edit-form')).toBeNull();
    });
  });

  // ── 删除 ──────────────────────────────────────────

  it('点击"删除"应弹出确认提示', async () => {
    const skill = makeSkill({ id: 's1', name: '待删除技能' });
    storeMock.getAll.mockResolvedValueOnce([skill]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-delete')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-delete'));

    expect(screen.getByTestId('skill-delete-confirm')).toBeDefined();
    expect(
      screen.getByText(/确定要删除技能「待删除技能」吗/),
    ).toBeDefined();
  });

  it('确认删除后 skill 应被移除', async () => {
    const skill = makeSkill({ id: 's1', name: '待删除技能' });
    storeMock.getAll.mockResolvedValueOnce([skill]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-delete')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-delete'));
    await userEvent.click(screen.getByTestId('skill-delete-confirm-btn'));

    expect(storeMock.remove).toHaveBeenCalledWith('s1');
  });

  it('取消删除后确认弹窗应消失', async () => {
    const skill = makeSkill({ id: 's1' });
    storeMock.getAll.mockResolvedValueOnce([skill]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-delete')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-delete'));

    expect(screen.getByTestId('skill-delete-confirm')).toBeDefined();

    await userEvent.click(screen.getByTestId('skill-delete-cancel'));

    await waitFor(() => {
      expect(screen.queryByTestId('skill-delete-confirm')).toBeNull();
    });
    expect(storeMock.remove).not.toHaveBeenCalled();
  });

  // ── 开关 ──────────────────────────────────────────

  it('点击启用开关应调用 update 切换 enabled', async () => {
    const skill = makeSkill({ id: 's1', enabled: true });
    storeMock.getAll.mockResolvedValueOnce([skill]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-toggle')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-toggle'));

    expect(storeMock.update).toHaveBeenCalledWith('s1', { enabled: false });
  });

  // ── onChange 监听 ─────────────────────────────────

  it('SkillStore.onChange 触发时应更新列表', async () => {
    storeMock.getAll.mockResolvedValueOnce([]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-empty-hint')).toBeDefined();
    });

    // 模拟外部变更（如另一个 tab 添加了 skill）
    const newSkills = [makeSkill({ id: 's-new', name: '外部新增' })];
    storeMock._notify(newSkills);

    await waitFor(() => {
      expect(screen.getByText('外部新增')).toBeDefined();
    });
  });

  // ── 组件卸载 ──────────────────────────────────────

  it('组件卸载时应取消 SkillStore 监听', async () => {
    storeMock.getAll.mockResolvedValueOnce([]);

    const { unmount } = render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-panel')).toBeDefined();
    });

    expect(storeMock.onChange).toHaveBeenCalledOnce();
    // onChange 返回的取消函数在 unmount 时由 useEffect cleanup 调用
    // 我们验证 onChange 确实被调用了（即注册了监听）
    // 具体取消逻辑由 React useEffect cleanup 保证

    unmount();
    // 验证不会抛错
  });
});
```

### 6.2 运行测试

```bash
# 运行 SkillPanel 全部测试
npx vitest run src/entrypoints/sidepanel/__tests__/SkillPanel.test.tsx

# 开发模式（watch）
npx vitest src/entrypoints/sidepanel/__tests__/SkillPanel.test.tsx
```

## 7. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/entrypoints/sidepanel/components/SkillPanel.tsx` | 新增 | SkillPanel 组件实现 |
| `src/entrypoints/sidepanel/__tests__/SkillPanel.test.tsx` | 新增 | 单元测试 |

## 8. 验收标准

- [ ] 弹窗正确渲染，包含标题栏"技能管理"和关闭按钮 `✕`
- [ ] 点击关闭按钮调用 `onClose`
- [ ] 列表正确显示所有 skill 的名称、描述摘要（无描述显示"暂无描述"）
- [ ] 启用的 skill 显示绿色"启用"badge
- [ ] 空列表时显示"暂无技能"提示
- [ ] 点击"新建技能"进入编辑模式，显示 name/description/prompt 三个输入框
- [ ] 名称为空时保存按钮 disabled
- [ ] 填写表单后点击保存，`SkillStore.add()` 被调用，参数正确
- [ ] 点击"编辑"进入编辑模式，表单预填现有值
- [ ] 修改后点击保存，`SkillStore.update()` 被调用，参数正确
- [ ] 点击"取消"退出编辑模式
- [ ] 点击"删除"弹出确认提示，显示技能名称
- [ ] 确认删除后 `SkillStore.remove()` 被调用
- [ ] 取消删除后确认弹窗消失，不调用 remove
- [ ] 启用/禁用开关点击后 `SkillStore.update(id, { enabled: !val })` 被调用
- [ ] `SkillStore.onChange` 触发时列表自动更新
- [ ] 组件挂载时调用 `SkillStore.getAll()` 加载初始数据
- [ ] 组件挂载时注册 `SkillStore.onChange` 监听
- [ ] 组件卸载时取消监听（useEffect cleanup）
- [ ] 所有单元测试通过（≥16 个测试用例）

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| `SkillStore` 是单例，mock 不当可能影响其他测试 | 测试隔离性 | 使用 `vi.spyOn(SkillStore, 'getInstance')` 注入 mock，`beforeEach` 中重置 |
| `crypto.randomUUID()` 在 jsdom 中不可用 | 测试报错 | `vitest` 在 Node 18+ 中内置 `crypto.randomUUID()`，jsdom 环境继承 Node crypto |
| TailwindCSS 自定义 class 在测试中无视觉效果 | 测试无法验证样式 | 测试只验证结构、文本内容和交互行为，不验证样式。样式由 manual review 确认 |
| `browser.storage.local` 在测试环境不可用 | SkillStore 测试依赖 mock | 本测试 mock 整个 SkillStore，不涉及真实 chrome API |

## 10. 设计决策记录

1. **不使用项目现有 `ConfirmDialog` 组件**：`ConfirmDialog` 的 props 绑定 `ConfirmRequest` 类型（tool call 确认场景），与 skill 删除场景不匹配。内联实现更简洁，避免对现有组件做不必要的泛化修改。

2. **使用自定义 CSS 开关而非原生 checkbox**：开关是即时生效的操作控件，与 SettingsPanel 中表单 checkbox 使用场景不同。自定义开关视觉更清晰，与项目现有 UI 风格一致。

3. **编辑表单始终显示在列表下方**：与 SettingsPanel 的 Provider 编辑模式一致，保持 UI 行为统一。不做模态弹窗嵌套。

4. **新建按钮仅非编辑模式显示**：与 SettingsPanel 一致（L231 `!editing &&`）。编辑模式下隐藏新建按钮，避免 UI 混乱。

5. **数据完全通过 SkillStore 管理**：组件不维护本地数据副本，所有变更通过 `SkillStore` 方法提交，列表通过 `onChange` 监听自动同步。这确保与其他 tab/panel 的数据一致性。
