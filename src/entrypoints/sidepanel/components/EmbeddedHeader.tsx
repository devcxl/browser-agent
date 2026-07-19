import React from 'react';

interface EmbeddedHeaderProps {
  onClose?: () => void;
}

/**
 * 内嵌模式头部条。
 * 当 sidepanel 通过 iframe 嵌入外部页面时，提供扩展名标识和关闭按钮。
 * 关闭按钮通过 postMessage 通知父页面 content script。
 */
export function EmbeddedHeader({ onClose }: EmbeddedHeaderProps) {
  return (
    <header
      data-testid="embedded-header"
      className="sticky top-0 z-50 h-10 border-b border-hairline bg-canvas flex items-center justify-between px-3 shrink-0"
    >
      <span className="text-[13px] font-semibold text-ink tracking-wide">
        Browser Agent
      </span>
      <button
        type="button"
        data-testid="embedded-close-button"
        onClick={onClose}
        aria-label="关闭"
        className="w-7 h-7 flex items-center justify-center rounded-md text-mute hover:text-ink hover:bg-surface-soft transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </header>
  );
}
