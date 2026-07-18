import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SettingsCheckbox,
  SettingsInput,
  SettingsRadio,
  SettingsSelect,
  SettingsSwitch,
  SettingsTextarea,
} from '../components/SettingsControls';

describe('SettingsControls', () => {
  it('文本控件使用统一的表面、圆角和焦点样式', () => {
    render(
      <>
        <SettingsInput aria-label="input" />
        <SettingsTextarea aria-label="textarea" />
        <SettingsSelect
          id="select"
          label="select"
          value="one"
          options={[{ value: 'one', label: 'One' }]}
          onChange={vi.fn()}
          openSelectId={null}
          onOpenChange={vi.fn()}
        />
      </>,
    );

    for (const control of [
      screen.getByRole('textbox', { name: 'input' }),
      screen.getByRole('textbox', { name: 'textarea' }),
      screen.getByRole('combobox', { name: 'select' }),
    ]) {
      expect(control.className).toContain('bg-surface-card');
      expect(control.className).toContain('rounded-lg');
      expect(control.className).toContain('focus-visible:ring-2');
    }
  });

  it('设置下拉使用自定义菜单并返回选中值', () => {
    const onChange = vi.fn();
    function Select() {
      const [openSelectId, setOpenSelectId] = React.useState<string | null>(null);
      return (
        <SettingsSelect
          id="settings-select"
          label="settings select"
          value="one"
          options={[
            { value: 'one', label: 'One' },
            { value: 'two', label: 'Two' },
          ]}
          onChange={onChange}
          openSelectId={openSelectId}
          onOpenChange={setOpenSelectId}
        />
      );
    }

    render(<Select />);

    fireEvent.click(screen.getByRole('combobox', { name: 'settings select' }));
    fireEvent.click(screen.getByRole('option', { name: 'Two' }));

    expect(onChange).toHaveBeenCalledWith('two');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('选择控件保留原生语义和事件', () => {
    const onCheckboxChange = vi.fn();
    const onRadioChange = vi.fn();
    const onSwitchClick = vi.fn();

    render(
      <>
        <SettingsCheckbox aria-label="checkbox" onChange={onCheckboxChange} />
        <SettingsRadio aria-label="radio" name="choice" onChange={onRadioChange} />
        <SettingsSwitch aria-label="switch" checked={false} onClick={onSwitchClick} />
      </>,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'checkbox' });
    const radio = screen.getByRole('radio', { name: 'radio' });
    const settingsSwitch = screen.getByRole('switch', { name: 'switch' });

    expect(checkbox.className).toContain('appearance-none');
    expect(radio.className).toContain('appearance-none');
    expect(settingsSwitch.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(checkbox);
    fireEvent.click(radio);
    fireEvent.click(settingsSwitch);

    expect(onCheckboxChange).toHaveBeenCalledOnce();
    expect(onRadioChange).toHaveBeenCalledOnce();
    expect(onSwitchClick).toHaveBeenCalledOnce();
  });

  it('数字输入使用自定义按钮并遵守 step', () => {
    function NumberInput() {
      const [value, setValue] = React.useState(2);
      return (
        <SettingsInput
          aria-label="number"
          type="number"
          value={value}
          min={1}
          max={3}
          step={0.5}
          onChange={(event) => setValue(Number(event.target.value))}
        />
      );
    }

    render(<NumberInput />);
    const input = screen.getByRole('spinbutton', { name: 'number' }) as HTMLInputElement;
    const stepUp = document.querySelector<HTMLElement>('[data-number-step="up"]')!;
    const stepDown = document.querySelector<HTMLElement>('[data-number-step="down"]')!;

    expect(input.className).toContain('[appearance:textfield]');
    fireEvent.click(stepUp);
    expect(input.value).toBe('2.5');
    fireEvent.click(stepDown);
    expect(input.value).toBe('2');
  });
});
