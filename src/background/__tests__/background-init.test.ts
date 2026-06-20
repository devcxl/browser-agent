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
      history: {
        search: vi.fn().mockResolvedValue([]),
        deleteUrl: vi.fn().mockResolvedValue(undefined),
        deleteRange: vi.fn().mockResolvedValue(undefined),
        deleteAll: vi.fn().mockResolvedValue(undefined),
      },
      notifications: {
        create: vi.fn().mockResolvedValue('notif-mock'),
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

  it('should handle notifications.create RPC method', async () => {
    const { router, destroy } = initBackground();

    const response = await router.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'notifications.create',
      params: { title: 'Test', message: 'Hello' },
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toBe('notif-mock');

    destroy();
  });
});
