import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useI18n } from '../i18n/useI18n';
import { translate, getLocale, toMessageName } from '@/shared/i18n';
import { createI18nMock, zhMessages, enMessages } from '@/test/i18n-mock';

beforeEach(() => {
  vi.stubGlobal('browser', { i18n: createI18nMock() });
});

// ── 双语言包完整性 ────────────────────────────────────

describe('_locales messages.json', () => {
  it('zh_CN 与 en 的 message key 完全一致', () => {
    expect(Object.keys(zhMessages).sort()).toEqual(Object.keys(enMessages).sort());
  });

  it('key 仅含 Chrome 允许的字符（字母/数字/下划线）', () => {
    for (const key of Object.keys(zhMessages)) {
      expect(key).toMatch(/^[a-zA-Z0-9_]+$/);
    }
  });

  it('所有文案均为非空字符串', () => {
    for (const msg of Object.values(zhMessages)) {
      expect(typeof msg).toBe('string');
      expect(msg.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── translate ────────────────────────────────────────

describe('translate', () => {
  it('将点号 key 映射为下划线 message name 并返回文案', () => {
    expect(translate('common.send')).toBe('发送');
    expect(translate('settings.skills.syncComplete', { count: 3 })).toBe('同步完成，共 3 个技能');
  });

  it('toMessageName 只替换点号', () => {
    expect(toMessageName('settings.tabs.appearance')).toBe('settings_tabs_appearance');
  });

  it('插值替换 {var} 占位符', () => {
    expect(translate('voice.startFailed', { message: 'boom' })).toBe('无法启动录音: boom');
  });

  it('缺失 key 时返回 key 本身并告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(translate('no.such.key')).toBe('no.such.key');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('缺失插值变量时保留占位符并告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(translate('voice.startFailed', {})).toBe('无法启动录音: {message}');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('browser.i18n 不可用时降级返回 key', () => {
    vi.stubGlobal('browser', {});
    expect(translate('common.send')).toBe('common.send');
  });
});

// ── getLocale ────────────────────────────────────────

describe('getLocale', () => {
  it('zh 系 UI 语言归一化为 zh-CN', () => {
    vi.stubGlobal('browser', { i18n: createI18nMock('zh-CN') });
    expect(getLocale()).toBe('zh-CN');
  });

  it('en 系 UI 语言归一化为 en', () => {
    vi.stubGlobal('browser', { i18n: createI18nMock('en-US') });
    expect(getLocale()).toBe('en');
  });

  it('getUILanguage 异常时回退 en', () => {
    vi.stubGlobal('browser', {});
    expect(getLocale()).toBe('en');
  });
});

// ── useI18n（React 接入点） ───────────────────────────

describe('useI18n', () => {
  function Probe() {
    const { t, locale } = useI18n();
    return (
      <div>
        <span data-testid="locale">{locale}</span>
        <span data-testid="msg">{t('common.confirm')}</span>
      </div>
    );
  }

  it('提供 t 与 locale，无需 Provider 包裹', () => {
    render(<Probe />);
    expect(screen.getByTestId('locale')).toHaveTextContent('zh-CN');
    expect(screen.getByTestId('msg')).toHaveTextContent('确认');
  });
});
