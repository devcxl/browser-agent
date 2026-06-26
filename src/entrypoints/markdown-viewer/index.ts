import { marked } from 'marked';

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

  const html = await marked(content as string);
  document.getElementById('root')!.innerHTML = html;

  await browser.storage.local.remove(key);
}

main();
