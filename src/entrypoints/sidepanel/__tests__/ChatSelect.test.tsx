import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatSelect } from '../components/ChatSelect';
import type { ChatSelectOption } from '../components/ChatSelect';

const OPTIONS: ChatSelectOption[] = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C' },
];

function renderSelect(
  props: Partial<{
    value: string;
    options: ChatSelectOption[];
    disabled: boolean;
    openSelectId: string | null;
    onOpenChange: (id: string | null) => void;
    onChange: (value: string) => void;
  }> = {},
) {
  const onChange = props.onChange ?? vi.fn();
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const result = render(
    <ChatSelect
      id="test-select"
      label="Test Select"
      value={props.value ?? 'a'}
      options={props.options ?? OPTIONS}
      onChange={onChange}
      disabled={props.disabled ?? false}
      openSelectId={props.openSelectId === undefined ? null : props.openSelectId}
      onOpenChange={onOpenChange}
    />,
  );
  return { ...result, onChange, onOpenChange };
}

describe('ChatSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── ARIA 属性 ──

  it('渲染 combobox 并设置正确的 aria 属性', () => {
    renderSelect();
    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');
  });

  it('打开时设置 aria-expanded="true"', () => {
    renderSelect({ openSelectId: 'test-select' });
    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  // ── 点击打开/关闭 ──

  it('点击触发器打开菜单', async () => {
    const onOpenChange = vi.fn();
    renderSelect({ onOpenChange });
    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    await userEvent.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith('test-select');
  });

  it('点击触发器关闭已打开的菜单', async () => {
    const onOpenChange = vi.fn();
    renderSelect({ openSelectId: 'test-select', onOpenChange });
    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    await userEvent.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  // ── 菜单渲染 ──

  it('菜单通过 Portal 渲染到 document.body', () => {
    renderSelect({ openSelectId: 'test-select' });
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(listbox.parentElement).toBe(document.body);
  });

  it('关闭时菜单从 DOM 中移除', () => {
    const { rerender } = renderSelect({ openSelectId: 'test-select' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    rerender(
      <ChatSelect
        id="test-select"
        label="Test Select"
        value="a"
        options={OPTIONS}
        onChange={vi.fn()}
        openSelectId={null}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  // ── 选项渲染 ──

  it('渲染所有选项并正确标记选中项', () => {
    renderSelect({ openSelectId: 'test-select', value: 'b' });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[2]).toHaveAttribute('aria-selected', 'false');
  });

  it('触发器显示选中项的 label', () => {
    renderSelect({ value: 'b' });
    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    expect(trigger).toHaveTextContent('Option B');
  });

  // ── 键盘导航 ──

  it('ArrowDown 打开菜单', async () => {
    const onOpenChange = vi.fn();
    renderSelect({ onOpenChange });
    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onOpenChange).toHaveBeenCalledWith('test-select');
  });

  it('ArrowDown 循环移动活动项（从选中项开始）', () => {
    renderSelect({ openSelectId: 'test-select', value: 'a' });
    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    trigger.focus();

    // 初始 activeIndex = 选中值 index = 0，ArrowDown 移动到 1
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger).toHaveAttribute('aria-activedescendant', 'test-select-option-1');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger).toHaveAttribute('aria-activedescendant', 'test-select-option-2');

    // 循环回到第一项
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger).toHaveAttribute('aria-activedescendant', 'test-select-option-0');
  });

  it('ArrowUp 循环移动活动项（从选中项开始）', () => {
    renderSelect({ openSelectId: 'test-select', value: 'a' });
    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    trigger.focus();

    // 初始 activeIndex = 0，ArrowUp 循环到 2
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(trigger).toHaveAttribute('aria-activedescendant', 'test-select-option-2');
  });

  it('Enter 选择活动项并关闭菜单', () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    renderSelect({ openSelectId: 'test-select', value: 'a', onChange, onOpenChange });
    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    trigger.focus();

    // activeIndex 初始为选中值 index=0，Enter 直接选择当前活动项
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('a');
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  it('Escape 关闭菜单', () => {
    const onOpenChange = vi.fn();
    renderSelect({ openSelectId: 'test-select', onOpenChange });
    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    trigger.focus();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  // ── 鼠标交互 ──

  it('点击选项触发 onChange 并关闭', async () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    renderSelect({ openSelectId: 'test-select', onChange, onOpenChange });

    const option = screen.getAllByRole('option')[1]!; // Option B
    await userEvent.click(option);

    expect(onChange).toHaveBeenCalledWith('b');
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  // ── 外部点击关闭 ──

  it('点击外部区域关闭菜单', () => {
    const onOpenChange = vi.fn();
    renderSelect({ openSelectId: 'test-select', onOpenChange });

    act(() => {
      fireEvent.mouseDown(document.body);
    });

    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  // ── 焦点恢复 ──

  it('关闭后焦点还给触发器', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ChatSelect
        id="test-select"
        label="Test Select"
        value="a"
        options={OPTIONS}
        onChange={vi.fn()}
        openSelectId="test-select"
        onOpenChange={onOpenChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    expect(trigger).toBeInTheDocument();

    // 关闭菜单
    rerender(
      <ChatSelect
        id="test-select"
        label="Test Select"
        value="a"
        options={OPTIONS}
        onChange={vi.fn()}
        openSelectId={null}
        onOpenChange={onOpenChange}
      />,
    );

    expect(document.activeElement).toBe(trigger);
  });

  // ── Disabled 状态 ──

  it('disabled 时点击不打开菜单', async () => {
    const onOpenChange = vi.fn();
    renderSelect({ disabled: true, onOpenChange });
    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    await userEvent.click(trigger);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('disabled 时键盘不打开菜单', () => {
    const onOpenChange = vi.fn();
    renderSelect({ disabled: true, onOpenChange });
    const trigger = screen.getByRole('combobox', { name: 'Test Select' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // ── 受控状态（多个实例共享 openSelectId） ──

  it('当 openSelectId 匹配时显示为打开', () => {
    const { rerender } = renderSelect({ openSelectId: 'test-select' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // 切换到另一个 id
    rerender(
      <ChatSelect
        id="test-select"
        label="Test Select"
        value="a"
        options={OPTIONS}
        onChange={vi.fn()}
        openSelectId="other-select"
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
