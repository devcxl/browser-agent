import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockInitBackground = vi.fn(() => ({
  router: { handle: vi.fn() },
  eventHub: { onStateChanged: vi.fn(), start: vi.fn(), stop: vi.fn() },
  destroy: vi.fn(),
}));

vi.mock('@/background/index', () => ({
  initBackground: mockInitBackground,
}));

vi.mock('@/adapters', () => ({
  getAdapter: vi.fn(() => ({
    browserType: 'chrome',
    tabs: { query: vi.fn().mockResolvedValue([]), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), move: vi.fn(), group: vi.fn(), ungroup: vi.fn(), getCurrent: vi.fn(), reload: vi.fn(), duplicate: vi.fn(), highlight: vi.fn() },
    windows: { getAll: vi.fn().mockResolvedValue([]), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), getCurrent: vi.fn(), getLastFocused: vi.fn() },
    tabGroups: { query: vi.fn().mockResolvedValue([]), get: vi.fn(), update: vi.fn(), move: vi.fn() },
    addListener: vi.fn().mockReturnValue(() => {}),
  })),
}));

describe('Background entrypoint', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockInitBackground.mockClear();

    (globalThis as any).browser = {
      runtime: {
        onConnect: { addListener: vi.fn(), removeListener: vi.fn() },
        getURL: vi.fn((path: string) => path),
      },
      action: {
        onClicked: { addListener: vi.fn() },
      },
      tabs: { create: vi.fn() },
    };

    // Mock WXT's defineBackground global
    (globalThis as any).defineBackground = vi.fn((fn: () => void) => {
      fn();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).defineBackground;
  });

  it('should call initBackground to register all RPC methods', async () => {
    await import('@/entrypoints/background');

    expect(mockInitBackground).toHaveBeenCalledTimes(1);
  });

  it('should register browser.action.onClicked listener', async () => {
    const onClickedSpy = vi.fn();
    (globalThis as any).browser.action.onClicked.addListener = onClickedSpy;

    await import('@/entrypoints/background');

    expect(onClickedSpy).toHaveBeenCalledTimes(1);
  });
});
