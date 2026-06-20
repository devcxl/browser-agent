import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { convertToMarkdown } from '../markdown-converter';

function createDocument(html: string, url = 'https://example.com/test'): Document {
  return new JSDOM(html, { url }).window.document;
}

describe('convertToMarkdown', () => {
  it('exports article markdown with frontmatter', () => {
    const document = createDocument(`
      <!doctype html>
      <html>
        <head><title>Test Article</title></head>
        <body>
          <article>
            <h1>Test Article</h1>
            <p>Hello <a href="/about">world</a>.</p>
            <img src="/img.png" alt="diagram" />
          </article>
        </body>
      </html>
    `);

    const result = convertToMarkdown(document, new Date('2026-06-21T12:00:00Z'));

    expect(result.markdown).toContain('title: "Test Article"');
    expect(result.markdown).toContain('url: "https://example.com/test"');
    expect(result.markdown).toContain('clipped: "2026-06-21"');
    expect(result.markdown).toContain('tags: ["web_clip"]');
    expect(result.markdown).toContain('source_type: web_clip');
    expect(result.markdown).toContain('images: 1');
    expect(result.markdown).toContain('# Test Article');
    expect(result.markdown).toContain('[world](https://example.com/about)');
    expect(result.markdown).toContain('![diagram](https://example.com/img.png)');
  });

  it('throws when Readability cannot extract content', () => {
    const document = createDocument(
      '<!doctype html><html><body><button>Only UI</button></body></html>',
    );
    expect(() => convertToMarkdown(document)).toThrow('无法提取正文');
  });

  it('escapes frontmatter YAML special characters', () => {
    const document = createDocument(`
      <!doctype html>
      <html>
        <head><title>Safe "title"
malicious: true</title></head>
        <body>
          <article>
            <h1>Safe "title"
malicious: true</h1>
            <p>Hello.</p>
          </article>
        </body>
      </html>
    `);

    const result = convertToMarkdown(document, new Date('2026-06-21T12:00:00Z'));

    expect(result.markdown).toContain('title: "Safe \\"title\\" malicious: true"');
    expect(result.markdown).toContain('# Safe "title" malicious: true');
  });

  it('removes unsafe link and image protocols', () => {
    const document = createDocument(`
      <!doctype html>
      <html>
        <head><title>Unsafe URLs</title></head>
        <body>
          <article>
            <h1>Unsafe URLs</h1>
            <p><a href="javascript:alert(1)">bad link</a></p>
            <img src="data:image/svg+xml,<svg></svg>" alt="bad image" />
            <img src="https://example.com/safe.png" alt="safe image" />
          </article>
        </body>
      </html>
    `);

    const result = convertToMarkdown(document, new Date('2026-06-21T12:00:00Z'));

    expect(result.imageCount).toBe(1);
    expect(result.markdown).toContain('bad link');
    expect(result.markdown).not.toContain('javascript:alert');
    expect(result.markdown).not.toContain('data:image');
    expect(result.markdown).toContain('![safe image](https://example.com/safe.png)');
    expect(result.markdown).toContain('images: 1');
  });

  it('demotes article headings and removes bold markers', () => {
    const document = createDocument(`
      <!doctype html>
      <html>
        <head><title>Heading Rules</title></head>
        <body>
          <article>
            <h1><strong>Main Section</strong></h1>
            <h2><strong>Nested Section</strong></h2>
            <p>Body.</p>
          </article>
        </body>
      </html>
    `);

    const result = convertToMarkdown(document, new Date('2026-06-21T12:00:00Z'));

    expect(result.markdown).toContain('\n## Main Section\n');
    expect(result.markdown).toContain('\n### Nested Section\n');
    expect(result.markdown).not.toContain('## **');
    expect(result.markdown).not.toContain('### **');
  });

  it('converts tables with thead to markdown tables', () => {
    const document = createDocument(`
      <!doctype html>
      <html>
        <head><title>Table</title></head>
        <body>
          <article>
            <h1>Table</h1>
            <table>
              <thead>
                <tr><th>Name</th><th>Score</th></tr>
              </thead>
              <tbody>
                <tr><td>Alice</td><td>95</td></tr>
              </tbody>
            </table>
          </article>
        </body>
      </html>
    `);

    const result = convertToMarkdown(document, new Date('2026-06-21T12:00:00Z'));

    expect(result.markdown).toContain('| Name | Score |');
    expect(result.markdown).toContain('| --- | --- |');
    expect(result.markdown).toContain('| Alice | 95 |');
  });

  it('converts tables without thead to markdown tables', () => {
    const document = createDocument(`
      <!doctype html>
      <html>
        <head><title>No Thead</title></head>
        <body>
          <article>
            <h1>No Thead</h1>
            <table>
              <tbody>
                <tr><td>a</td><td>b</td></tr>
                <tr><td>1</td><td>2</td></tr>
              </tbody>
            </table>
          </article>
        </body>
      </html>
    `);

    const result = convertToMarkdown(document, new Date('2026-06-21T12:00:00Z'));

    expect(result.markdown).toContain('| a | b |');
    expect(result.markdown).toContain('| --- | --- |');
    expect(result.markdown).toContain('| 1 | 2 |');
  });

  it('converts strikethrough text', () => {
    const document = createDocument(`
      <!doctype html>
      <html>
        <head><title>Strikethrough</title></head>
        <body>
          <article>
            <h1>Strikethrough</h1>
            <p>This is <del>deleted</del> and <s>struck</s> text.</p>
          </article>
        </body>
      </html>
    `);

    const result = convertToMarkdown(document, new Date('2026-06-21T12:00:00Z'));

    expect(result.markdown).toContain('~deleted~');
    expect(result.markdown).toContain('~struck~');
  });

  it('preserves code block language', () => {
    const document = createDocument(`
      <!doctype html>
      <html>
        <head><title>Code</title></head>
        <body>
          <article>
            <h1>Code</h1>
            <pre class="language-python"><code>print("hello")</code></pre>
            <pre><code class="language-javascript">const x = 1;</code></pre>
          </article>
        </body>
      </html>
    `);

    const result = convertToMarkdown(document, new Date('2026-06-21T12:00:00Z'));

    expect(result.markdown).toContain('```python');
    expect(result.markdown).toContain('```javascript');
  });

  it('compresses excessive blank lines', () => {
    const document = createDocument(`
      <!doctype html>
      <html>
        <head><title>Spacing</title></head>
        <body>
          <article>
            <h1>Spacing</h1>
            <p>First.</p>
            <p></p>
            <p></p>
            <p></p>
            <p>Last.</p>
          </article>
        </body>
      </html>
    `);

    const result = convertToMarkdown(document, new Date('2026-06-21T12:00:00Z'));

    expect(result.markdown).not.toMatch(/\n{4,}/);
  });

  it('converts figcaption to italic', () => {
    const document = createDocument(`
      <!doctype html>
      <html>
        <head><title>Figure</title></head>
        <body>
          <article>
            <h1>Figure</h1>
            <figure>
              <img src="/diagram.png" alt="Architecture" />
              <figcaption>The architecture</figcaption>
            </figure>
          </article>
        </body>
      </html>
    `);

    const result = convertToMarkdown(document, new Date('2026-06-21T12:00:00Z'));

    expect(result.markdown).toContain('*The architecture*');
  });

  it('converts kbd elements to inline code', () => {
    const document = createDocument(`
      <!doctype html>
      <html>
        <head><title>Kbd</title></head>
        <body>
          <article>
            <h1>Kbd</h1>
            <p>Press <kbd>Ctrl</kbd> + <kbd>C</kbd> to copy.</p>
          </article>
        </body>
      </html>
    `);

    const result = convertToMarkdown(document, new Date('2026-06-21T12:00:00Z'));

    expect(result.markdown).toContain('`Ctrl`');
    expect(result.markdown).toContain('`C`');
  });

  it('converts mark elements to highlighted text', () => {
    const document = createDocument(`
      <!doctype html>
      <html>
        <head><title>Mark</title></head>
        <body>
          <article>
            <h1>Mark</h1>
            <p>This is <mark>important</mark>.</p>
          </article>
        </body>
      </html>
    `);

    const result = convertToMarkdown(document, new Date('2026-06-21T12:00:00Z'));

    expect(result.markdown).toContain('==important==');
  });
});
