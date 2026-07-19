import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FloatingButtonSection } from '../components/FloatingButtonSection';
import { I18nProvider } from '../i18n/I18nProvider';
import { ConfigStore } from '@/shared/storage';
import type { FloatingButtonSettings } from '@/shared/types';

// ── Mock browser.storage ────────────────────────────────────────

function createMockBrowser() {
  const storage: Record<string, unknown> = {};
  const listeners: Array<(changes: Record<string, browser.storage.StorageChange>) => void> = [];

  const local = {
    get: vi.fn(async (keys: string | string[] | Record<string, unknown> | null) => {
      if (keys === null) return { ...storage };
      const keysArr = Array.isArray(keys) ? (keys as string[]) : [keys as string];
      const result: Record<string, unknown> = {};
      for (const key of keysArr) {
        if (key in storage) result[key] = storage[key];
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      const changes: Record<string, browser.storage.StorageChange> = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: storage[key], newValue: value };
      }
      Object.assign(storage, items);
      // 通知所有监听器
      if (Object.keys(changes).length > 0) {
        for (const listener of listeners) {
          listener(changes);
        }
      }
    }),
    remove: vi.fn(),
    clear: vi.fn(),
  };

  const onChanged = {
    addListener: vi.fn((listener: typeof listeners[0]) => {
      listeners.push(listener);
    }),
    removeListener: vi.fn((listener: typeof listeners[0]) => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
  };

  return { local, onChanged, storage, listeners };
}

let mockBrowser: ReturnType<typeof createMockBrowser>;

beforeEach(() => {
  mockBrowser = createMockBrowser();
  vi.stubGlobal('browser', {
    storage: {
      local: mockBrowser.local,
      onChanged: mockBrowser.onChanged,
    },
  });
  ConfigStore.resetInstance();
});

afterEach(() => {
  ConfigStore.resetInstance();
});

// ── 辅助函数 ─────────────────────────────────────────────────────

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

async function seedSettings(settings: Partial<FloatingButtonSettings> = {}) {
  const configStore = ConfigStore.getInstance();
  const defaults: FloatingButtonSettings = {
    enabled: true,
    position: null,
    blacklist: [],
  };
  await configStore.set('floatingButtonSettings', { ...defaults, ...settings });
}

// ── 测试用例 ─────────────────────────────────────────────────────

describe('FloatingButtonSection', () => {
  it('渲染时加载并显示默认设置（enabled=true，blacklist 为空）', async () => {
    await seedSettings({ enabled: true, blacklist: [] });
    await act(async () => {
      renderWithI18n(<FloatingButtonSection />);
    });

    // 组件渲染成功
    expect(screen.getByTestId('floating-button-section')).toBeTruthy();

    // 开关为 checked 状态
    const toggle = screen.getByRole('switch', { name: '启用浮动按钮' });
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    // 黑名单空态
    expect(screen.getByText('暂无隐藏站点')).toBeTruthy();
  });

  it('关闭总开关后保存 enabled=false', async () => {
    await seedSettings({ enabled: true });
    await act(async () => {
      renderWithI18n(<FloatingButtonSection />);
    });

    const toggle = screen.getByRole('switch', { name: '启用浮动按钮' });
    await userEvent.click(toggle);

    // 读取存储验证已保存
    const configStore = ConfigStore.getInstance();
    const saved = await configStore.get<FloatingButtonSettings>('floatingButtonSettings');
    expect(saved.enabled).toBe(false);
  });

  it('显示黑名单列表及其删除按钮', async () => {
    await seedSettings({ blacklist: ['example.com', 'test.org'] });
    await act(async () => {
      renderWithI18n(<FloatingButtonSection />);
    });

    expect(screen.getByText('example.com')).toBeTruthy();
    expect(screen.getByText('test.org')).toBeTruthy();

    // 每条有删除按钮
    const removeButtons = screen.getAllByText('移除');
    expect(removeButtons).toHaveLength(2);
  });

  it('删除黑名单条目后保存更新', async () => {
    await seedSettings({ blacklist: ['example.com', 'test.org'] });
    await act(async () => {
      renderWithI18n(<FloatingButtonSection />);
    });

    const removeButtons = screen.getAllByText('移除');
    await userEvent.click(removeButtons[0]!);

    const configStore = ConfigStore.getInstance();
    const saved = await configStore.get<FloatingButtonSettings>('floatingButtonSettings');
    expect(saved.blacklist).toEqual(['test.org']);
  });

  it('黑名单为空时显示空态提示', async () => {
    await seedSettings({ blacklist: [] });
    await act(async () => {
      renderWithI18n(<FloatingButtonSection />);
    });

    expect(screen.getByText('暂无隐藏站点')).toBeTruthy();
    expect(screen.queryByText('移除')).toBeNull();
  });

  it('重置位置按钮将 position 设为 null', async () => {
    await seedSettings({ position: { side: 'right', top: 300 } });
    await act(async () => {
      renderWithI18n(<FloatingButtonSection />);
    });

    const resetBtn = screen.getByRole('button', { name: '重置按钮位置' });
    expect(resetBtn).toBeTruthy();

    await userEvent.click(resetBtn);

    const configStore = ConfigStore.getInstance();
    const saved = await configStore.get<FloatingButtonSettings>('floatingButtonSettings');
    expect(saved.position).toBeNull();
  });
});
