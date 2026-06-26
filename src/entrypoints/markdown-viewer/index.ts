import { marked } from 'marked';

const STYLE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #f5f5f5;
    font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
    color: #4e4e4e;
    font-size: 16px;
    line-height: 1.5;
    letter-spacing: 0.16px;
    -webkit-font-smoothing: antialiased;
  }

  .container {
    max-width: 800px;
    margin: 48px auto;
    background: #ffffff;
    border-radius: 16px;
    padding: 48px 56px;
    border: 1px solid #e7e5e4;
  }

  h1 {
    font-family: 'EB Garamond', 'Times New Roman', serif;
    font-size: 40px;
    font-weight: 400;
    line-height: 1.15;
    letter-spacing: -0.4px;
    color: #0c0a09;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid #e7e5e4;
  }

  h2 {
    font-family: 'Inter', sans-serif;
    font-size: 22px;
    font-weight: 500;
    line-height: 1.35;
    color: #0c0a09;
    margin-top: 36px;
    margin-bottom: 12px;
  }

  h3 {
    font-family: 'Inter', sans-serif;
    font-size: 18px;
    font-weight: 500;
    line-height: 1.44;
    letter-spacing: 0.18px;
    color: #0c0a09;
    margin-top: 28px;
    margin-bottom: 8px;
  }

  p { margin-bottom: 16px; }

  a {
    color: #292524;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  a:hover { color: #0c0a09; }

  ul, ol { margin-bottom: 16px; padding-left: 24px; }
  li { margin-bottom: 4px; }

  blockquote {
    margin: 20px 0;
    padding: 12px 20px;
    border-left: 3px solid #d6d3d1;
    background: #f5f5f5;
    border-radius: 0 8px 8px 0;
    color: #777169;
    font-style: italic;
  }
  blockquote p:last-child { margin-bottom: 0; }

  code {
    font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
    font-size: 0.875em;
    padding: 2px 6px;
    background: #f0efed;
    border-radius: 4px;
    color: #292524;
  }

  pre {
    margin: 20px 0;
    padding: 20px;
    background: #0c0a09;
    border-radius: 12px;
    overflow-x: auto;
  }
  pre code {
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: 14px;
    line-height: 1.6;
    color: #ffffff;
  }

  hr {
    margin: 36px 0;
    border: none;
    border-top: 1px solid #e7e5e4;
  }

  table {
    width: 100%;
    margin: 20px 0;
    border-collapse: collapse;
    font-size: 15px;
  }
  th, td {
    padding: 10px 14px;
    border: 1px solid #e7e5e4;
    text-align: left;
  }
  th {
    background: #f0efed;
    font-weight: 500;
    color: #0c0a09;
  }

  img {
    max-width: 100%;
    border-radius: 8px;
    margin: 20px 0;
  }

  ::selection { background: #e7e5e4; }
`;

async function main() {
  const params = new URLSearchParams(location.search);
  const viewId = params.get('viewId');
  if (!viewId) {
    document.getElementById('root')!.textContent = '无效链接';
    return;
  }

  const key = `markdown:${viewId}`;
  const { [key]: content } = await browser.storage.local.get(key);
  if (!content) {
    document.getElementById('root')!.textContent = '内容已过期或不存在';
    return;
  }

  document.title = 'Markdown Preview';

  const styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  const html = await marked(content as string);
  document.getElementById('root')!.innerHTML = `<div class="container">${html}</div>`;

  await browser.storage.local.remove(key);
}

main();
