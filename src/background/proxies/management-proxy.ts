import type { IBrowserAdapter } from '@/adapters/types';

export class ManagementProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async getAll() {
    return this.adapter.management.getAll();
  }

  async get(p: { id: string }) {
    return this.adapter.management.get(p.id);
  }

  async setEnabled(p: { id: string; enabled: boolean }) {
    await this.adapter.management.setEnabled(p.id, p.enabled);
  }
}
