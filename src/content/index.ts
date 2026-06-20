import { ReadabilityExtractor } from './readability-extractor';
import { SelectionReader } from './selection-reader';
import { MetadataReader } from './metadata-reader';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const readability = new ReadabilityExtractor();
    const selection = new SelectionReader();
    const metadata = new MetadataReader();

    browser.runtime.onConnect.addListener((port) => {
      if (port.name !== 'content-script-bridge') return;

      port.onMessage.addListener(async (message: any) => {
        const { id, method, params } = message;

        try {
          let result: any;

          switch (method) {
            case 'page.getContent':
              result = await readability.extract();
              break;
            case 'page.getSelection':
              result = selection.getSelection();
              break;
            case 'page.getMetadata':
              result = metadata.getMetadata();
              break;
            default:
              throw new Error(`未知方法: ${method}`);
          }

          port.postMessage({ jsonrpc: '2.0', id, result });
        } catch (err) {
          port.postMessage({
            jsonrpc: '2.0',
            id,
            error: { code: -32603, message: (err as Error).message },
          });
        }
      });
    });
  },
});
