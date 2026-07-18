import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolCallCard, ToolCallCardSDK } from '../components/ToolCallCard';
import { I18nProvider } from '../i18n/I18nProvider';
import { mockBrowserStorage } from './test-utils';
import type { ToolCallDisplay } from '../types';

function wrappedRender(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => { mockBrowserStorage(); });

describe('ToolCallCard', () => {
  const baseCall: ToolCallDisplay = {
    id: '1',
    name: 'tabs_query',
    params: { active: true },
    status: 'success',
    riskLevel: 'low',
    confirmed: true,
  };

  it('renders tool name', () => {
    wrappedRender(<ToolCallCard call={baseCall} />);
    expect(screen.getByText('tabs_query')).toBeDefined();
  });

  it('shows success status dot', () => {
    const { container } = wrappedRender(<ToolCallCard call={baseCall} />);
    expect(container.querySelector('.bg-success')).toBeDefined();
  });

  it('shows error status dot for failed call', () => {
    const { container } = wrappedRender(<ToolCallCard call={{ ...baseCall, status: 'error' }} />);
    expect(container.querySelector('.bg-danger')).toBeDefined();
  });

  it('shows risk level', () => {
    wrappedRender(<ToolCallCard call={{ ...baseCall, riskLevel: 'high' }} />);
    expect(screen.getByText('high')).toBeDefined();
  });

  it('expands to show params on click', async () => {
    wrappedRender(<ToolCallCard call={baseCall} />);
    await userEvent.click(screen.getByText('tabs_query'));
    expect(screen.getByText(/参数/)).toBeDefined();
  });
});

// ─── SDK 工具调用卡片测试 ──────────────────────────────

describe('ToolCallCardSDK', () => {
  it('renders tool name', () => {
    wrappedRender(
      <ToolCallCardSDK
        toolCallId="sdk-1"
        toolName="tabs_query"
        state="output-available"
        input={{ active: true }}
        output={{ count: 3 }}
      />,
    );
    expect(screen.getByText('tabs_query')).toBeDefined();
    expect(screen.getByText('output-available')).toBeDefined();
  });

  it('shows success status dot for output-available state', () => {
    const { container } = wrappedRender(
      <ToolCallCardSDK
        toolCallId="sdk-2"
        toolName="tabs_query"
        state="output-available"
        output={{ count: 3 }}
      />,
    );
    expect(container.querySelector('.bg-success')).toBeDefined();
  });

  it('shows error status dot for output-error state', () => {
    const { container } = wrappedRender(
      <ToolCallCardSDK
        toolCallId="sdk-3"
        toolName="bad_tool"
        state="output-error"
        errorText="Something went wrong"
      />,
    );
    expect(container.querySelector('.bg-danger')).toBeDefined();
  });

  it('shows pulsing dot for input-streaming state', () => {
    const { container } = wrappedRender(
      <ToolCallCardSDK
        toolCallId="sdk-4"
        toolName="loading_tool"
        state="input-streaming"
      />,
    );
    expect(screen.getByText('loading_tool')).toBeDefined();
    // running 状态显示脉冲状态点
    expect(container.querySelector('.animate-dot-pulse')).toBeDefined();
  });

  it('expands to show params and output on click', async () => {
    wrappedRender(
      <ToolCallCardSDK
        toolCallId="sdk-5"
        toolName="tabs_query"
        state="output-available"
        input={{ url: 'example.com' }}
        output={{ count: 3 }}
      />,
    );
    await userEvent.click(screen.getByText('tabs_query'));
    expect(screen.getByText(/参数/)).toBeDefined();
    expect(screen.getByText(/结果/)).toBeDefined();
  });

  it('shows errorText in expanded view', async () => {
    wrappedRender(
      <ToolCallCardSDK
        toolCallId="sdk-6"
        toolName="broken_tool"
        state="output-error"
        errorText="Connection refused"
      />,
    );
    await userEvent.click(screen.getByText('broken_tool'));
    expect(screen.getByText('Connection refused')).toBeDefined();
  });
});
