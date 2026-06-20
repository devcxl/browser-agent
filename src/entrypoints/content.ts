// 内容脚本入口 —— 委托到 content/index.ts
import contentMain from '../content/index';

export default defineContentScript({
  matches: ['<all_urls>'],
  main: contentMain,
});
