export function simulateClick(params: Record<string, unknown>): { success: boolean; element?: string } {
  const selector = params.selector as string | undefined;
  const xpath = params.xpath as string | undefined;
  const text = params.text as string | undefined;

  let el: Element | null = null;

  if (selector) {
    el = document.querySelector(selector);
  } else if (xpath) {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    el = result.singleNodeValue as Element | null;
  } else if (text) {
    const allElements = document.querySelectorAll(
      'button, a, input, [role="button"], [role="link"], span, li, label',
    );
    for (const elem of allElements) {
      if (elem.textContent?.trim() === text) {
        el = elem;
        break;
      }
    }
  }

  if (!el) {
    const hint = selector ? `选择器 "${selector}"` : xpath ? `XPath "${xpath}"` : `文本 "${text}"`;
    return { success: false, element: `未找到元素: ${hint}` };
  }

  el.scrollIntoView({ behavior: 'instant', block: 'center' });
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = Array.from(el.classList).slice(0, 2).join('.');
  const label = [tag, id, cls].filter(Boolean).join('.');

  return { success: true, element: label };
}
