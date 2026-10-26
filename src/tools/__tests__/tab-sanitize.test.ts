import { describe, it, expect } from 'vitest';
import { sanitizeTab, sanitizeTabs, sanitizeWindow, sanitizeWindows } from '../tab-sanitize';

const fullTab = {
  id: 1,
  index: 0,
  windowId: 9,
  groupId: -1,
  title: '示例页',
  url: 'https://example.com',
  active: true,
  pinned: false,
  audible: false,
  mutedInfo: { muted: false },
  status: 'complete',
  incognito: false,
  discarded: false,
  favIconUrl: 'data:image/svg+xml;base64,' + 'A'.repeat(2000),
  openerTabId: 42,
  width: 1280,
  height: 720,
};

describe('sanitizeTab', () => {
  it('剔除 favIconUrl / openerTabId / width / height，保留操作字段', () => {
    const result = sanitizeTab(fullTab);

    expect(result).not.toHaveProperty('favIconUrl');
    expect(result).not.toHaveProperty('openerTabId');
    expect(result).not.toHaveProperty('width');
    expect(result).not.toHaveProperty('height');
    expect(result).toEqual(expect.objectContaining({
      id: 1,
      title: '示例页',
      url: 'https://example.com',
      active: true,
      pinned: false,
      status: 'complete',
      mutedInfo: { muted: false },
    }));
  });

  it('结果体积显著缩小（图标是上下文消耗大头）', () => {
    const result = sanitizeTab(fullTab);
    expect(JSON.stringify(result).length).toBeLessThan(JSON.stringify(fullTab).length / 2);
  });
});

describe('sanitizeTabs', () => {
  it('批量裁剪，null/undefined 返回空数组', () => {
    expect(sanitizeTabs([fullTab, { ...fullTab, id: 2 }])).toHaveLength(2);
    expect(sanitizeTabs(undefined)).toEqual([]);
    expect(sanitizeTabs(null)).toEqual([]);
  });
});

describe('sanitizeWindow', () => {
  it('裁剪窗口内嵌 tabs，保留窗口自身字段', () => {
    const win = { id: 9, focused: true, incognito: false, alwaysOnTop: false, tabs: [fullTab] };
    const result = sanitizeWindow(win);

    expect(result.id).toBe(9);
    expect(result.focused).toBe(true);
    expect(result.tabs![0]).not.toHaveProperty('favIconUrl');
  });

  it('无 tabs 字段时原样返回', () => {
    const win = { id: 9, focused: true };
    expect(sanitizeWindow(win)).toBe(win);
  });

  it('sanitizeWindows 批量裁剪', () => {
    const result = sanitizeWindows([{ tabs: [fullTab] }, { id: 2 }]);
    expect(result).toHaveLength(2);
    expect(result[0].tabs![0]).not.toHaveProperty('favIconUrl');
  });
});
