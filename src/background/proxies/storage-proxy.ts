import type { IBrowserAdapter } from '@/adapters/types';

/**
 * Storage Proxy
 * 处理 chrome.storage.local 的 get/set/remove 操作
 */
export class StorageProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async get(params: { keys?: string | string[] }) {
    return this.adapter.storage.local.get(params?.keys);
  }

  async set(params: { items: Record<string, unknown> }) {
    await this.adapter.storage.local.set(params.items);
    return { success: true };
  }

  async remove(params: { keys?: string | string[] }) {
    await this.adapter.storage.local.remove(params.keys ?? []);
    return { success: true };
  }
}
