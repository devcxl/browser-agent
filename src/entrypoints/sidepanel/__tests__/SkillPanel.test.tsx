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

    unmount();
  });
});
