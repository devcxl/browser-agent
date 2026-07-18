import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ChatView } from '../components/ChatView';
import { I18nProvider } from '../i18n/I18nProvider';
import { mockBrowserStorage } from './test-utils';
import type { UIMessage } from '../types';

function wrappedRender(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  mockBrowserStorage();
  // jsdom 不支持 scrollIntoView
  Element.prototype.scrollIntoView = () => {};
});

describe('ChatView', () => {
  it('renders scroll container with expected classes', () => {
    const { container } = wrappedRender(<ChatView messages={[]} />);
    const scrollContainer = container.firstChild as HTMLElement;
    expect(scrollContainer.className).toContain('flex-1');
    expect(scrollContainer.className).toContain('overflow-y-auto');
  });

  it('message list does NOT contain max-w-3xl', () => {
    const { container } = wrappedRender(<ChatView messages={[]} />);
    // The inner message-list div should not have max-w-3xl
    const messageList = container.querySelector('.flex-1 > div') as HTMLElement;
    expect(messageList).toBeDefined();
    expect(messageList.className).not.toContain('max-w-3xl');
  });

  it('message list keeps core layout classes', () => {
    const { container } = wrappedRender(<ChatView messages={[]} />);
    const messageList = container.querySelector('.flex-1 > div') as HTMLElement;
    expect(messageList.className).toContain('w-full');
    expect(messageList.className).toContain('mx-auto');
    expect(messageList.className).toContain('flex');
    expect(messageList.className).toContain('flex-col');
    expect(messageList.className).toContain('gap-3');
  });

  it('renders empty state when no messages', () => {
    wrappedRender(<ChatView messages={[]} />);
    // I18nProvider renders translated text for chat.emptyState
    expect(screen.getByText('开始对话，发送消息给 Browser Agent')).toBeDefined();
  });

  it('renders messages', () => {
    const msg: UIMessage = {
      id: '1',
      role: 'user',
      content: 'hello',
      timestamp: Date.now(),
      status: 'complete',
    };
    wrappedRender(<ChatView messages={[msg]} />);
    expect(screen.getByText('hello')).toBeDefined();
  });

  it('renders multiple messages', () => {
    const msgs: UIMessage[] = [
      { id: '1', role: 'user', content: 'hi', timestamp: Date.now(), status: 'complete' },
      { id: '2', role: 'assistant', content: 'hello there', timestamp: Date.now(), status: 'complete' },
    ];
    wrappedRender(<ChatView messages={msgs} />);
    expect(screen.getByText('hi')).toBeDefined();
    expect(screen.getByText('hello there')).toBeDefined();
  });
});
