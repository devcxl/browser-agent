import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initBackground } from '../index';
import { getAdapter, resetAdapter } from '@/adapters';

// Mock the adapter module
vi.mock('@/adapters', () => ({
  getAdapter: vi.fn(),
  resetAdapter: vi.fn(),
}));

describe('Background initialization', () => {
  beforeEach(() => {
    (globalThis as any).browser = {
      runtime: {
        onConnect: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    };

    const mockAdapter = {
      browserType: 'chrome',
      tabs: {
        query: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        move: vi.fn(),
        group: vi.fn(),
        ungroup: vi.fn(),
        getCurrent: vi.fn(),
        reload: vi.fn(),
        duplicate: vi.fn(),
        highlight: vi.fn(),
      },
      windows: {
        getAll: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        getCurrent: vi.fn(),
        getLastFocused: vi.fn(),
      },
      tabGroups: {
        query: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        update: vi.fn(),
        move: vi.fn(),
      },
      addListener: vi.fn().mockReturnValue(() => {}),
    };

    (getAdapter as any).mockReturnValue(mockAdapter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize router, eventHub, and register RPC methods', () => {
    const { router, eventHub, destroy } = initBackground();

    expect(router).toBeDefined();
    expect(eventHub).toBeDefined();

    // Check that runtime.onConnect listener was registered
    expect(browser.runtime.onConnect.addListener).toHaveBeenCalled();

    destroy();
  });

  it('should clean up on destroy', () => {
    const { destroy } = initBackground();

    destroy();

    expect(browser.runtime.onConnect.removeListener).toHaveBeenCalled();
  });
});
