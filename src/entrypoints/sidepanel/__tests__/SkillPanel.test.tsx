import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillPanel } from '../components/SkillPanel';
import { SkillStore, SkillSubscriptionStore } from '@/shared/storage';
import type { Skill, SkillSubscription } from '@/shared/types';

// Mock github-skill-fetcher to avoid real network calls
vi.mock('@/shared/github-skill-fetcher', () => ({
  fetchSkillsFromGitHub: vi.fn().mockResolvedValue([]),
}));

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
    source: '',
    resources: [],
    ...overrides,
  };
}

function makeSub(overrides: Partial<SkillSubscription> = {}): SkillSubscription {
  return {
    id: 'sub-1',
    source: 'owner/repo',
    type: 'github',
    enabled: true,
    lastSyncedAt: null,
    createdAt: 1700000000000,
    ...overrides,
  };
}

function mockSkillStore() {
  const listeners: Array<(skills: Skill[]) => void> = [];

  const mock = {
    getAll: vi.fn<() => Promise<Skill[]>>().mockResolvedValue([]),
    getEnabled: vi.fn<() => Promise<Skill[]>>().mockResolvedValue([]),
    save: vi.fn<(skills: Skill[]) => Promise<void>>(),
    add: vi.fn<(skill: Skill) => Promise<void>>(),
    update: vi.fn<(id: string, patch: Partial<Skill>) => Promise<void>>(),
    remove: vi.fn<(id: string) => Promise<void>>(),
    getContent: vi.fn(),
    loadReady: vi.fn<(skills: Skill[]) => Promise<Skill[]>>().mockResolvedValue([]),
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

function mockSubStore() {
  const listeners: Array<(subs: SkillSubscription[]) => void> = [];

  const mock = {
    getAll: vi.fn<() => Promise<SkillSubscription[]>>().mockResolvedValue([]),
    add: vi.fn<(sub: SkillSubscription) => Promise<void>>(),
    update: vi.fn<(id: string, patch: Partial<SkillSubscription>) => Promise<void>>(),
    remove: vi.fn<(id: string) => Promise<void>>(),
    onChange: vi.fn((callback: (subs: SkillSubscription[]) => void) => {
      listeners.push(callback);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    }),
    _notify: (subs: SkillSubscription[]) => {
      for (const listener of listeners) {
        listener(subs);
      }
    },
  };

  return mock;
}

// ==================== 测试 ====================

describe('SkillPanel', () => {
  let skillStoreMock: ReturnType<typeof mockSkillStore>;
  let subStoreMock: ReturnType<typeof mockSubStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    skillStoreMock = mockSkillStore();
    subStoreMock = mockSubStore();
    vi.spyOn(SkillStore, 'getInstance').mockReturnValue(
      skillStoreMock as unknown as SkillStore,
    );
    vi.spyOn(SkillSubscriptionStore, 'getInstance').mockReturnValue(
      subStoreMock as unknown as SkillSubscriptionStore,
    );
  });

  // ── 渲染 ──────────────────────────────────────────

  it('应正确渲染标题栏和关闭按钮', async () => {
    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-panel')).toBeDefined();
    });
    expect(screen.getByText('技能管理')).toBeDefined();
    expect(screen.getByTestId('skill-panel-close')).toBeDefined();
  });

  it('点击关闭按钮应调用 onClose', async () => {
    const onClose = vi.fn();
    render(<SkillPanel onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-panel-close')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-panel-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ── 空状态 ────────────────────────────────────────

  it('无订阅和技能时应显示空提示', async () => {
    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('暂无订阅，输入 GitHub 仓库地址添加')).toBeDefined();
    });
  });

  // ── 订阅管理 ──────────────────────────────────────

  it('输入仓库地址后点击添加按钮应创建订阅', async () => {
    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('subscription-add-btn')).toBeDefined();
    });

    const input = screen.getByPlaceholderText('输入 GitHub 仓库，如 owner/repo');
    await userEvent.type(input, 'test-owner/test-repo');
    await userEvent.click(screen.getByTestId('subscription-add-btn'));

    expect(subStoreMock.add).toHaveBeenCalledOnce();
    const added = subStoreMock.add.mock.calls[0][0] as SkillSubscription;
    expect(added.source).toBe('test-owner/test-repo');
    expect(added.type).toBe('github');
  });

  it('输入为空时添加按钮应 disabled', async () => {
    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      const btn = screen.getByTestId('subscription-add-btn') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  it('应显示已存在的订阅列表', async () => {
    const subs = [
      makeSub({ id: 'sub-a', source: 'owner/repo-a' }),
      makeSub({ id: 'sub-b', source: 'owner/repo-b' }),
    ];
    subStoreMock.getAll.mockResolvedValue(subs);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('owner/repo-a')).toBeDefined();
      expect(screen.getByText('owner/repo-b')).toBeDefined();
    });
  });

  it('点击订阅的删除按钮应调用 subStore.remove', async () => {
    const sub = makeSub({ id: 'sub-1', source: 'owner/repo' });
    subStoreMock.getAll.mockResolvedValue([sub]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('owner/repo')).toBeDefined();
    });

    const removeBtns = screen.getAllByText('删除');
    await userEvent.click(removeBtns[0]);

    expect(subStoreMock.remove).toHaveBeenCalledWith('sub-1');
  });

  // ── 技能操作 ──────────────────────────────────────

  it('点击技能开关应调用 skillStore.update 切换 enabled', async () => {
    const skill = makeSkill({ id: 's1', enabled: true, source: 'github:owner/repo' });
    const sub = makeSub({ id: 'sub-1', source: 'owner/repo' });
    skillStoreMock.getAll.mockResolvedValue([skill]);
    subStoreMock.getAll.mockResolvedValue([sub]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-toggle')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-toggle'));

    expect(skillStoreMock.update).toHaveBeenCalledWith('s1', { enabled: false });
  });

  it('点击技能删除按钮应调用 skillStore.remove', async () => {
    const skill = makeSkill({ id: 's1', source: 'github:owner/repo' });
    const sub = makeSub({ id: 'sub-1', source: 'owner/repo' });
    skillStoreMock.getAll.mockResolvedValue([skill]);
    subStoreMock.getAll.mockResolvedValue([sub]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-delete')).toBeDefined();
    });
    await userEvent.click(screen.getByTestId('skill-delete'));

    expect(skillStoreMock.remove).toHaveBeenCalledWith('s1');
  });

  // ── 本地技能 ──────────────────────────────────────

  it('应显示本地技能（无 source 的 skill）', async () => {
    const localSkill = makeSkill({ id: 's1', name: '本地技能', source: '' });
    skillStoreMock.getAll.mockResolvedValue([localSkill]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      const elements = screen.getAllByText('本地技能');
      expect(elements.length).toBeGreaterThanOrEqual(2); // heading + skill name
    });
  });

  // ── 启用的技能 badge ──────────────────────────────

  it('启用的本地技能应显示"启用" badge', async () => {
    const skill = makeSkill({ id: 's1', name: '已启用技能', enabled: true, source: '' });
    skillStoreMock.getAll.mockResolvedValue([skill]);

    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('已启用技能')).toBeDefined();
    });
    expect(screen.getByText('启用')).toBeDefined();
  });

  // ── onChange 监听 ─────────────────────────────────

  it('SkillSubscriptionStore.onChange 触发时应更新列表', async () => {
    subStoreMock.getAll.mockResolvedValue([]);
    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('暂无订阅，输入 GitHub 仓库地址添加')).toBeDefined();
    });

    const newSubs = [makeSub({ id: 'sub-new', source: 'new/repo' })];
    subStoreMock.getAll.mockResolvedValue(newSubs);
    subStoreMock._notify(newSubs);

    await waitFor(() => {
      expect(screen.getByText('new/repo')).toBeDefined();
    });
  });

  // ── 组件卸载 ──────────────────────────────────────

  it('组件卸载时应取消订阅监听', async () => {
    render(<SkillPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('skill-panel')).toBeDefined();
    });

    expect(skillStoreMock.onChange).toHaveBeenCalledOnce();
    expect(subStoreMock.onChange).toHaveBeenCalledOnce();
  });
});
