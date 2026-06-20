import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialog } from '../components/ConfirmDialog';

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
    );

    expect(screen.getByTestId('confirm-dialog')).toBeDefined();
    expect(screen.getByText(/tabs_remove/)).toBeDefined();
  });

  it('renders affected objects', () => {
    render(
      <ConfirmDialog request={baseRequest} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    const items = screen.getAllByTestId('affected-item');
    expect(items.length).toBe(1);
    expect(screen.getByText('Example')).toBeDefined();
  });

  it('renders warnings', () => {
    render(
      <ConfirmDialog request={baseRequest} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByText(/不可撤销/)).toBeDefined();
  });

  it('calls onConfirm when confirm clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog request={baseRequest} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    await userEvent.click(screen.getByTestId('confirm-button'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when cancel clicked', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog request={baseRequest} onConfirm={vi.fn()} onCancel={onCancel} />,
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
    );

    expect(screen.getByTestId('confirm-dialog')).toBeDefined();
  });
});
