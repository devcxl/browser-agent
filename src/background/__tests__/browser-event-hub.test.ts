import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserEventHub } from '../browser-event-hub';
import { BrowserEvent } from '@/adapters/types';
import type { IBrowserAdapter } from '@/adapters/types';
import type { BrowserState } from '@/shared/types';

function createMockAdapter(): IBrowserAdapter {
  const mockTab = { id: 1, title: 'test', index: 0, windowId: 1, groupId: -1, active: true, pinned: false, discarded: false, incognito: false };
  const mockWindow = { id: 1, focused: true, incognito: false, alwaysOnTop: false };
  const mockGroup = { id: 1, collapsed: false, color: 'blue' as const, windowId: 1 };

  return {
    browserType: 'chrome',
    tabs: {
      query: vi.fn().mockResolvedValue([mockTab]),
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
      getAll: vi.fn().mockResolvedValue([mockWindow]),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      getCurrent: vi.fn(),
      getLastFocused: vi.fn(),
    },
    tabGroups: {
      query: vi.fn().mockResolvedValue([mockGroup]),
      get: vi.fn(),
      update: vi.fn(),
      move: vi.fn(),
    },
    addListener: vi.fn().mockReturnValue(() => {}),
  } as unknown as IBrowserAdapter;
}

describe('BrowserEventHub', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should register listeners for all browser events on start', () => {
    const adapter = createMockAdapter();
    const hub = new BrowserEventHub(adapter);

    hub.start();

    // Chrome events: 7 tabs + 3 windows + 2 tabGroups = 12
    expect(adapter.addListener).toHaveBeenCalledTimes(12);
  });

  it('should not register tabGroups events for firefox', () => {
    const adapter = createMockAdapter();
    Object.defineProperty(adapter, 'browserType', { value: 'firefox' });
    const hub = new BrowserEventHub(adapter);

    hub.start();

    // Firefox events: 7 tabs + 3 windows = 10 (no tabGroups)
    expect(adapter.addListener).toHaveBeenCalledTimes(10);
  });

  it('should debounce multiple events within 500ms', () => {
    const adapter = createMockAdapter();
    const hub = new BrowserEventHub(adapter);

    // Capture the listener registered for TAB_CREATED
    const listeners: Array<() => void> = [];
    (adapter.addListener as any).mockImplementation((_event: BrowserEvent, cb: () => void) => {
      listeners.push(cb);
      return () => {};
    });

    hub.start();

    // Trigger 3 events in quick succession
    listeners[0]!(); // TAB_CREATED
    listeners[1]!(); // TAB_UPDATED
    listeners[0]!(); // TAB_CREATED again

    // syncState should not have been called yet (debounce pending)
    expect(adapter.tabs.query).not.toHaveBeenCalled();

    // Fast-forward 500ms
    vi.advanceTimersByTime(500);

    // syncState should have been called exactly once
    expect(adapter.tabs.query).toHaveBeenCalledTimes(1);
  });

  it('should push BrowserState after debounce', async () => {
    const adapter = createMockAdapter();
    const hub = new BrowserEventHub(adapter);

    const listeners: Array<() => void> = [];
    (adapter.addListener as any).mockImplementation((_event: BrowserEvent, cb: () => void) => {
      listeners.push(cb);
      return () => {};
    });

    hub.start();

    const onStateChanged = vi.fn();
    hub.onStateChanged(onStateChanged);

    // Trigger an event
    listeners[0]!();
    await vi.advanceTimersByTimeAsync(500);

    expect(onStateChanged).toHaveBeenCalledTimes(1);
    const state: BrowserState = onStateChanged.mock.calls[0]![0] as BrowserState;
    expect(state.tabs).toHaveLength(1);
    expect(state.windows).toHaveLength(1);
    expect(state.tabGroups).toHaveLength(1);
    expect(state.capturedAt).toBeGreaterThan(0);
  });

  it('should not push state when no callback registered', () => {
    const adapter = createMockAdapter();
    const hub = new BrowserEventHub(adapter);

    const listeners: Array<() => void> = [];
    (adapter.addListener as any).mockImplementation((_event: BrowserEvent, cb: () => void) => {
      listeners.push(cb);
      return () => {};
    });

    hub.start();

    listeners[0]!();
    vi.advanceTimersByTime(500);

    // No callback, but syncState still runs internally (tabs.query should be called)
    expect(adapter.tabs.query).toHaveBeenCalledTimes(1);
  });

  it('should stop event listeners', () => {
    const adapter = createMockAdapter();
    const hub = new BrowserEventHub(adapter);

    const cleanupFns: Array<() => void> = [];
    (adapter.addListener as any).mockImplementation((_event: BrowserEvent, _cb: () => void) => {
      const cleanup = vi.fn();
      cleanupFns.push(cleanup);
      return cleanup;
    });

    hub.start();
    hub.stop();

    expect(cleanupFns.length).toBeGreaterThan(0);
    for (const cleanup of cleanupFns) {
      expect(cleanup).toHaveBeenCalled();
    }
  });
});
