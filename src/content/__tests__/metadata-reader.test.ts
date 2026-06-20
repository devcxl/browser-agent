import { describe, it, expect, beforeEach } from 'vitest';
import { MetadataReader } from '../metadata-reader';

describe('MetadataReader', () => {
  let reader: MetadataReader;

  beforeEach(() => {
    reader = new MetadataReader();
    // 清除已有的 meta 标签
    document.querySelectorAll('meta').forEach((el) => el.remove());
  });

  it('should return metadata with title, url, description and ogImage', () => {
    document.title = 'Test Document';
    // window.location.href 在 jsdom 中默认是 'about:blank'
    // 添加 meta 标签
    const descMeta = document.createElement('meta');
    descMeta.setAttribute('name', 'description');
    descMeta.setAttribute('content', 'A test description');
    document.head.appendChild(descMeta);

    const ogImageMeta = document.createElement('meta');
    ogImageMeta.setAttribute('property', 'og:image');
    ogImageMeta.setAttribute('content', 'https://example.com/image.jpg');
    document.head.appendChild(ogImageMeta);

    const result = reader.getMetadata();

    expect(result.title).toBe('Test Document');
    expect(result.url).toBe(window.location.href);
    expect(result.description).toBe('A test description');
    expect(result.ogImage).toBe('https://example.com/image.jpg');
  });

  it('should return null for description and ogImage when meta tags are absent', () => {
    document.title = 'No Meta Page';

    const result = reader.getMetadata();

    expect(result.title).toBe('No Meta Page');
    expect(result.url).toBeDefined();
    expect(result.description).toBeNull();
    expect(result.ogImage).toBeNull();
  });

  it('should prioritize meta[name] over meta[property] for description', () => {
    // meta[name="description"] 应该优先于 meta[property="og:description"]
    const nameMeta = document.createElement('meta');
    nameMeta.setAttribute('name', 'description');
    nameMeta.setAttribute('content', 'from name');
    document.head.appendChild(nameMeta);

    const propMeta = document.createElement('meta');
    propMeta.setAttribute('property', 'og:description');
    propMeta.setAttribute('content', 'from property');
    document.head.appendChild(propMeta);

    const result = reader.getMetadata();

    expect(result.description).toBe('from name');
  });
});
