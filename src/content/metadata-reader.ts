import type { PageMetadata } from './types';

export class MetadataReader {
  getMetadata(): PageMetadata {
    const getMeta = (name: string): string | null => {
      const byName = document.querySelector(`meta[name="${name}"]`);
      if (byName) return byName.getAttribute('content');

      const byProp = document.querySelector(`meta[property="og:${name}"]`);
      if (byProp) return byProp.getAttribute('content');

      return null;
    };

    return {
      title: document.title,
      url: window.location.href,
      description: getMeta('description'),
      ogImage: getMeta('image'),
    };
  }
}
