import React from 'react';
import { cn } from '../utils';
import { ChatSelect, type ChatSelectOption } from './ChatSelect';

const CONTROL_BASE = [
  'w-full border border-hairline bg-surface-card text-ink shadow-sm transition-colors',
  'placeholder:text-mute hover:border-hairline-strong',
  'focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/15',
  'disabled:cursor-not-allowed disabled:bg-surface-soft disabled:text-mute disabled:opacity-70',
].join(' ');

interface SettingsInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  compact?: boolean;
  containerClassName?: string;
}

export function SettingsInput({
  compact = false,
  containerClassName,
  className,
  type,
  ...props
}: SettingsInputProps) {
  if (type === 'number') {
    return (
      <SettingsNumberInput
        {...props}
        type="number"
        compact={compact}
        containerClassName={containerClassName}
        className={className}
      />
    );
  }

  return (
    <input
      {...props}
      type={type}
      className={cn(
        CONTROL_BASE,
        compact ? 'rounded-lg px-2.5 py-1.5 text-xs' : 'rounded-lg px-3 py-2 text-sm',
        className,
      )}
    />
  );
}

function SettingsNumberInput({
  compact = false,
  containerClassName,
  className,
  disabled,
  readOnly,
  ...props
}: SettingsInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const controlsDisabled = disabled || readOnly;

  const stepValue = (direction: 1 | -1) => {
    const input = inputRef.current;
    if (!input || controlsDisabled || input.step === 'any') return;
    input.focus({ preventScroll: true });
    direction === 1 ? input.stepUp() : input.stepDown();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  return (
    <span className={cn('relative block', containerClassName)}>
      <input
        {...props}
        ref={inputRef}
        type="number"
        disabled={disabled}
        readOnly={readOnly}
        className={cn(
          CONTROL_BASE,
          compact ? 'rounded-lg py-1.5 pl-2.5 pr-8 text-xs' : 'rounded-lg py-2 pl-3 pr-9 text-sm',
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          className,
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-px right-px flex w-7 flex-col overflow-hidden rounded-r-[7px] border-l border-hairline bg-surface-soft',
          controlsDisabled && 'pointer-events-none opacity-40',
        )}
      >
        <span
          data-number-step="up"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => stepValue(1)}
          className="flex flex-1 cursor-pointer items-center justify-center border-b border-hairline text-mute transition-colors hover:bg-accent-soft hover:text-primary"
        >
          <svg aria-hidden="true" viewBox="0 0 12 8" fill="none" className="h-2 w-3">
            <path
              d="m2 6 4-4 4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span
          data-number-step="down"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => stepValue(-1)}
          className="flex flex-1 cursor-pointer items-center justify-center text-mute transition-colors hover:bg-accent-soft hover:text-primary"
        >
          <svg aria-hidden="true" viewBox="0 0 12 8" fill="none" className="h-2 w-3">
            <path
              d="m2 2 4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    </span>
  );
}

export function SettingsTextarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={cn(CONTROL_BASE, 'rounded-lg px-3 py-2 text-sm', className)} />
  );
}

interface SettingsSelectProps {
  id: string;
  label: string;
  value: string;
  options: ChatSelectOption[];
  onChange: (value: string) => void;
  openSelectId: string | null;
  onOpenChange: (id: string | null) => void;
  disabled?: boolean;
  className?: string;
}

export function SettingsSelect({
  id,
  label,
  value,
  options,
  onChange,
  openSelectId,
  onOpenChange,
  disabled,
  className,
}: SettingsSelectProps) {
  return (
    <div className={className}>
      <ChatSelect
        id={id}
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        disabled={disabled}
        openSelectId={openSelectId}
        onOpenChange={onOpenChange}
        variant="field"
      />
    </div>
  );
}

export function SettingsCheckbox({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className={cn('relative inline-flex size-4 shrink-0 align-middle', className)}>
      <input
        {...props}
        type="checkbox"
        className={cn(
          'peer size-4 appearance-none rounded-[5px] border border-hairline-strong bg-surface-card shadow-sm transition-colors',
          'hover:border-primary/70 checked:border-primary checked:bg-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        className="pointer-events-none absolute inset-0 size-4 text-on-primary opacity-0 transition-opacity peer-checked:opacity-100"
      >
        <path
          d="m4 8 2.5 2.5L12 5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function SettingsRadio({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className={cn('relative inline-flex size-4 shrink-0 align-middle', className)}>
      <input
        {...props}
        type="radio"
        className={cn(
          'peer size-4 appearance-none rounded-full border border-hairline-strong bg-surface-card shadow-sm transition-colors',
          'hover:border-primary/70 checked:border-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      />
      <span className="pointer-events-none absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity peer-checked:opacity-100" />
    </span>
  );
}

interface SettingsSwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked: boolean;
}

export function SettingsSwitch({
  checked,
  className,
  type = 'button',
  ...props
}: SettingsSwitchProps) {
  return (
    <button
      {...props}
      type={type}
      role="switch"
      aria-checked={checked}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'border-primary bg-primary'
          : 'border-hairline-strong bg-surface-soft hover:border-primary/60',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-3.5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[19px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}
