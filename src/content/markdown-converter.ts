import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { strikethrough, tables } from 'turndown-plugin-gfm';

export interface MarkdownResult {
  title: string;
  url: string;
  clipped: string;
  imageCount: number;
  markdown: string;
}

const DEFAULT_TAGS = ['web_clip'];
const SOURCE_TYPE = 'web_clip';
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const SAFE_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);

const turndown = new TurndownService({
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
});

turndown.use([tables, strikethrough]);

turndown.addRule('articleHeadings', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement(content, node) {
    const element = node as HTMLElement;
    const originalLevel = Number(
      element.getAttribute('data-web2markdown-heading-level') || node.nodeName.slice(1),
    );
    const level = Math.min(originalLevel + 1, 6);
    const headingText = content.replace(/\*\*([^\n]+?)\*\*/g, '$1').trim();
    if (!headingText) return '';
    return `\n\n${'#'.repeat(level)} ${headingText}\n\n`;
  },
});

turndown.addRule('preCodeBlock', {
  filter(node) {
    const firstChild = node.firstChild as HTMLElement | null;
    return (
      node.nodeName === 'PRE' &&
      firstChild?.nodeName === 'CODE' &&
      !firstChild.className &&
      !!(node as HTMLElement).className
    );
  },
  replacement(_content, node) {
    const pre = node as HTMLElement;
    const language = (pre.className.match(/language-(\S+)/) || [])[1] || '';
    const code = pre.textContent || '';
    return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
  },
});

turndown.addRule('figcaption', {
  filter: 'figcaption',
  replacement(content) {
    const text = content.trim();
    return text ? `\n\n*${text}*\n\n` : '';
  },
});

turndown.addRule('kbd', {
  filter: 'kbd',
  replacement(content) {
    return `\`${content}\``;
  },
});

turndown.addRule('mark', {
  filter: 'mark',
  replacement(content) {
    const text = content.trim();
    return text ? `==${text}==` : '';
  },
});

export function convertToMarkdown(document: Document, clippedAt = new Date()): MarkdownResult {
  const cloned = document.cloneNode(true) as Document;
  markOriginalHeadingLevels(cloned);
  preserveCodeLanguages(cloned);

  const article = new Readability(cloned).parse();
  if (!article?.content) {
    throw new Error('无法提取正文');
  }

  const title = article.title || document.title || 'Untitled';
  const articleDocument = document.implementation.createHTMLDocument(title);
  articleDocument.body.insertAdjacentHTML('afterbegin', article.content);

  normalizeResourceUrls(articleDocument, document.location.href);
  normalizeTables(articleDocument);
  restoreCodeLanguages(articleDocument);

  const bodyMarkdown = htmlToMarkdown(articleDocument.body.innerHTML);
  const imageCount = articleDocument.querySelectorAll('img[src]').length;
  const clipped = formatDate(clippedAt);
  const frontmatter = buildFrontmatter({ title, url: document.location.href, clipped, imageCount });

  return {
    title,
    url: document.location.href,
    clipped,
    imageCount,
    markdown: `${frontmatter}\n\n# ${formatMarkdownTitle(title)}\n\n${bodyMarkdown}`.trimEnd(),
  };
}

function markOriginalHeadingLevels(document: Document) {
  document.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    heading.dataset.web2markdownHeadingLevel = heading.tagName.slice(1);
  });
}

function preserveCodeLanguages(document: Document) {
  document.querySelectorAll<HTMLElement>('pre[class*="language-"]').forEach((pre) => {
    const code = pre.querySelector('code');
    const lang = (pre.className.match(/language-(\S+)/) || [])[1];
    if (code && lang) {
      code.dataset.web2markdownCodeLang = lang;
    }
  });
  document.querySelectorAll<HTMLElement>('pre code[class*="language-"]').forEach((code) => {
    const lang = (code.className.match(/language-(\S+)/) || [])[1];
    if (lang) {
      code.dataset.web2markdownCodeLang = lang;
    }
  });
}

function normalizeResourceUrls(document: Document, baseUrl: string) {
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const href = toSafeAbsoluteUrl(link.getAttribute('href'), baseUrl, SAFE_LINK_PROTOCOLS);
    if (href) {
      link.href = href;
    } else {
      link.removeAttribute('href');
    }
  });
  document.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
    const src = toSafeAbsoluteUrl(image.getAttribute('src'), baseUrl, SAFE_IMAGE_PROTOCOLS);
    if (src) {
      image.src = src;
    } else {
      image.remove();
    }
  });
}

function normalizeTables(document: Document) {
  document.querySelectorAll('table').forEach((table) => {
    if (table.querySelector('thead')) return;
    const firstRow = table.querySelector('tr');
    if (!firstRow) return;
    const cells = firstRow.querySelectorAll('td, th');
    if (cells.length === 0) return;

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    cells.forEach((cell) => {
      const th = document.createElement('th');
      th.insertAdjacentHTML('afterbegin', cell.innerHTML);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const parent = firstRow.parentElement;
    if (parent) parent.removeChild(firstRow);
    table.insertBefore(thead, table.firstChild);
  });
}

function restoreCodeLanguages(document: Document) {
  document.querySelectorAll<HTMLElement>('[data-web2markdown-code-lang]').forEach((el) => {
    const lang = el.dataset.web2markdownCodeLang;
    if (lang) el.className = `language-${lang}`;
    delete el.dataset.web2markdownCodeLang;
  });
}

function toSafeAbsoluteUrl(
  value: string | null,
  baseUrl: string,
  allowedProtocols: Set<string>,
): string {
  if (!value) return '';
  try {
    const url = new URL(value, baseUrl);
    return allowedProtocols.has(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function buildFrontmatter({
  title,
  url,
  clipped,
  imageCount,
}: {
  title: string;
  url: string;
  clipped: string;
  imageCount: number;
}): string {
  return [
    '---',
    `title: "${escapeYamlString(title)}"`,
    `url: "${escapeYamlString(url)}"`,
    `clipped: "${clipped}"`,
    `tags: [${DEFAULT_TAGS.map((tag) => `"${escapeYamlString(tag)}"`).join(', ')}]`,
    `source_type: ${SOURCE_TYPE}`,
    `images: ${imageCount}`,
    '---',
  ].join('\n');
}

function escapeYamlString(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
    .replaceAll('\u0085', '\\x85')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function htmlToMarkdown(html: string): string {
  const md = turndown.turndown(html).trim();
  return md.replace(/\n{3,}/g, '\n\n');
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatMarkdownTitle(title: string): string {
  return title.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}
