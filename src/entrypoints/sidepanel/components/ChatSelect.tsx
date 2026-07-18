import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils';

export interface ChatSelectOption {
  value: string;
  label: string;
}

export interface ChatSelectProps {
  id: string;
  label: string;
  value: string;
  options: ChatSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  openSelectId?: string | null;
  onOpenChange?: (id: string | null) => void;
  variant?: 'pill' | 'field';
}

/** 根据选项数量和预估行高估算菜单高度 */
function estimateMenuHeight(optionCount: number, rowHeight: number): number {
  return Math.min(optionCount * rowHeight + 8, 240);
}

export function ChatSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  openSelectId = null,
  onOpenChange,
  variant = 'pill',
}: ChatSelectProps) {
  const isOpen = openSelectId === id;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  // 打开时重置活动项到当前选中项
  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex((o) => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, value, options]);

  // 计算菜单位置
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estimatedHeight = estimateMenuHeight(options.length, variant === 'field' ? 36 : 32);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const flip = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const availableHeight = flip ? spaceAbove - 8 : spaceBelow - 8;
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 160),
      top: flip ? rect.top - Math.min(estimatedHeight, availableHeight) : rect.bottom,
      maxHeight: Math.min(availableHeight, 240),
    });
  }, [options.length, variant]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // 选择选项
  const select = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      onOpenChange?.(null);
    },
    [onChange, onOpenChange],
  );

  // 键盘处理
  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpenChange?.(id);
        return;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < options.length) {
          select(options[activeIndex]!.value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onOpenChange?.(null);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
    }
  }

  // 外部点击关闭
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current && !triggerRef.current.contains(target)) {
        if (listRef.current && !listRef.current.contains(target)) {
          onOpenChange?.(null);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onOpenChange]);

  // 关闭后焦点还给触发器
  useEffect(() => {
    if (!isOpen && triggerRef.current) {
      // 如果 focus 还在 document.body 的某处，还给 trigger
      if (document.activeElement === document.body || !document.activeElement) {
        triggerRef.current.focus();
      }
    }
  }, [isOpen]);

  // 滚动活动项到可见区域
  useEffect(() => {
    if (!isOpen || activeIndex < 0 || !listRef.current) return;
    const activeEl = listRef.current.querySelector(`#${id}-option-${activeIndex}`);
    if (activeEl && typeof (activeEl as HTMLElement).scrollIntoView === 'function') {
      (activeEl as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, activeIndex, id]);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className={cn('relative', variant === 'field' && 'w-full')}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `${id}-listbox` : undefined}
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
        }
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onOpenChange?.(isOpen ? null : id);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex cursor-pointer items-center text-left focus:outline-none',
          variant === 'field'
            ? 'w-full justify-between gap-2 rounded-lg border border-hairline bg-surface-card px-3 py-2 text-sm text-ink shadow-sm transition-colors hover:border-hairline-strong focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15'
            : 'max-w-[200px] gap-1 rounded-full border-none bg-surface-soft px-2.5 py-1 text-xs font-medium text-body hover:text-ink',
          disabled && 'opacity-40 cursor-not-allowed',
        )}
      >
        <span className="truncate">{selectedOption?.label || value || label}</span>
        {variant === 'field' ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="size-4 shrink-0 text-mute"
          >
            <path
              d="m6 8 4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <span className="shrink-0 text-mute" aria-hidden="true">
            ▼
          </span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <ul
            ref={listRef}
            id={`${id}-listbox`}
            role="listbox"
            aria-label={label}
            style={menuStyle}
            className={cn(
              'z-50 overflow-y-auto',
              'bg-surface-card border border-hairline rounded-lg shadow-lg',
              'py-1',
            )}
          >
            {options.map((opt, i) => (
              <li
                key={opt.value}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={opt.value === value}
                className={cn(
                  'cursor-pointer truncate px-3 select-none',
                  variant === 'field' ? 'py-2 text-sm' : 'py-1.5 text-xs',
                  'hover:bg-accent-soft',
                  i === activeIndex && 'bg-accent-soft',
                  opt.value === value && 'font-semibold text-ink',
                  opt.value !== value && 'text-body',
                )}
                onClick={() => select(opt.value)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {opt.label}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
