import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Module-level mocks (vi.mock is hoisted above imports) ──

const mockConfigStore = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  getAll: vi.fn().mockResolvedValue({}),
  patch: vi.fn(),
  onChange: vi.fn(),
  clear: vi.fn(),
  getDefaults: vi.fn(),
}));

const mockConversationManager = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  addMessage: vi.fn(),
  getRecentMessages: vi.fn(),
  needsSummary: vi.fn(),
  generateSummary: vi.fn(),
}));

vi.mock('@/shared/storage', () => ({
  ConfigStore: {
    getInstance: vi.fn(() => mockConfigStore),
    resetInstance: vi.fn(),
  },
}));

vi.mock('@/conversation', () => ({
  ConversationManager: vi.fn(() => mockConversationManager),
}));

import { ChatProvider, useChat } from '../ChatContext';

function ContextInspector() {
  const chat = useChat();
  return (
    <div>
      <div data-testid="messages-count">{chat.messages.length}</div>
      <div data-testid="messages-loading">{String(chat.messagesLoading)}</div>
      <div data-testid="messages-error">{chat.messagesError ?? '(none)'}</div>
      <div data-testid="active-id">{chat.conversations.activeId ?? '(none)'}</div>
      <div data-testid="conv-loading">{String(chat.conversations.loading)}</div>
    </div>
  );
}

describe('ChatContext message loading', () => {
  beforeEach(() => {
    mockConfigStore.get.mockReset();
    mockConfigStore.set.mockReset();
    mockConfigStore.get.mockResolvedValue(undefined);
    mockConversationManager.get.mockReset();
    mockConversationManager.list.mockReset();
    mockConversationManager.list.mockResolvedValue([]);
  });

  it('exposes messagesLoading and messagesError fields', async () => {
    render(
      <ChatProvider>
        <ContextInspector />
      </ChatProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('conv-loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('messages-loading').textContent).toBe('false');
    expect(screen.getByTestId('messages-error').textContent).toBe('(none)');
    expect(screen.getByTestId('messages-count').textContent).toBe('0');
  });

  it('loads messages when activeId is set from restored ConfigStore', async () => {
    const now = Date.now();
    mockConversationManager.list.mockResolvedValue([
      { id: 'conv-1', title: 'Test', updatedAt: now, createdAt: now, messages: [], sensitiveDataGranted: false },
    ]);
    mockConversationManager.get.mockResolvedValue({
      id: 'conv-1',
      title: 'Test',
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: 'm1', role: 'user' as const, content: 'Hello', timestamp: now },
        { id: 'm2', role: 'assistant' as const, content: 'Hi', timestamp: now + 1000 },
        { id: 'm3', role: 'user' as const, content: 'How are you?', timestamp: now + 2000 },
      ],
      sensitiveDataGranted: false,
    });
    // No saved activeConversationId → auto-select most recent
    mockConfigStore.get.mockResolvedValue(undefined);

    render(
      <ChatProvider>
        <ContextInspector />
      </ChatProvider>,
    );

    // Wait for conv loading to finish, then for messages to load
    await waitFor(() => {
      expect(screen.getByTestId('conv-loading').textContent).toBe('false');
    }, { timeout: 5000 });

    // Wait a tick for the restore effect and message loading effect
    await vi.waitFor(() => {
      expect(screen.getByTestId('messages-loading').textContent).toBe('false');
    }, { timeout: 5000 });

    expect(screen.getByTestId('active-id').textContent).toBe('conv-1');
    expect(screen.getByTestId('messages-count').textContent).toBe('3');
    expect(screen.getByTestId('messages-error').textContent).toBe('(none)');
    expect(mockConversationManager.get).toHaveBeenCalledWith('conv-1');
  });

  it('shows error when message loading fails', async () => {
    mockConversationManager.list.mockResolvedValue([
      { id: 'conv-1', title: 'Test', updatedAt: Date.now(), createdAt: Date.now(), messages: [], sensitiveDataGranted: false },
    ]);
    mockConversationManager.get.mockRejectedValue(new Error('DB error'));
    mockConfigStore.get.mockResolvedValue(undefined);

    render(
      <ChatProvider>
        <ContextInspector />
      </ChatProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages-error').textContent).not.toBe('(none)');
    }, { timeout: 5000 });

    expect(screen.getByTestId('messages-error').textContent).toContain('DB error');
  });

  it('shows empty state when no conversations exist', async () => {
    mockConversationManager.list.mockResolvedValue([]);
    mockConfigStore.get.mockResolvedValue(undefined);

    render(
      <ChatProvider>
        <ContextInspector />
      </ChatProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('conv-loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('messages-count').textContent).toBe('0');
    expect(screen.getByTestId('active-id').textContent).toBe('(none)');
  });
});
