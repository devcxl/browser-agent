import type { PageSelection } from './types';

export class SelectionReader {
  getSelection(): PageSelection {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return { text: '' };

    const text = sel.toString();
    let html: string | undefined;

    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const container = document.createElement('div');
      container.appendChild(range.cloneContents());
      html = container.innerHTML;
    }

    return { text, html };
  }
}
