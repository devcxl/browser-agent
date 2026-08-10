import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ContextUsageRing, contextUsagePercent } from '../components/ContextUsageRing';
import { I18nProvider } from '../i18n/I18nProvider';
import { mockBrowserStorage } from './test-utils';

// 与组件实现同一几何公式的独立期望值（CIRC = 2π·((20-2.5)/2)）
const SIZE = 20;
const STROKE = 2.5;
const CIRCUMFERENCE = 2 * Math.PI * ((SIZE - STROKE) / 2);

beforeEach(() => {
  mockBrowserStorage();
});

function wrappedRender(ui: React.ReactElement) {
  const utils = render(<I18nProvider>{ui}</I18nProvider>);
  return {
    ...utils,
    // rerender 会替换整个渲染树，必须重新包裹 I18nProvider
    rerender: (nextUi: React.ReactElement) => utils.rerender(<I18nProvider>{nextUi}</I18nProvider>),
  };
}

describe('contextUsagePercent', () => {
  it('返回 0-100 整数（含恰好 100% 边界）', () => {
    expect(contextUsagePercent(45200, 128000)).toBe(35);
    expect(contextUsagePercent(128000, 128000)).toBe(100);
  });

  it('clamp 上限：占用超过上限时返回 100', () => {
    expect(contextUsagePercent(150000, 128000)).toBe(100);
  });

  it('clamp 下限与 limit<=0 防御：返回 0 且不抛错', () => {
    expect(contextUsagePercent(0, 128000)).toBe(0);
    expect(contextUsagePercent(-1, 128000)).toBe(0);
    expect(contextUsagePercent(100, 0)).toBe(0);
  });
});

describe('ContextUsageRing', () => {
  it('used<=0 或 limit<=0 时隐藏，有效值时显示', () => {
    const { queryByTestId, rerender } = wrappedRender(<ContextUsageRing used={0} limit={128000} />);
    expect(queryByTestId('context-usage-ring')).toBeNull();

    rerender(<ContextUsageRing used={45200} limit={0} />);
    expect(queryByTestId('context-usage-ring')).toBeNull();

    rerender(<ContextUsageRing used={45200} limit={128000} />);
    expect(queryByTestId('context-usage-ring')).not.toBeNull();
  });

  it('占用率 ≥80% 时 wrapper data-state=warning 且进度弧 text-danger，<80% 为 normal', () => {
    const { getByTestId, rerender } = wrappedRender(<ContextUsageRing used={102400} limit={128000} />);
    expect(getByTestId('context-usage-ring').getAttribute('data-state')).toBe('warning');
    expect(getByTestId('context-usage-ring').getAttribute('class')).toContain('bg-danger/10');
    expect(getByTestId('context-usage-ring-progress').getAttribute('class')).toContain('text-danger');

    rerender(<ContextUsageRing used={101120} limit={128000} />);
    expect(getByTestId('context-usage-ring').getAttribute('data-state')).toBe('normal');
    expect(getByTestId('context-usage-ring').getAttribute('class')).not.toContain('bg-danger/10');
    expect(getByTestId('context-usage-ring-progress').getAttribute('class')).toContain('text-primary');

    // 100% 仍为 warning
    rerender(<ContextUsageRing used={128000} limit={128000} />);
    expect(getByTestId('context-usage-ring').getAttribute('data-state')).toBe('warning');
  });

  it('hover title/aria-label 显示千位分隔的上下文占用文案', () => {
    const { getByTestId, rerender } = wrappedRender(<ContextUsageRing used={45200} limit={128000} />);
    let wrapper = getByTestId('context-usage-ring');
    expect(wrapper.getAttribute('title')).toBe('上下文占用：45,200 / 128,000');
    expect(wrapper.getAttribute('aria-label')).toBe('上下文占用：45,200 / 128,000');

    rerender(<ContextUsageRing used={1000} limit={128000} />);
    wrapper = getByTestId('context-usage-ring');
    expect(wrapper.getAttribute('title')).toContain('1,000');
    expect(wrapper.getAttribute('title')).toContain('128,000');
  });

  it('进度弧 stroke-dashoffset 与 percent 几何闭环', () => {
    const { getByTestId, rerender } = wrappedRender(<ContextUsageRing used={32000} limit={128000} />);
    const offset = () => parseFloat(getByTestId('context-usage-ring-progress').getAttribute('stroke-dashoffset') ?? 'NaN');

    // percent=25 → 0.75·CIRC
    expect(Math.abs(offset() - 0.75 * CIRCUMFERENCE)).toBeLessThan(0.5);
    // percent=100 → ≈0
    rerender(<ContextUsageRing used={128000} limit={128000} />);
    expect(Math.abs(offset() - 0)).toBeLessThan(0.5);
    // percent=0 → ≈CIRC
    rerender(<ContextUsageRing used={1} limit={128000} />);
    expect(Math.abs(offset() - CIRCUMFERENCE)).toBeLessThan(0.5);
  });
});
