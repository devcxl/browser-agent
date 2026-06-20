import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { ToolCallCard } from '../components/ToolCallCard';
import type { ToolCallDisplay } from '../types';

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
    render(<ToolCallCard call={baseCall} />);
    expect(screen.getByText('tabs_query')).toBeDefined();
  });

  it('shows success icon', () => {
    render(<ToolCallCard call={baseCall} />);
    expect(screen.getByText('✓')).toBeDefined();
  });

  it('shows error icon for failed call', () => {
    render(<ToolCallCard call={{ ...baseCall, status: 'error' }} />);
    expect(screen.getByText('✕')).toBeDefined();
  });

  it('shows risk level', () => {
    render(<ToolCallCard call={{ ...baseCall, riskLevel: 'high' }} />);
    expect(screen.getByText('high')).toBeDefined();
  });

  it('expands to show params on click', async () => {
    render(<ToolCallCard call={baseCall} />);
    await userEvent.click(screen.getByText('tabs_query'));
    expect(screen.getByText(/参数/)).toBeDefined();
  });
});
