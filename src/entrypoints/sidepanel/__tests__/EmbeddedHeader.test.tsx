import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { EmbeddedHeader } from '../components/EmbeddedHeader';

describe('EmbeddedHeader', () => {
  it('renders the extension name', () => {
    render(<EmbeddedHeader />);

    expect(screen.getByText('Browser Agent')).toBeDefined();
  });

  it('renders a close button with aria-label', () => {
    render(<EmbeddedHeader />);

    const closeBtn = screen.getByRole('button', { name: '关闭' });
    expect(closeBtn).toBeDefined();
    expect(closeBtn.getAttribute('aria-label')).toBe('关闭');
  });

  it('calls onClose when close button is clicked', async () => {
    const handleClose = vi.fn();
    render(<EmbeddedHeader onClose={handleClose} />);

    const closeBtn = screen.getByRole('button', { name: '关闭' });
    await userEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('renders without onClose prop (no error on click)', () => {
    render(<EmbeddedHeader />);

    const closeBtn = screen.getByRole('button', { name: '关闭' });
    // 不应抛出异常
    fireEvent.click(closeBtn);
  });
});
