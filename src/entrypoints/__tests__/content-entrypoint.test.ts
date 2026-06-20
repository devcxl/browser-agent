import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Content entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as any).defineContentScript = vi.fn((config) => config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).defineContentScript;
  });

  it('should export a runnable content script main function', async () => {
    const entrypoint = await import('@/entrypoints/content');

    expect(typeof entrypoint.default.main).toBe('function');
  });
});
