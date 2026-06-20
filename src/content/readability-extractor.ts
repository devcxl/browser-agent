import { Readability } from '@mozilla/readability';
import type { PageContent } from './types';

const EXTRACT_TIMEOUT_MS = 30_000;

export class ReadabilityExtractor {
  async extract(): Promise<PageContent> {
    const doc = document.cloneNode(true) as Document;

    return new Promise<PageContent>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const partial = this.tryExtract(doc);
        if (partial) {
          resolve(partial);
        } else {
          reject(new Error('提取超时'));
        }
      }, EXTRACT_TIMEOUT_MS);

      try {
        const result = this.tryExtract(doc);
        clearTimeout(timeoutId);

        if (result) {
          resolve(result);
        } else {
          resolve(this.fallbackContent());
        }
      } catch (e) {
        clearTimeout(timeoutId);
        reject(e);
      }
    });
  }

  private tryExtract(doc: Document): PageContent | null {
    const article = new Readability(doc).parse();
    if (!article) return null;

    return {
      title: article.title ?? '',
      textContent: article.textContent ?? '',
      excerpt: article.excerpt ?? '',
      byline: article.byline ?? null,
      siteName: article.siteName ?? null,
    };
  }

  private fallbackContent(): PageContent {
    const bodyText = document.body?.textContent ?? '';
    return {
      title: document.title,
      textContent: bodyText.slice(0, 5000),
      excerpt: bodyText.slice(0, 200),
      byline: null,
      siteName: null,
    };
  }
}
