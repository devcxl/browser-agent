import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { simulateClick } from '../simulate-click';

describe('simulateClick', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // jsdom 未实现 scrollIntoView，用 spy 观察调用即可
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clicks element found by selector and returns its label', () => {
    document.body.innerHTML = `
      <button id="save-btn" class="primary big">Save</button>
    `;
    const button = document.querySelector('#save-btn') as HTMLButtonElement;
    const mouseover = vi.fn();
    const mousedown = vi.fn();
    const mouseup = vi.fn();
    const click = vi.fn();
    button.addEventListener('mouseover', mouseover);
    button.addEventListener('mousedown', mousedown);
    button.addEventListener('mouseup', mouseup);
    button.addEventListener('click', click);

    const result = simulateClick({ selector: '#save-btn' });

    expect(result.success).toBe(true);
    expect(result.element).toBe('button.#save-btn.primary.big');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'center',
    });
    expect(mouseover).toHaveBeenCalledTimes(1);
    expect(mousedown).toHaveBeenCalledTimes(1);
    expect(mouseup).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('clicks element found by xpath', () => {
    document.body.innerHTML = `
      <div class="menu"><a href="#">Settings</a></div>
    `;
    const anchor = document.querySelector('a') as HTMLAnchorElement;
    const click = vi.fn();
    anchor.addEventListener('click', click);

    const result = simulateClick({ xpath: '//a[contains(text(), "Settings")]' });

    expect(result.success).toBe(true);
    expect(result.element).toBe('a');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('clicks element matched by exact text among clickable candidates', () => {
    document.body.innerHTML = `
      <button>Cancel</button>
      <button class="danger">Delete</button>
      <span>Delete all</span>
    `;
    const buttons = document.querySelectorAll('button');
    const click = vi.fn();
    buttons[1]!.addEventListener('click', click);

    const result = simulateClick({ text: 'Delete' });

    expect(result.success).toBe(true);
    expect(result.element).toBe('button.danger');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('returns failure with selector hint when selector not found', () => {
    const result = simulateClick({ selector: '#nope' });

    expect(result.success).toBe(false);
    expect(result.element).toBe('未找到元素: 选择器 "#nope"');
  });

  it('returns failure with xpath hint when xpath not found', () => {
    const result = simulateClick({ xpath: '//missing' });

    expect(result.success).toBe(false);
    expect(result.element).toBe('未找到元素: XPath "//missing"');
  });

  it('returns failure with text hint when text not matched', () => {
    document.body.innerHTML = '<button>Cancel</button>';
    const result = simulateClick({ text: 'Non-existent' });

    expect(result.success).toBe(false);
    expect(result.element).toBe('未找到元素: 文本 "Non-existent"');
  });

  it('returns failure hint with xpath when multiple params given but none matches', () => {
    const result = simulateClick({ selector: '', xpath: '//gone', text: 'x' });

    expect(result.success).toBe(false);
    expect(result.element).toBe('未找到元素: XPath "//gone"');
  });

  it('returns element label for element with id and no classes', () => {
    document.body.innerHTML = '<div id="modal">content</div>';

    const result = simulateClick({ selector: '#modal' });

    expect(result.success).toBe(true);
    expect(result.element).toBe('div.#modal');
  });

  it('returns element label for element without id or classes', () => {
    document.body.innerHTML = '<li>List item</li>';
    const li = document.querySelector('li') as HTMLLIElement;

    const result = simulateClick({ text: 'List item' });

    expect(result.success).toBe(true);
    expect(li.tagName.toLowerCase()).toBe('li');
    expect(result.element).toBe('li');
  });
});
