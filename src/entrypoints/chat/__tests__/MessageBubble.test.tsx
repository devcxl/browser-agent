import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MessageBubble } from '../components/MessageBubble';
import type { UIMessage } from '../types';

describe('MessageBubble', () => {
  it('renders user message right-aligned', () => {
    const msg: UIMessage = {
      id: '1',
      role: 'user',
      content: 'hello',
      timestamp: Date.now(),
      status: 'complete',
    };

    const { container } = render(<MessageBubble message={msg} />);
    // The outer flex container has justify-end for user
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('justify-end');
    expect(screen.getByText('hello')).toBeDefined();
  });

  it('renders assistant message left-aligned', () => {
    const msg: UIMessage = {
      id: '2',
      role: 'assistant',
      content: 'response',
      timestamp: Date.now(),
      status: 'complete',
    };

    const { container } = render(<MessageBubble message={msg} />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('justify-start');
    expect(screen.getByText('response')).toBeDefined();
  });

  it('shows cursor for streaming message', () => {
    const msg: UIMessage = {
      id: '3',
      role: 'assistant',
      content: 'streaming...',
      timestamp: Date.now(),
      status: 'streaming',
    };

    render(<MessageBubble message={msg} />);
    expect(screen.getByText('streaming...')).toBeDefined();
    // Cursor indicator: should have an animate-pulse element
    const cursor = document.querySelector('.animate-pulse');
    expect(cursor).toBeDefined();
  });

  it('renders tool message in compact style', () => {
    const msg: UIMessage = {
      id: '4',
      role: 'tool',
      content: 'Tool executed',
      timestamp: Date.now(),
    };

    const { container } = render(<MessageBubble message={msg} />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('justify-center');
    expect(screen.getByText('Tool executed')).toBeDefined();
  });
});
