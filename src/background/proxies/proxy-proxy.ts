import type { IBrowserAdapter } from '@/adapters/types';

export class ProxySettingsProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async getSettings() {
    return this.adapter.proxy.getSettings();
  }

  async setSettings(p: { value: Record<string, unknown> }) {
    await this.adapter.proxy.setSettings(p);
  }

  async clear() {
    await this.adapter.proxy.clear();
  }
}
