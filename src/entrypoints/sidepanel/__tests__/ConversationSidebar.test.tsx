import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationSidebar } from '../components/ConversationSidebar';
import { I18nProvider } from '../i18n/I18nProvider';
import { mockBrowserStorage } from './test-utils';

function wrappedRender(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => { mockBrowserStorage(); });

describe('ConversationSidebar', () => {
  const conversations = [
    { id: '1', title: '对话1', updatedAt: Date.now() },
    { id: '2', title: '对话2', updatedAt: Date.now() - 10000 },
  ];

  const defaultProps = {
    conversations,
    activeId: null,
    loading: false,
    error: null,
    open: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };

  it('wrappedRenders conversation list', () => {
    wrappedRender(<ConversationSidebar {...defaultProps} />);

    expect(screen.getByTestId('conversation-sidebar')).toBeDefined();
    expect(screen.getByText('对话1')).toBeDefined();
    expect(screen.getByText('对话2')).toBeDefined();
  });

  it('highlights active conversation', () => {
    wrappedRender(<ConversationSidebar {...defaultProps} activeId="1" />);

    const items = screen.getAllByTestId('conversation-item');
    expect(items[0]?.className).toContain('bg-accent-soft');
  });

  it('calls onSelect when item clicked', async () => {
    const onSelect = vi.fn();
    wrappedRender(<ConversationSidebar {...defaultProps} onSelect={onSelect} />);

    await userEvent.click(screen.getByText('对话1'));
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('calls onNew when new button clicked', async () => {
    const onNew = vi.fn();
    wrappedRender(<ConversationSidebar {...defaultProps} onNew={onNew} />);

    await userEvent.click(screen.getByTestId('new-conversation-button'));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('shows empty state', () => {
    wrappedRender(<ConversationSidebar {...defaultProps} conversations={[]} />);

    expect(screen.getByText('暂无会话')).toBeDefined();
  });

  it('shows loading state', () => {
    wrappedRender(<ConversationSidebar {...defaultProps} conversations={[]} loading={true} />);

    expect(screen.getByText('加载中...')).toBeDefined();
  });

  it('closed drawer hides content off-screen', () => {
    wrappedRender(<ConversationSidebar {...defaultProps} open={false} />);

    const drawer = screen.getByTestId('conversation-sidebar');
    expect(drawer.className).toContain('-translate-x-full');
  });

  it('calls onClose when mask clicked', async () => {
    const onClose = vi.fn();
    wrappedRender(<ConversationSidebar {...defaultProps} onClose={onClose} />);

    await userEvent.click(screen.getByTestId('drawer-mask'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when toggle button clicked', async () => {
    const onClose = vi.fn();
    wrappedRender(<ConversationSidebar {...defaultProps} onClose={onClose} />);

    await userEvent.click(screen.getByTestId('conversation-sidebar-toggle'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
