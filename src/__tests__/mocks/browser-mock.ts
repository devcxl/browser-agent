import { vi } from 'vitest';

export function createBrowserMock() {
  return {
    tabs: {
      query: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      move: vi.fn(),
      group: vi.fn(),
      ungroup: vi.fn(),
    },
    windows: {
      getAll: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      getCurrent: vi.fn(),
      getLastFocused: vi.fn(),
    },
    storage: { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } },
    runtime: {
      connect: vi.fn(() => ({
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
      })),
    },
  };
}
