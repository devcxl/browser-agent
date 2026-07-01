import type { IBrowserAdapter } from '@/adapters/types';

export class DnrProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async getDynamicRules() {
    return this.adapter.declarativeNetRequest.getDynamicRules();
  }

  async addDynamicRules(p: { rules: chrome.declarativeNetRequest.Rule[] }) {
    await this.adapter.declarativeNetRequest.addDynamicRules(p.rules);
  }

  async removeDynamicRules(p: { ruleIds: number[] }) {
    await this.adapter.declarativeNetRequest.removeDynamicRules(p.ruleIds);
  }
}
