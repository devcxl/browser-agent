import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConversationSidebar } from '../components/ConversationSidebar';

describe('ConversationSidebar', () => {
  const conversations = [
    { id: '1', title: '对话1', updatedAt: Date.now() },
    { id: '2', title: '对话2', updatedAt: Date.now() - 10000 },
  ];

  it('renders conversation list', () => {
    render(
      <ConversationSidebar
        conversations={conversations}
        activeId={null}
        loading={false}
        error={null}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        agentStatus="idle"
      />,
    );

    expect(screen.getByTestId('conversation-sidebar')).toBeDefined();
    expect(screen.getByText('对话1')).toBeDefined();
    expect(screen.getByText('对话2')).toBeDefined();
  });

  it('highlights active conversation', () => {
    render(
      <ConversationSidebar
        conversations={conversations}
        activeId="1"
        loading={false}
        error={null}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        agentStatus="idle"
      />,
    );

    const items = screen.getAllByTestId('conversation-item');
    expect(items[0]?.className).toContain('bg-blue-50');
  });

  it('calls onSelect when item clicked', async () => {
    const onSelect = vi.fn();
    render(
      <ConversationSidebar
        conversations={conversations}
        activeId={null}
        loading={false}
        error={null}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onSelect={onSelect}
        onNew={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        agentStatus="idle"
      />,
    );

    await userEvent.click(screen.getByText('对话1'));
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('calls onNew when new button clicked', async () => {
    const onNew = vi.fn();
    render(
      <ConversationSidebar
        conversations={conversations}
        activeId={null}
        loading={false}
        error={null}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onSelect={vi.fn()}
        onNew={onNew}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        agentStatus="idle"
      />,
    );

    await userEvent.click(screen.getByTestId('new-conversation-button'));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('shows empty state', () => {
    render(
      <ConversationSidebar
        conversations={[]}
        activeId={null}
        loading={false}
        error={null}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        agentStatus="idle"
      />,
    );

    expect(screen.getByText('暂无会话')).toBeDefined();
  });

  it('shows loading state', () => {
    render(
      <ConversationSidebar
        conversations={[]}
        activeId={null}
        loading={true}
        error={null}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        agentStatus="idle"
      />,
    );

    expect(screen.getByText('加载中...')).toBeDefined();
  });

  it('collapsed mode shows only toggle button', () => {
    render(
      <ConversationSidebar
        conversations={conversations}
        activeId={null}
        loading={false}
        error={null}
        collapsed={true}
        onToggleCollapse={vi.fn()}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        agentStatus="idle"
      />,
    );

    expect(screen.getByTestId('conversation-sidebar-toggle')).toBeDefined();
    expect(screen.queryByText('对话1')).toBeNull();
  });
});
