import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MessageInput } from '../components/MessageInput';

describe('MessageInput', () => {
  it('sends text on button click', async () => {
    const onSend = vi.fn();
    render(
      <MessageInput onSend={onSend} onAbort={vi.fn()} disabled={false} isRunning={false} />,
    );

    const input = screen.getByTestId('message-input');
    const sendBtn = screen.getByTestId('send-button');

    await userEvent.type(input, 'hello');
    await userEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('sends text on Enter key', async () => {
    const onSend = vi.fn();
    render(
      <MessageInput onSend={onSend} onAbort={vi.fn()} disabled={false} isRunning={false} />,
    );

    const input = screen.getByTestId('message-input');
    await userEvent.type(input, 'test message{Enter}');

    expect(onSend).toHaveBeenCalledWith('test message');
  });

  it('does not send empty input', async () => {
    const onSend = vi.fn();
    render(
      <MessageInput onSend={onSend} onAbort={vi.fn()} disabled={false} isRunning={false} />,
    );

    const sendBtn = screen.getByTestId('send-button');
    await userEvent.click(sendBtn);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send whitespace-only input', async () => {
    const onSend = vi.fn();
    render(
      <MessageInput onSend={onSend} onAbort={vi.fn()} disabled={false} isRunning={false} />,
    );

    const input = screen.getByTestId('message-input');
    await userEvent.type(input, '   ');
    await userEvent.click(screen.getByTestId('send-button'));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows abort button when running', () => {
    render(
      <MessageInput onSend={vi.fn()} onAbort={vi.fn()} disabled={true} isRunning={true} />,
    );

    expect(screen.getByTestId('abort-button')).toBeDefined();
    expect(screen.queryByTestId('send-button')).toBeNull();
  });

  it('calls onAbort when abort button clicked', async () => {
    const onAbort = vi.fn();
    render(
      <MessageInput onSend={vi.fn()} onAbort={onAbort} disabled={true} isRunning={true} />,
    );

    await userEvent.click(screen.getByTestId('abort-button'));
    expect(onAbort).toHaveBeenCalledOnce();
  });

  it('clears input after sending', async () => {
    const onSend = vi.fn();
    render(
      <MessageInput onSend={onSend} onAbort={vi.fn()} disabled={false} isRunning={false} />,
    );

    const input = screen.getByTestId('message-input') as HTMLTextAreaElement;
    await userEvent.type(input, 'hello{Enter}');

    expect(input.value).toBe('');
  });
});
