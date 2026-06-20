import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionReader } from '../selection-reader';

describe('SelectionReader', () => {
  let reader: SelectionReader;

  beforeEach(() => {
    reader = new SelectionReader();
    // 清除选中
    window.getSelection()?.removeAllRanges();
  });

  it('should return text and html when text is selected', () => {
    // 设置选中文本
    const div = document.createElement('div');
    div.innerHTML = 'Selected <b>text</b> content';
    document.body.appendChild(div);

    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const result = reader.getSelection();

    expect(result.text).toBe('Selected text content');
    expect(result.html).toBeDefined();
    expect(result.html).toContain('Selected');
    expect(result.html).toContain('<b>text</b>');

    document.body.removeChild(div);
  });

  it('should return empty text when nothing is selected', () => {
    const result = reader.getSelection();

    expect(result.text).toBe('');
    expect(result.html).toBeUndefined();
  });
});
