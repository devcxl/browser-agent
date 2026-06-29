import { vi } from 'vitest';
import { ConfigStore } from '@/shared/storage';

export function mockBrowserStorage() {
  const storage: Record<string, unknown> = {};

  const local = {
    get: vi.fn(async (keys: string | string[] | Record<string, unknown> | null) => {
      if (keys === null) return { ...storage };
      const keysArr = Array.isArray(keys) ? (keys as string[]) : [keys as string];
      const result: Record<string, unknown> = {};
      for (const key of keysArr) {
        if (key in storage) result[key] = storage[key];
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(storage, items);
    }),
    remove: vi.fn(),
    clear: vi.fn(),
  };

  const onChanged = {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };

  vi.stubGlobal('browser', {
    storage: { local, onChanged },
    runtime: {
      connect: vi.fn(),
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onConnect: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });

  ConfigStore.resetInstance();

  return { local, storage };
}
