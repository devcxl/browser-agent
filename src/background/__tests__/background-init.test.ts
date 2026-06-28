import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initBackground } from '../index';
import { getAdapter } from '@/adapters';

const contentBridgeMocks = vi.hoisted(() => ({
  sendToContent: vi.fn(),
}));

vi.mock('../content-bridge', () => ({
  ContentBridge: vi.fn().mockImplementation(() => ({
    sendToContent: contentBridgeMocks.sendToContent,
  })),
}));

// Mock the adapter module
vi.mock('@/adapters', () => ({
  getAdapter: vi.fn(),
  resetAdapter: vi.fn(),
}));

describe('Background initialization', () => {
  beforeEach(() => {
    contentBridgeMocks.sendToContent.mockReset();

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
    vi.clearAllMocks();
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

  it('should handle history.search RPC method', async () => {
    const { router, destroy } = initBackground();
    const mockItems = [{ id: '1', url: 'https://example.com', title: 'Example' }];
    (getAdapter() as any).history.search.mockResolvedValue(mockItems);

    const response = await router.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'history.search',
      params: { text: 'test', maxResults: 10 },
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toEqual(mockItems);
    destroy();
  });

  it('should handle history.delete RPC method', async () => {
    const { router, destroy } = initBackground();

    const response = await router.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'history.delete',
      params: { url: 'https://example.com' },
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({ success: true });
    destroy();
  });

  it('should handle history.deleteAll RPC method', async () => {
    const { router, destroy } = initBackground();

    const response = await router.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'history.deleteAll',
      params: {},
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({ success: true });
    destroy();
  });

  it('should handle content.execute RPC method with provided tabId', async () => {
    contentBridgeMocks.sendToContent.mockResolvedValue({ title: 'Example' });
    const { router, destroy } = initBackground();

    const response = await router.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'content.execute',
      params: { tabId: 5, method: 'page.getMetadata', params: {} },
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({ title: 'Example' });
    expect(contentBridgeMocks.sendToContent).toHaveBeenCalledWith(5, 'page.getMetadata', {});
    destroy();
  });

  it('should use current active tab when content.execute has no tabId', async () => {
    contentBridgeMocks.sendToContent.mockResolvedValue({ text: 'selected' });
    const adapter = getAdapter() as any;
    adapter.tabs.query.mockResolvedValue([{ id: 7 }]);
    const { router, destroy } = initBackground();

    const response = await router.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'content.execute',
      params: { method: 'page.getSelection', params: {} },
    });

    expect(response.error).toBeUndefined();
    expect(adapter.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(contentBridgeMocks.sendToContent).toHaveBeenCalledWith(7, 'page.getSelection', {});
    destroy();
  });
});
