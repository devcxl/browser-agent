import type { IBrowserAdapter } from '@/adapters/types';

export class IdentityProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async getAuthToken(p?: { interactive?: boolean; account?: { id: string } }) {
    return this.adapter.identity.getAuthToken(p);
  }

  async clearCachedToken(p: { token: string }) {
    await this.adapter.identity.removeCachedToken(p.token);
  }
}
