import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { I18nProvider } from '../i18n/I18nProvider';
import { ConfigStore } from '@/shared/storage';

// ── browser.storage mock ────────────────────────────

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
      Object.assign(storage, items);
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

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

describe('ConfirmDialog', () => {
  const baseRequest = {
    affectedObjects: [
      { type: 'tab', title: 'Example', url: 'https://example.com', reason: '关闭标签页' },
    ],
    warnings: ['此操作不可撤销'],
    toolName: 'tabs_remove',
    params: { tabId: 1 },
  };

  it('renders tool name', () => {
    render(
      <ConfirmDialog request={baseRequest} onConfirm={vi.fn()} onCancel={vi.fn()} />,
      { wrapper: TestWrapper },
    );

    expect(screen.getByTestId('confirm-dialog')).toBeDefined();
    expect(screen.getByText(/tabs_remove/)).toBeDefined();
  });

  it('renders affected objects', () => {
    render(
      <ConfirmDialog request={baseRequest} onConfirm={vi.fn()} onCancel={vi.fn()} />,
      { wrapper: TestWrapper },
    );

    const items = screen.getAllByTestId('affected-item');
    expect(items.length).toBe(1);
    expect(screen.getByText('Example')).toBeDefined();
  });

  it('renders warnings', () => {
    render(
      <ConfirmDialog request={baseRequest} onConfirm={vi.fn()} onCancel={vi.fn()} />,
      { wrapper: TestWrapper },
    );

    expect(screen.getByText(/不可撤销/)).toBeDefined();
  });

  it('calls onConfirm when confirm clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog request={baseRequest} onConfirm={onConfirm} onCancel={vi.fn()} />,
      { wrapper: TestWrapper },
    );

    await userEvent.click(screen.getByTestId('confirm-button'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when cancel clicked', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog request={baseRequest} onConfirm={vi.fn()} onCancel={onCancel} />,
      { wrapper: TestWrapper },
    );

    await userEvent.click(screen.getByTestId('cancel-button'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders with no affected objects', () => {
    render(
      <ConfirmDialog
        request={{ ...baseRequest, affectedObjects: [], warnings: [] }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
      { wrapper: TestWrapper },
    );

    expect(screen.getByTestId('confirm-dialog')).toBeDefined();
  });
});
