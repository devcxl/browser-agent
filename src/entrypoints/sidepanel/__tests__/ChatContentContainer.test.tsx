import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ChatContentContainer } from '../components/ChatContentContainer';

describe('ChatContentContainer', () => {
  it('renders children correctly', () => {
    render(
      <ChatContentContainer>
        <p data-testid="child">Hello</p>
      </ChatContentContainer>,
    );
    expect(screen.getByTestId('child')).toBeDefined();
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('has correct Tailwind width and padding classes', () => {
    const { container } = render(
      <ChatContentContainer>
        <span>content</span>
      </ChatContentContainer>,
    );
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('w-full');
    expect(div.className).toContain('mx-auto');
    expect(div.className).toContain('px-4');
    expect(div.className).toContain('sm:px-6');
    expect(div.className).toContain('lg:w-[90%]');
    expect(div.className).toContain('lg:px-0');
    expect(div.className).toContain('min-[1440px]:w-3/4');
  });

  it('merges className prop with default classes', () => {
    const { container } = render(
      <ChatContentContainer className="bg-red-500 custom-class">
        <span>content</span>
      </ChatContentContainer>,
    );
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('bg-red-500');
    expect(div.className).toContain('custom-class');
    // 基础类仍然存在
    expect(div.className).toContain('w-full');
  });

  it('renders without className prop', () => {
    const { container } = render(
      <ChatContentContainer>
        <span>content</span>
      </ChatContentContainer>,
    );
    const div = container.firstChild as HTMLElement;
    expect(div.className).toBe(
      'w-full mx-auto px-4 sm:px-6 lg:w-[90%] lg:px-0 min-[1440px]:w-3/4',
    );
  });

  it('wraps children in a single div', () => {
    const { container } = render(
      <ChatContentContainer>
        <span>A</span>
        <span>B</span>
      </ChatContentContainer>,
    );
    const div = container.firstChild as HTMLElement;
    expect(div.tagName).toBe('DIV');
  });
});
