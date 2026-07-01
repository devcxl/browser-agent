import type { IBrowserAdapter } from '@/adapters/types';

export class PrivacyProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async getNetworkSettings() {
    return this.adapter.privacy.getNetworkSettings();
  }

  async setNetworkSetting(p: { key: string; value: unknown }) {
    await this.adapter.privacy.setNetworkSetting(p.key, p.value);
  }
}
